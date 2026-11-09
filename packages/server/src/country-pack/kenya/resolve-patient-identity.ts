// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { PatientIdentityStatus } from '@medplum/core';
import {
  buildKenyaPatientIdentityExtension,
  createReference,
  forbidden,
  KenyaClientRegistryIdSystem,
  KenyaPatientIdentityCorrelationIdSystem,
  normalizeErrorString,
  OperationOutcomeError,
} from '@medplum/core';
import type { Patient, Project, Reference, Task } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { getKenyaAfyaLinkCredentials, searchAfyaLinkClientRegistry } from './afyalink';

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

/**
 * Resolves a Patient's identity against the DHA Client Registry and records the result.
 *
 * Staff (and integrations) see the registry's name, date of birth and gender. A patient signed in to
 * the portal (self-service) may only resolve their own record, the registry entry is accepted only if
 * its name and date of birth match that record, and no registry details are returned, so the
 * operation cannot be used to look other people up.
 * @param input - The patient, the ID to look up and the request context.
 * @returns The resolution result.
 */
export async function handleResolvePatientIdentity(input: PatientIdentityInput): Promise<PatientIdentityResult> {
  const { ctx, patient, identificationType, identificationNumber, correlationId } = input;
  const resolvedAt = new Date().toISOString();
  const callerType = ctx.profile.reference?.split('/')[0];
  const selfService = callerType === 'Patient';
  if (callerType === 'RelatedPerson' || (selfService && ctx.profile.reference !== `Patient/${patient.id}`)) {
    throw new OperationOutcomeError(forbidden);
  }

  let credentials: KenyaAfyaLinkCredentials;
  try {
    const project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id);
    credentials = getKenyaAfyaLinkCredentials(project);
  } catch (err) {
    await writeAuditEvent(ctx, patient, correlationId, AuditEventOutcome.MajorFailure);
    return errorResult(
      correlationId,
      patient.id,
      identificationType,
      identificationNumber,
      resolvedAt,
      normalizeErrorString(err)
    );
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

    if (found === 1 && msg?.client_registry_id && selfService && !matchesPatientRecord(patient, msg)) {
      status = 'not-found';
      message = 'The ID number does not match the name and date of birth on your record.';
    } else if (found === 1 && msg?.client_registry_id) {
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
    return errorResult(
      correlationId,
      patient.id,
      identificationType,
      identificationNumber,
      resolvedAt,
      normalizeErrorString(err)
    );
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
    code: {
      coding: [{ system: 'https://afiax.africa/fhir/CodeSystem/kenya-task-type', code: 'patient-identity-resolution' }],
    },
    for: createReference(patient),
    identifier: [{ system: KenyaPatientIdentityCorrelationIdSystem, value: correlationId }],
    note: [{ text: message }],
  });

  await writeAuditEvent(
    ctx,
    patient,
    correlationId,
    status === 'resolved' ? AuditEventOutcome.Success : AuditEventOutcome.MinorFailure
  );

  return {
    status,
    correlationId,
    patientId: patient.id,
    identificationType,
    identificationNumber,
    clientRegistryId,
    // Self-service callers never see registry details (their record already holds what matched)
    fullName: selfService ? null : fullName,
    dateOfBirth: selfService ? null : dateOfBirth,
    gender: selfService ? null : gender,
    resolvedAt,
    message,
    task: createReference(task),
  };
}

interface RegistryPerson {
  readonly full_name?: string | null;
  readonly first_name?: string | null;
  readonly last_name?: string | null;
  readonly date_of_birth?: string | null;
}

function nameTokens(...parts: (string | null | undefined)[]): string[] {
  return parts
    .join(' ')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean);
}

/**
 * Whether a registry entry is the same person as the Patient record: same date of birth, the family
 * name and at least one given name among the registry's names (Kenyan name order varies).
 * @param patient - The Patient record.
 * @param person - The Client Registry entry.
 * @returns True if they match.
 */
export function matchesPatientRecord(patient: Patient, person: RegistryPerson): boolean {
  const dob = person.date_of_birth?.slice(0, 10);
  if (!patient.birthDate || !dob || dob !== patient.birthDate) {
    return false;
  }
  const registry = new Set(nameTokens(person.full_name, person.first_name, person.last_name));
  const name = patient.name?.[0];
  const family = nameTokens(name?.family);
  const given = nameTokens(...(name?.given ?? []));
  return family.length > 0 && family.every((t) => registry.has(t)) && given.some((t) => registry.has(t));
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
  _correlationId: string
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
  const saved = await ctx.systemRepo.createResource(auditEvent);
  logAuditEvent(saved);
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
