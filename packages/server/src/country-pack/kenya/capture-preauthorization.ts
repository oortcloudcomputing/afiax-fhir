// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  buildKenyaPrivateInsurancePreauthorizationExtension,
  createReference,
  normalizeErrorString,
} from '@medplum/core';
import type { AuditEvent, Claim, ClaimResponse, Coverage, Organization, Reference, Task } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';

export interface CapturePreauthorizationInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly coverage: Coverage & { id: string };
  readonly insurerOrganization: Organization & { id: string };
  readonly preauthorizationCode: string;
  readonly approvedAmount: number;
  readonly currency: string;
  readonly validFrom?: string;
  readonly validTo?: string;
  readonly approvedProcedures?: string;
  readonly notes?: string;
  readonly correlationId: string;
}

export interface CapturePreauthorizationResult {
  readonly status: 'captured' | 'error';
  readonly correlationId: string;
  readonly preauthorizationCode: string;
  readonly approvedAmount: number;
  readonly currency: string;
  readonly insurerName: string;
  readonly validFrom?: string;
  readonly validTo?: string;
  readonly message: string;
  readonly claimReference?: Reference<Claim>;
  readonly claimResponseReference?: Reference<ClaimResponse>;
  readonly task?: Reference<Task>;
}

export async function handleCapturePreauthorization(
  input: CapturePreauthorizationInput
): Promise<CapturePreauthorizationResult> {
  const { ctx, coverage, insurerOrganization, preauthorizationCode, approvedAmount, currency, correlationId } = input;
  const capturedAt = new Date().toISOString();
  const insurerName = insurerOrganization.name ?? `Organization/${insurerOrganization.id}`;

  try {
    // Create Claim (use: preauthorization) as the canonical preauth request record.
    const preAuthClaim = await ctx.systemRepo.createResource<Claim>({
      resourceType: 'Claim',
      meta: { project: ctx.project.id },
      status: 'active',
      use: 'preauthorization',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
      patient: coverage.beneficiary,
      created: capturedAt,
      insurer: createReference(insurerOrganization),
      provider: ctx.profile as Claim['provider'],
      priority: { coding: [{ code: 'normal' }] },
      insurance: [{ sequence: 1, focal: true, coverage: createReference(coverage) }],
      identifier: [{ system: 'https://afiax.africa/kenya/identifier/private-preauth-code', value: preauthorizationCode }],
      total: { value: approvedAmount, currency: currency as 'KES' | 'USD' | 'EUR' },
    });

    // Create ClaimResponse (use: preauthorization) capturing the insurer's approval.
    const preAuthClaimResponse = await ctx.systemRepo.createResource<ClaimResponse>({
      resourceType: 'ClaimResponse',
      meta: { project: ctx.project.id },
      status: 'active',
      use: 'preauthorization',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
      patient: coverage.beneficiary,
      created: capturedAt,
      insurer: createReference(insurerOrganization),
      request: createReference(preAuthClaim),
      outcome: 'complete',
      disposition: input.notes ?? `Pre-authorization approved by ${insurerName}`,
      preAuthRef: preauthorizationCode,
      payment: {
        type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/ex-paymenttype', code: 'complete' }] },
        date: input.validFrom ?? capturedAt.slice(0, 10),
        amount: { value: approvedAmount, currency: currency as 'KES' | 'USD' | 'EUR' },
      },
      identifier: [{ system: 'https://afiax.africa/kenya/identifier/private-preauth-code', value: preauthorizationCode }],
    });

    // Persist the preauth snapshot on Coverage.extension.
    const ext = buildKenyaPrivateInsurancePreauthorizationExtension({
      insurerReference: `Organization/${insurerOrganization.id}`,
      insurerName,
      preauthorizationCode,
      approvedAmount,
      currency,
      validFrom: input.validFrom,
      validTo: input.validTo,
      approvedProcedures: input.approvedProcedures,
      notes: input.notes,
      capturedAt,
      claimReference: `Claim/${preAuthClaim.id}`,
      claimResponseReference: `ClaimResponse/${preAuthClaimResponse.id}`,
    });
    const otherExts = (coverage.extension ?? []).filter((e) => e.url !== ext.url);
    await ctx.systemRepo.updateResource<Coverage>({
      ...coverage,
      extension: [...otherExts, ext],
    });

    // Task.
    const task = await ctx.systemRepo.createResource<Task>({
      resourceType: 'Task',
      meta: { project: ctx.project.id },
      status: 'completed',
      intent: 'order',
      authoredOn: capturedAt,
      requester: ctx.profile as Task['requester'],
      focus: createReference(coverage),
      description: `Private insurer pre-authorization captured: ${preauthorizationCode} from ${insurerName}`,
      code: { coding: [{ system: 'https://afiax.africa/fhir/CodeSystem/kenya-task-type', code: 'private-preauthorization-capture' }] },
      businessStatus: { text: 'captured' },
      identifier: [{ system: 'https://afiax.africa/identifier/correlation-id', value: correlationId }],
    });

    await writeAuditEvent(ctx, coverage, task, correlationId, AuditEventOutcome.Success);

    return {
      status: 'captured',
      correlationId,
      preauthorizationCode,
      approvedAmount,
      currency,
      insurerName,
      validFrom: input.validFrom,
      validTo: input.validTo,
      message: `Pre-authorization ${preauthorizationCode} from ${insurerName} captured. Approved amount: ${currency} ${approvedAmount}.`,
      claimReference: createReference(preAuthClaim),
      claimResponseReference: createReference(preAuthClaimResponse),
      task: createReference(task),
    };
  } catch (err) {
    await writeAuditEvent(ctx, coverage, undefined, correlationId, AuditEventOutcome.MajorFailure);
    return {
      status: 'error',
      correlationId,
      preauthorizationCode,
      approvedAmount,
      currency,
      insurerName,
      message: `Pre-authorization capture failed: ${normalizeErrorString(err)}`,
    };
  }
}

async function writeAuditEvent(
  ctx: AuthenticatedRequestContext,
  coverage: Coverage & { id: string },
  task: (Task & { id: string }) | undefined,
  correlationId: string,
  outcome: AuditEventOutcome
): Promise<void> {
  const auditEvent = createAuditEvent(
    RestfulOperationType,
    OperationInteraction,
    ctx.project.id,
    ctx.profile,
    undefined,
    outcome,
    { description: `Private insurer pre-authorization capture (correlationId: ${correlationId})` }
  );
  auditEvent.entity = [
    ...(auditEvent.entity ?? []),
    { what: createReference(coverage) },
    ...(task ? [{ what: createReference(task) }] : []),
  ];
  const saved = await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
  logAuditEvent(saved);
}
