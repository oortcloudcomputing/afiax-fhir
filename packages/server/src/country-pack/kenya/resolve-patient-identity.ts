// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  buildKenyaPatientIdentityExtension,
  createReference,
  KenyaClientRegistryIdSystem,
  KenyaPatientIdentityCorrelationIdSystem,
  normalizeErrorString,
  type PatientIdentityStatus,
} from '@medplum/core';
import type { Patient, Project, Reference, Task } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import {
  AuditEventOutcome,
  createAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import { getKenyaAfyaLinkCredentials, searchAfyaLinkClientRegistry, type KenyaAfyaLinkCredentials } from './afyalink';

export interface PatientIdentityInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly patient: Patient & { id: string };
  readonly identificationType: string;
  readonly identificationNumber: string;
  readonly correlationId: string;
}

export interface PatientIdentityResult {
  readonly status: PatientIdentityStatus;
  readonly correlationId: string;
  readonly patientId: string;
  readonly identificationType: string;
  readonly identificationNumber: string;
  readonly clientRegistryId: string | null;
  readonly fullName: string | null;
  readonly dateOfBirth: string | null;
  readonly gender: string | null;
  readonly resolvedAt: string;
  readonly message: string;
  readonly task?: Reference<Task>;
}

export async function handleResolvePatientIdentity(input: PatientIdentityInput): Promise<PatientIdentityResult> {
  const { ctx, patient, identificationType, identificationNumber, correlationId } = input;
  const resolvedAt = new Date().toISOString();

  let credentials: KenyaAfyaLinkCredentials;
  try {
    const project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id as string);
    credentials = getKenyaAfyaLinkCredentials(project);
  } catch (err) {
    await writeAuditEvent(ctx, patient, correlationId, AuditEventOutcome.MajorFailure);
    return errorResult(correlationId, patient.id, identificationType, identificationNumber, resolvedAt, normalizeErrorString(err));
  }

  let clientRegistryId: string | null = null;
  let fullName: string | null = null;
  let dateOfBirth: string | null = null;
  let gender: string | null = null;
  let status: PatientIdentityStatus;
  let message: string;

  try {
    const response = await searchAfyaLinkClientRegistry(credentials, identificationType, identificationNumber);
    const msg = response.message;
    const found = typeof msg?.found === 'number' ? msg.found : 0;

    if (found === 1 && msg?.client_registry_id) {
      clientRegistryId = msg.client_registry_id;
      fullName = msg.full_name ?? (msg.first_name && msg.last_name ? `${msg.first_name} ${msg.last_name}` : null);
      dateOfBirth = msg.date_of_birth ?? null;
      gender = msg.gender ?? null;
      status = 'resolved';
      message = `Patient identity resolved. DHA Client Registry ID: ${clientRegistryId}`;
    } else {
      status = 'not-found';
      message = `No patient found in DHA Client Registry for ${identificationType} ${identificationNumber}.`;
    }
  } catch (err) {
    await writeAuditEvent(ctx, patient, correlationId, AuditEventOutcome.MajorFailure);
    return errorResult(correlationId, patient.id, identificationType, identificationNumber, resolvedAt, normalizeErrorString(err));
  }

  // Persist identity snapshot on the Patient
  const updatedPatient = await persistPatientIdentityExtension(
    ctx,
    patient,
    status,
    identificationType,
    identificationNumber,
    resolvedAt,
    correlationId,
    clientRegistryId ?? undefined,
    fullName ?? undefined,
    dateOfBirth ?? undefined,
    gender ?? undefined
  );

  // Persist Client Registry ID as a Patient identifier
  if (clientRegistryId) {
    await persistClientRegistryIdentifier(ctx, updatedPatient, clientRegistryId, correlationId);
  }

  // Create Task
  const task = await ctx.systemRepo.createResource({
    resourceType: 'Task',
    meta: { project: ctx.project.id },
    status: status === 'resolved' ? 'completed' : 'rejected',
    intent: 'order',
    code: { coding: [{ system: 'https://afiax.africa/fhir/CodeSystem/kenya-task-type', code: 'patient-identity-resolution' }] },
    for: createReference(patient),
    identifier: [{ system: KenyaPatientIdentityCorrelationIdSystem, value: correlationId }],
    note: [{ text: message }],
  });

  await writeAuditEvent(ctx, patient, correlationId, status === 'resolved' ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure);

  return {
    status,
    correlationId,
    patientId: patient.id,
    identificationType,
    identificationNumber,
    clientRegistryId,
    fullName,
    dateOfBirth,
    gender,
    resolvedAt,
    message,
    task: createReference(task),
  };
}

async function persistPatientIdentityExtension(
  ctx: AuthenticatedRequestContext,
  patient: Patient & { id: string },
  status: PatientIdentityStatus,
  identificationType: string,
  identificationNumber: string,
  resolvedAt: string,
  correlationId: string,
  clientRegistryId?: string,
  fullName?: string,
  dateOfBirth?: string,
  gender?: string
): Promise<Patient & { id: string }> {
  const ext = buildKenyaPatientIdentityExtension(
    status,
    identificationType,
    identificationNumber,
    resolvedAt,
    correlationId,
    clientRegistryId,
    fullName,
    dateOfBirth,
    gender
  );
  const otherExtensions = (patient.extension ?? []).filter((e) => e.url !== ext.url);
  return ctx.systemRepo.updateResource<Patient>({
    ...patient,
    extension: [...otherExtensions, ext],
  });
}

async function persistClientRegistryIdentifier(
  ctx: AuthenticatedRequestContext,
  patient: Patient & { id: string },
  clientRegistryId: string,
  correlationId: string
): Promise<void> {
  const otherIdentifiers = (patient.identifier ?? []).filter((id) => id.system !== KenyaClientRegistryIdSystem);
  await ctx.systemRepo.updateResource<Patient>({
    ...patient,
    identifier: [
      ...otherIdentifiers,
      {
        system: KenyaClientRegistryIdSystem,
        value: clientRegistryId,
        assigner: { display: 'DHA Client Registry' },
        use: 'official',
        period: { start: new Date().toISOString().slice(0, 10) },
      },
    ],
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
    { description: `Patient identity resolution (correlationId: ${correlationId})` }
  );
  auditEvent.entity = [...(auditEvent.entity ?? []), { what: createReference(patient) }];
  await ctx.systemRepo.createResource(auditEvent);
}

function errorResult(
  correlationId: string,
  patientId: string,
  identificationType: string,
  identificationNumber: string,
  resolvedAt: string,
  errorMessage: string
): PatientIdentityResult {
  return {
    status: 'error',
    correlationId,
    patientId,
    identificationType,
    identificationNumber,
    clientRegistryId: null,
    fullName: null,
    dateOfBirth: null,
    gender: null,
    resolvedAt,
    message: `Patient identity resolution failed: ${errorMessage}`,
  };
}
