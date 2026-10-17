// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  addPaymentToErpNextSnapshot,
  buildKenyaErpNextSubmissionExtension,
  createReference,
  getKenyaErpNextSubmissionSnapshot,
  getKenyaInsuranceType,
  normalizeErrorString,
  type KenyaErpNextPayerType,
} from '@medplum/core';
import type { AuditEvent, Claim, ClaimResponse, Organization, Project, Reference, Task } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { globalLogger } from '../../logger';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import { createErpNextPaymentEntry, getKenyaErpNextCredentials, hasKenyaErpNextCredentials } from './erpnext';

export interface RecordInsurancePaymentInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly claim: Claim & { id: string };
  readonly insurerOrganization: Organization & { id: string };
  readonly approvalCode: string;
  readonly approvedAmount: number;
  readonly currency: string;
  readonly notes?: string;
  readonly correlationId: string;
  readonly project: Project & { id: string };
}

export interface RecordInsurancePaymentResult {
  readonly status: 'recorded' | 'recorded-erpnext-failed' | 'error';
  readonly correlationId: string;
  readonly approvedAmount: number;
  readonly currency: string;
  readonly insurerName: string;
  readonly patientDue?: number;
  readonly message: string;
  readonly erpNextPaymentEntry?: string;
  readonly claimResponseReference?: Reference<ClaimResponse>;
  readonly task?: Reference<Task>;
}

export async function handleRecordInsurancePayment(
  input: RecordInsurancePaymentInput
): Promise<RecordInsurancePaymentResult> {
  const { ctx, claim, insurerOrganization, approvalCode, approvedAmount, currency, correlationId, project } = input;
  const recordedAt = new Date().toISOString();
  const insurerName = insurerOrganization.name ?? `Organization/${insurerOrganization.id}`;
  // Map KenyaInsuranceType → KenyaErpNextPayerType (sha excluded — use 'other' for private-manual/unknown).
  const insuranceType = getKenyaInsuranceType(insurerOrganization);
  const payerType: KenyaErpNextPayerType =
    insuranceType && insuranceType !== 'sha' && insuranceType !== 'private-manual' ? insuranceType : 'other';

  try {
    // Create the insurer ClaimResponse — the FHIR record of this approval is always authoritative.
    const claimResponse = await ctx.systemRepo.createResource<ClaimResponse>({
      resourceType: 'ClaimResponse',
      meta: { project: ctx.project.id },
      status: 'active',
      use: 'claim',
      type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
      patient: claim.patient,
      created: recordedAt,
      insurer: createReference(insurerOrganization),
      request: createReference(claim),
      outcome: 'complete',
      disposition: input.notes ?? `Payment approved by ${insurerName}. Approval code: ${approvalCode}`,
      preAuthRef: approvalCode,
      payment: {
        type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/ex-paymenttype', code: 'complete' }] },
        date: recordedAt.slice(0, 10),
        amount: { value: approvedAmount, currency: currency as 'KES' | 'USD' | 'EUR' },
      },
      identifier: [{ system: 'https://afiax.africa/kenya/identifier/insurer-approval-code', value: approvalCode }],
    });

    // Attempt ERPNext Payment Entry — fail gracefully so FHIR is never blocked.
    let erpNextPaymentEntry: string | undefined;
    let erpNextFailed = false;
    const snapshot = getKenyaErpNextSubmissionSnapshot(claim);

    if (snapshot?.invoiceName && hasKenyaErpNextCredentials(project)) {
      try {
        const credentials = getKenyaErpNextCredentials(project);
        const entry = await createErpNextPaymentEntry(credentials, {
          invoiceName: snapshot.invoiceName,
          amount: approvedAmount,
          currency,
          modeOfPayment: 'Insurance Claims',
          partyName: insurerName,
          customFields: {
            custom_fhir_claim_id: `Claim/${claim.id}`,
            custom_fhir_claim_response_id: `ClaimResponse/${claimResponse.id}`,
            custom_insurer_approval_code: approvalCode,
          },
        });
        erpNextPaymentEntry = entry.paymentEntryName;
      } catch (err) {
        erpNextFailed = true;
        globalLogger.warn('ERPNext private insurer payment entry failed (non-blocking)', {
          claimId: claim.id,
          insurerName,
          error: normalizeErrorString(err),
        });
      }
    }

    // Update the Claim ERPNext snapshot — only include the payment if we have an ERPNext entry name.
    const currentSnapshot = snapshot ?? {};
    const updatedSnapshot = erpNextPaymentEntry
      ? addPaymentToErpNextSnapshot(currentSnapshot, {
          payerType,
          payerName: insurerName,
          paymentEntryName: erpNextPaymentEntry,
          amount: approvedAmount,
          currency,
          modeOfPayment: 'private-insurance',
          confirmedAt: recordedAt,
        })
      : currentSnapshot;

    const ext = buildKenyaErpNextSubmissionExtension(updatedSnapshot);
    const otherExts = (claim.extension ?? []).filter((e) => e.url !== ext.url);
    await ctx.systemRepo.updateResource<Claim>({
      ...claim,
      extension: [...otherExts, ext],
    });

    const task = await ctx.systemRepo.createResource<Task>({
      resourceType: 'Task',
      meta: { project: ctx.project.id },
      status: 'completed',
      intent: 'order',
      authoredOn: recordedAt,
      requester: ctx.profile as Task['requester'],
      focus: createReference(claim),
      description: `Private insurer payment recorded: ${insurerName} approved ${currency} ${approvedAmount} (code: ${approvalCode})`,
      code: { coding: [{ system: 'https://afiax.africa/fhir/CodeSystem/kenya-task-type', code: 'private-insurance-payment' }] },
      businessStatus: { text: erpNextFailed ? 'recorded-erpnext-failed' : 'recorded' },
      identifier: [{ system: 'https://afiax.africa/identifier/correlation-id', value: correlationId }],
    });

    await writeAuditEvent(ctx, claim, task, correlationId, AuditEventOutcome.Success);

    const patientDue = updatedSnapshot.patientDue;

    return {
      status: erpNextFailed ? 'recorded-erpnext-failed' : 'recorded',
      correlationId,
      approvedAmount,
      currency,
      insurerName,
      patientDue,
      message: erpNextFailed
        ? `Payment by ${insurerName} recorded in FHIR. ERPNext sync failed — retry via $push-to-erpnext.`
        : `Payment by ${insurerName} recorded. Approved: ${currency} ${approvedAmount}. Patient due: ${currency} ${patientDue ?? 'unknown'}.`,
      erpNextPaymentEntry,
      claimResponseReference: createReference(claimResponse),
      task: createReference(task),
    };
  } catch (err) {
    await writeAuditEvent(ctx, claim, undefined, correlationId, AuditEventOutcome.MajorFailure);
    return {
      status: 'error',
      correlationId,
      approvedAmount,
      currency,
      insurerName,
      message: `Record insurance payment failed: ${normalizeErrorString(err)}`,
    };
  }
}

async function writeAuditEvent(
  ctx: AuthenticatedRequestContext,
  claim: Claim & { id: string },
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
    { description: `Private insurer payment record (correlationId: ${correlationId})` }
  );
  auditEvent.entity = [
    ...(auditEvent.entity ?? []),
    { what: createReference(claim) },
    ...(task ? [{ what: createReference(task) }] : []),
  ];
  const saved = await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
  logAuditEvent(saved);
}
