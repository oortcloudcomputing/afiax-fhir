// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getKenyaValidationIssues, getProjectSettingString, Operator, OperationOutcomeError } from '@medplum/core';
import type { OperationOutcome, Project, Resource, ResourceType } from '@medplum/fhirtypes';
import type { SystemRepository } from '../../fhir/repo';

function isKenyaProject(project: Project | undefined): boolean {
  return getProjectSettingString(project, 'countryPack') === 'kenya';
}

/**
 * Rejects writes in Kenya projects that carry impossible values: a date of birth in the future,
 * a malformed National ID or passport number, an invalid phone number, or a vital sign that is
 * negative or physiologically implausible (DHA certification FUNC-DEMO-001, SEC-INT-001).
 *
 * The rules live in `@medplum/core` (kenya-validation.ts) so the web app can run the same checks
 * on the form. System writes are not checked.
 * @param project - The project the write belongs to.
 * @param resource - The resource being written.
 * @param isSystemWrite - True for internal system/super-admin writes.
 */
export function enforceKenyaDataValidation(
  project: Project | undefined,
  resource: Resource,
  isSystemWrite: boolean
): void {
  if (isSystemWrite || !isKenyaProject(project)) {
    return;
  }
  const issues = getKenyaValidationIssues(resource);
  if (issues.length === 0) {
    return;
  }
  const outcome: OperationOutcome = {
    resourceType: 'OperationOutcome',
    issue: issues.map((issue) => ({
      severity: 'error',
      code: 'invalid',
      details: { text: issue.message },
      expression: [issue.expression],
    })),
  };
  throw new OperationOutcomeError(outcome);
}

/** Clinical records that keep a patient from being deleted. */
const patientClinicalRecordTypes: ResourceType[] = [
  'Encounter',
  'Condition',
  'Observation',
  'MedicationRequest',
  'ServiceRequest',
  'DiagnosticReport',
  'Procedure',
  'AllergyIntolerance',
  'Immunization',
];

/**
 * Blocks deleting a Patient who has clinical records in a Kenya project (referential integrity,
 * DHA certification SEC-INT-001). A patient registered in error with no records can still be
 * deleted; anyone else should be marked inactive instead, so the clinical history stays intact.
 * @param project - The project the delete belongs to.
 * @param resource - The resource being deleted.
 * @param isSystemWrite - True for internal system/super-admin deletes.
 * @param systemRepo - A system repository, to find records the user may not be able to read.
 */
export async function enforceKenyaPatientDelete(
  project: Project | undefined,
  resource: Resource,
  isSystemWrite: boolean,
  systemRepo: SystemRepository
): Promise<void> {
  if (resource.resourceType !== 'Patient' || isSystemWrite || !isKenyaProject(project)) {
    return;
  }
  const reference = `Patient/${resource.id}`;
  for (const resourceType of patientClinicalRecordTypes) {
    const found = await systemRepo.searchOne({
      resourceType,
      filters: [{ code: 'patient', operator: Operator.EQUALS, value: reference }],
    });
    if (found) {
      throw new OperationOutcomeError({
        resourceType: 'OperationOutcome',
        issue: [
          {
            severity: 'error',
            code: 'conflict',
            details: {
              text: `Patient cannot be deleted: they have ${resourceType} records. Mark the patient inactive instead.`,
            },
          },
        ],
      });
    }
  }
}
