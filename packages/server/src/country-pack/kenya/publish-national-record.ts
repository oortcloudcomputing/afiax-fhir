// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  buildKenyaNationalRecordPublicationExtension,
  createReference,
  KenyaShrPublicationCorrelationIdSystem,
  normalizeErrorString,
  type NationalRecordPublicationStatus,
} from '@medplum/core';
import type { Bundle, BundleEntry, Condition, Encounter, Patient, Project, Reference, Task } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import {
  AuditEventOutcome,
  createAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import { getKenyaAfyaLinkCredentials, publishToAfyaLinkShr, type KenyaAfyaLinkCredentials } from './afyalink';

export interface PublishNationalRecordInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly patient: Patient & { id: string };
  readonly correlationId: string;
  readonly includeRecentEncounters?: boolean;
  readonly includeActiveConditions?: boolean;
}

export interface PublishNationalRecordResult {
  readonly status: NationalRecordPublicationStatus;
  readonly correlationId: string;
  readonly patientId: string;
  readonly publicationId: string | null;
  readonly endpoint: string | null;
  readonly publishedAt: string;
  readonly message: string;
  readonly bundleEntryCount: number;
  readonly task?: Reference<Task>;
}

export async function handlePublishNationalRecord(input: PublishNationalRecordInput): Promise<PublishNationalRecordResult> {
  const { ctx, patient, correlationId } = input;
  const publishedAt = new Date().toISOString();

  let credentials: KenyaAfyaLinkCredentials;
  try {
    const project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id as string);
    credentials = getKenyaAfyaLinkCredentials(project);
  } catch (err) {
    await writeAuditEvent(ctx, patient, correlationId, AuditEventOutcome.MajorFailure);
    return errorResult(correlationId, patient.id, publishedAt, normalizeErrorString(err));
  }

  const bundle = await buildPublicationBundle(ctx, patient, input);
  const bundleEntryCount = bundle.entry?.length ?? 0;
  const endpoint = `${credentials.baseUrl}/v1/shr/patient-record`;

  let publicationId: string | null = null;
  let status: NationalRecordPublicationStatus;
  let message: string;

  try {
    const response = await publishToAfyaLinkShr(credentials, bundle as unknown as Record<string, unknown>);
    publicationId = response.message?.record_id ?? null;
    status = 'published';
    message = publicationId
      ? `Patient record published to Kenya SHR. Publication ID: ${publicationId}. Bundle entries: ${bundleEntryCount}.`
      : `Patient record submitted to Kenya SHR. Bundle entries: ${bundleEntryCount}.`;
  } catch (err) {
    await writeAuditEvent(ctx, patient, correlationId, AuditEventOutcome.MajorFailure);
    return errorResult(correlationId, patient.id, publishedAt, normalizeErrorString(err), endpoint, bundleEntryCount);
  }

  // Persist publication snapshot on the Patient
  await persistPublicationExtension(ctx, patient, status, publishedAt, correlationId, message, publicationId ?? undefined, endpoint);

  // Create audit Task
  const task = await ctx.systemRepo.createResource({
    resourceType: 'Task',
    meta: { project: ctx.project.id },
    status: 'completed',
    intent: 'order',
    code: {
      coding: [{ system: 'https://afiax.africa/fhir/CodeSystem/kenya-task-type', code: 'national-record-publication' }],
    },
    for: createReference(patient),
    identifier: [{ system: KenyaShrPublicationCorrelationIdSystem, value: correlationId }],
    note: [{ text: message }],
  });

  await writeAuditEvent(ctx, patient, correlationId, AuditEventOutcome.Success);

  return { status, correlationId, patientId: patient.id, publicationId, endpoint, publishedAt, message, bundleEntryCount, task: createReference(task) };
}

async function buildPublicationBundle(
  ctx: AuthenticatedRequestContext,
  patient: Patient & { id: string },
  input: PublishNationalRecordInput
): Promise<Bundle> {
  const entries: BundleEntry[] = [{ resource: patient, fullUrl: `Patient/${patient.id}` }];

  if (input.includeActiveConditions) {
    try {
      const bundle = await ctx.repo.search<Condition>({
        resourceType: 'Condition',
        filters: [
          { code: 'patient', operator: 'eq', value: patient.id },
          { code: 'clinical-status', operator: 'eq', value: 'active' },
        ],
        count: 50,
      });
      for (const entry of bundle.entry ?? []) {
        const c = entry.resource;
        if (c?.id) {
          entries.push({ resource: c, fullUrl: `Condition/${c.id}` });
        }
      }
    } catch {
      // Non-fatal — publish Patient at minimum
    }
  }

  if (input.includeRecentEncounters) {
    try {
      const bundle = await ctx.repo.search<Encounter>({
        resourceType: 'Encounter',
        filters: [{ code: 'patient', operator: 'eq', value: patient.id }],
        sortRules: [{ code: 'date', descending: true }],
        count: 20,
      });
      for (const entry of bundle.entry ?? []) {
        const e = entry.resource;
        if (e?.id) {
          entries.push({ resource: e, fullUrl: `Encounter/${e.id}` });
        }
      }
    } catch {
      // Non-fatal — publish Patient at minimum
    }
  }

  return {
    resourceType: 'Bundle',
    type: 'document',
    timestamp: new Date().toISOString(),
    identifier: { system: KenyaShrPublicationCorrelationIdSystem, value: input.correlationId },
    entry: entries,
  };
}

async function persistPublicationExtension(
  ctx: AuthenticatedRequestContext,
  patient: Patient & { id: string },
  status: NationalRecordPublicationStatus,
  publishedAt: string,
  correlationId: string,
  message: string,
  publicationId?: string,
  endpoint?: string
): Promise<void> {
  const ext = buildKenyaNationalRecordPublicationExtension(
    status, publishedAt, correlationId, message, publicationId, endpoint
  );
  const otherExtensions = (patient.extension ?? []).filter((e) => e.url !== ext.url);
  await ctx.systemRepo.updateResource<Patient>({
    ...patient,
    extension: [...otherExtensions, ext],
  });
}

async function writeAuditEvent(
  ctx: AuthenticatedRequestContext,
  patient: Patient & { id: string },
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
    { description: `Kenya SHR national record publication (correlationId: ${correlationId})` }
  );
  auditEvent.entity = [...(auditEvent.entity ?? []), { what: createReference(patient) }];
  await ctx.systemRepo.createResource(auditEvent);
}

function errorResult(
  correlationId: string,
  patientId: string,
  publishedAt: string,
  errorMessage: string,
  endpoint?: string,
  bundleEntryCount?: number
): PublishNationalRecordResult {
  return {
    status: 'error',
    correlationId,
    patientId,
    publicationId: null,
    endpoint: endpoint ?? null,
    publishedAt,
    message: `SHR publication failed: ${errorMessage}`,
    bundleEntryCount: bundleEntryCount ?? 0,
  };
}
