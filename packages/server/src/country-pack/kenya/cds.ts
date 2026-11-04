// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya clinical decision support on the server (DHA FUNC-CDS-001, FUNC-MED-001).
//
//   - Prescribing: a MedicationRequest that triggers a high-severity alert (allergy, contraindicated
//     interaction, pregnancy, critical lab value) is rejected unless the prescriber records an
//     override reason. Overrides are recorded as DetectedIssue resources, so there is an audit trail
//     of every alert that was overridden, by whom and why.
//   - Results: a new laboratory result or vital sign outside critical limits, or one that matters
//     for a current medicine (e.g. a high INR on warfarin), is recorded as a DetectedIssue for the
//     patient, which the web app shows as a clinical alert.
//
// The rules themselves live in @medplum/core (kenya-cds.ts) so the web app shows the same alerts
// before the order is signed.

import type { KenyaCdsAlert, KenyaCdsPatientContext, WithId } from '@medplum/core';
import {
  checkKenyaMedicationOrder,
  checkKenyaObservation,
  checkKenyaResultAgainstMedications,
  createReference,
  getKenyaCdsOverrideReason,
  getProjectSettingString,
  KenyaCdsAlertCategorySystem,
  KenyaCdsOverrideExtensionUrl,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { FhirResponse } from '@medplum/fhir-router';
import type {
  AllergyIntolerance,
  CodeableConcept,
  Condition,
  DetectedIssue,
  Medication,
  MedicationRequest,
  MedicationStatement,
  Observation,
  OperationOutcome,
  Patient,
  Practitioner,
  Project,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import type { SystemRepository } from '../../fhir/repo';
import { getLogger } from '../../logger';

/** Identifier system that makes each recorded alert unique per triggering record and rule. */
export const KenyaCdsAlertIdentifierSystem = 'https://afiax.africa/identifier/kenya-cds-alert';

/** Medication orders in these statuses are checked; completed, stopped or cancelled ones are not. */
const checkedStatuses = new Set<MedicationRequest['status']>(['active', 'draft', 'on-hold']);

function isKenyaProject(project: Project | undefined): boolean {
  return getProjectSettingString(project, 'countryPack') === 'kenya';
}

/**
 * Loads the parts of the patient record the CDS rules use.
 * @param systemRepo - A system repository.
 * @param projectId - The project.
 * @param patientRef - The patient reference, e.g. "Patient/123".
 * @returns The patient context.
 */
export async function loadKenyaCdsContext(
  systemRepo: SystemRepository,
  projectId: string | undefined,
  patientRef: string
): Promise<KenyaCdsPatientContext> {
  const projectFilter = projectId ? [{ code: '_project', operator: Operator.EQUALS, value: projectId }] : [];
  const byPatient = (code: string): { code: string; operator: Operator; value: string }[] => [
    ...projectFilter,
    { code, operator: Operator.EQUALS, value: patientRef },
  ];

  const [patient, allergies, requests, statements, conditions, observations] = await Promise.all([
    patientRef.startsWith('Patient/')
      ? systemRepo.readReference<Patient>({ reference: patientRef }).catch(() => undefined)
      : Promise.resolve(undefined),
    systemRepo.searchResources<AllergyIntolerance>({
      resourceType: 'AllergyIntolerance',
      filters: byPatient('patient'),
      count: 200,
    }),
    systemRepo.searchResources<MedicationRequest>({
      resourceType: 'MedicationRequest',
      filters: [...byPatient('subject'), { code: 'status', operator: Operator.EQUALS, value: 'active,on-hold' }],
      count: 200,
    }),
    systemRepo.searchResources<MedicationStatement>({
      resourceType: 'MedicationStatement',
      filters: [...byPatient('subject'), { code: 'status', operator: Operator.EQUALS, value: 'active,intended' }],
      count: 200,
    }),
    systemRepo.searchResources<Condition>({ resourceType: 'Condition', filters: byPatient('subject'), count: 500 }),
    systemRepo.searchResources<Observation>({
      resourceType: 'Observation',
      filters: byPatient('subject'),
      sortRules: [{ code: 'date', descending: true }],
      count: 300,
    }),
  ]);

  const medications = await Promise.all(
    [...requests, ...statements].map(async (m) => ({
      ...m,
      medicationCodeableConcept: await resolveMedicationConcept(systemRepo, m),
    }))
  );
  return { patient, allergies, medications, conditions, observations };
}

/**
 * Returns the medicine of an order or statement, reading a referenced Medication if needed.
 * @param systemRepo - A system repository.
 * @param resource - The MedicationRequest or MedicationStatement.
 * @returns The medicine concept.
 */
export async function resolveMedicationConcept(
  systemRepo: SystemRepository,
  resource: MedicationRequest | MedicationStatement
): Promise<CodeableConcept | undefined> {
  if (resource.medicationCodeableConcept) {
    return resource.medicationCodeableConcept;
  }
  const reference = resource.medicationReference?.reference;
  if (!reference?.startsWith('Medication/')) {
    return resource.medicationReference?.display ? { text: resource.medicationReference.display } : undefined;
  }
  try {
    return (await systemRepo.readReference<Medication>({ reference })).code;
  } catch {
    return undefined;
  }
}

/**
 * Runs the prescribing checks for a MedicationRequest.
 * @param systemRepo - A system repository.
 * @param projectId - The project.
 * @param request - The MedicationRequest (saved or draft).
 * @returns The alerts, most severe first.
 */
export async function checkKenyaMedicationRequest(
  systemRepo: SystemRepository,
  projectId: string | undefined,
  request: MedicationRequest
): Promise<KenyaCdsAlert[]> {
  const patientRef = request.subject?.reference;
  if (!patientRef) {
    return [];
  }
  const [medication, context] = await Promise.all([
    resolveMedicationConcept(systemRepo, request),
    loadKenyaCdsContext(systemRepo, projectId, patientRef),
  ]);
  return checkKenyaMedicationOrder(medication, context, request.id);
}

function needsCheck(resource: MedicationRequest, existing: MedicationRequest | undefined): boolean {
  if (!checkedStatuses.has(resource.status)) {
    return false;
  }
  if (!existing) {
    return true;
  }
  return (
    !checkedStatuses.has(existing.status) ||
    existing.subject?.reference !== resource.subject?.reference ||
    JSON.stringify(existing.medicationCodeableConcept) !== JSON.stringify(resource.medicationCodeableConcept) ||
    existing.medicationReference?.reference !== resource.medicationReference?.reference
  );
}

/**
 * Rejects a Kenya MedicationRequest that triggers a high-severity CDS alert, unless the prescriber
 * recorded why they are going ahead (extension kenya-cds-override). Runs on create, and on update
 * when the medicine, patient or status changes. System writes are not checked.
 * @param project - The project the write belongs to.
 * @param resource - The resource being written.
 * @param existing - The current version, for updates.
 * @param isSystemWrite - True for internal system/super-admin writes.
 * @param systemRepo - A system repository.
 */
export async function enforceKenyaMedicationSafety(
  project: Project | undefined,
  resource: Resource,
  existing: Resource | undefined,
  isSystemWrite: boolean,
  systemRepo: SystemRepository
): Promise<void> {
  if (resource.resourceType !== 'MedicationRequest' || isSystemWrite || !isKenyaProject(project)) {
    return;
  }
  if (!needsCheck(resource, existing as MedicationRequest | undefined) || getKenyaCdsOverrideReason(resource)) {
    return;
  }

  const blocking = (await checkKenyaMedicationRequest(systemRepo, project?.id, resource)).filter(
    (a) => a.severity === 'high'
  );
  if (blocking.length === 0) {
    return;
  }
  const outcome: OperationOutcome = {
    resourceType: 'OperationOutcome',
    issue: [
      ...blocking.map((alert) => ({
        severity: 'error' as const,
        code: 'business-rule' as const,
        details: {
          coding: [{ system: KenyaCdsAlertCategorySystem, code: alert.category }],
          text: `${alert.title}. ${alert.detail} ${alert.recommendation}`,
        },
        diagnostics: `Evidence: ${alert.evidence}`,
        expression: ['MedicationRequest.medication'],
      })),
      {
        severity: 'information' as const,
        code: 'informational' as const,
        details: {
          text: `To prescribe anyway, record the clinical reason in extension ${KenyaCdsOverrideExtensionUrl}.`,
        },
      },
    ],
  };
  throw new OperationOutcomeError(outcome);
}

function alertIdentifier(trigger: Resource & { id: string }, alert: KenyaCdsAlert): string {
  return `${trigger.resourceType}/${trigger.id}|${alert.id}|${alert.implicated.join(',')}`;
}

/**
 * Records alerts as DetectedIssue resources, once per triggering record and rule.
 * @param ctx - The request context.
 * @param trigger - The record that raised the alerts.
 * @param patient - The patient.
 * @param alerts - The alerts.
 * @param override - The override reason, when the prescriber went ahead.
 * @returns The DetectedIssues created.
 */
export async function recordKenyaCdsAlerts(
  ctx: Pick<AuthenticatedRequestContext, 'project' | 'systemRepo' | 'profile'>,
  trigger: Resource & { id: string },
  patient: Reference<Patient> | undefined,
  alerts: readonly KenyaCdsAlert[],
  override?: string
): Promise<WithId<DetectedIssue>[]> {
  const created: WithId<DetectedIssue>[] = [];
  // DetectedIssue authors must be practitioners; other profiles (e.g. a bot) are left out
  const prescriber = ctx.profile?.reference?.startsWith('Practitioner/')
    ? (ctx.profile as Reference<Practitioner>)
    : undefined;
  for (const alert of alerts) {
    const identifier = alertIdentifier(trigger, alert);
    const existing = await ctx.systemRepo.searchOne<DetectedIssue>({
      resourceType: 'DetectedIssue',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
        { code: 'identifier', operator: Operator.EQUALS, value: `${KenyaCdsAlertIdentifierSystem}|${identifier}` },
      ],
    });
    if (existing) {
      continue;
    }
    const triggerRef = `${trigger.resourceType}/${trigger.id}`;
    const implicated = [...new Set([triggerRef, ...alert.implicated])].map((reference) => ({ reference }));
    created.push(
      await ctx.systemRepo.createResource<DetectedIssue>({
        resourceType: 'DetectedIssue',
        meta: { project: ctx.project.id },
        identifier: [{ system: KenyaCdsAlertIdentifierSystem, value: identifier }],
        status: 'final',
        severity: alert.severity,
        code: { coding: [{ system: KenyaCdsAlertCategorySystem, code: alert.category }], text: alert.title },
        patient,
        identifiedDateTime: new Date().toISOString(),
        author: override ? prescriber : undefined,
        implicated,
        detail: `${alert.detail}\nRecommendation: ${alert.recommendation}\nEvidence: ${alert.evidence}`,
        mitigation: override
          ? [
              {
                action: { text: `Prescriber override: ${override}` },
                date: new Date().toISOString(),
                author: prescriber,
              },
            ]
          : undefined,
      })
    );
  }
  return created;
}

async function recordForWrite(ctx: AuthenticatedRequestContext, resource: Resource & { id: string }): Promise<void> {
  if (resource.resourceType === 'MedicationRequest') {
    const override = getKenyaCdsOverrideReason(resource);
    if (!override || !checkedStatuses.has(resource.status)) {
      return;
    }
    const alerts = (await checkKenyaMedicationRequest(ctx.systemRepo, ctx.project.id, resource)).filter(
      (a) => a.severity === 'high'
    );
    await recordKenyaCdsAlerts(ctx, resource, resource.subject as Reference<Patient>, alerts, override);
    return;
  }

  if (resource.resourceType === 'Observation') {
    const patientRef = resource.subject?.reference;
    if (!patientRef?.startsWith('Patient/')) {
      return;
    }
    const context = await loadKenyaCdsContext(ctx.systemRepo, ctx.project.id, patientRef);
    const alerts = [
      ...checkKenyaObservation(resource, context.patient),
      ...checkKenyaResultAgainstMedications(resource, context.medications ?? []),
    ];
    if (alerts.length > 0) {
      await recordKenyaCdsAlerts(
        ctx,
        resource,
        createReference(context.patient ?? { resourceType: 'Patient', id: patientRef.slice(8) }),
        alerts
      );
    }
  }
}

/**
 * Called in the FHIR write path after a successful write. Records CDS alerts for new laboratory
 * results and vital signs, and for medication orders signed with an override. Non-blocking: never
 * delays the response or fails the write.
 * @param ctx - The authenticated request context of the write.
 * @param method - The HTTP method of the write.
 * @param result - The FHIR response returned by the write.
 */
export function maybeRecordKenyaCdsAlerts(
  ctx: AuthenticatedRequestContext,
  method: string,
  result: FhirResponse
): void {
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
    return;
  }
  const resource = result.length >= 2 ? result[1] : undefined;
  if (
    (resource?.resourceType !== 'Observation' && resource?.resourceType !== 'MedicationRequest') ||
    !resource.id ||
    !isKenyaProject(ctx.project)
  ) {
    return;
  }
  recordForWrite(ctx, resource as Resource & { id: string }).catch((err) => {
    getLogger().error('Kenya CDS alert recording failed', { resource: `${resource.resourceType}/${resource.id}`, err });
  });
}
