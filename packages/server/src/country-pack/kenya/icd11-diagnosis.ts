// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  getKenyaDiagnosisConcepts,
  getKenyaIcd11DiagnosisEnforcement,
  getKenyaIcd11DiagnosisIssues,
  getProjectSettingString,
  OperationOutcomeError,
} from '@medplum/core';
import type { OperationOutcome, Project, Resource } from '@medplum/fhirtypes';
import { getLogger } from '../../logger';

/**
 * Applies the Kenya ICD-11 diagnosis coding rule to a resource being written.
 *
 * The MoH and DHA have adopted ICD-11 MMS as the national diagnosis coding standard, so in Kenya
 * projects every Condition.code and Claim.diagnosis[].diagnosisCodeableConcept must carry an ICD-11
 * MMS coding. ICD-10 and SNOMED CT codings may accompany it but cannot replace it.
 *
 * The rule only runs when the diagnoses are new or changed, so legacy ICD-10-only records can still
 * be updated (e.g. a status change) without being recoded. System writes are not checked.
 * @param project - The project the write belongs to.
 * @param resource - The resource being written.
 * @param existing - The current version of the resource, for updates.
 * @param isSystemWrite - True for internal system/super-admin writes.
 */
export function enforceKenyaIcd11Diagnosis(
  project: Project | undefined,
  resource: Resource,
  existing: Resource | undefined,
  isSystemWrite: boolean
): void {
  if (isSystemWrite || getProjectSettingString(project, 'countryPack') !== 'kenya') {
    return;
  }

  const mode = getKenyaIcd11DiagnosisEnforcement(project);
  if (mode === 'off' || !diagnosesChanged(resource, existing)) {
    return;
  }

  const issues = getKenyaIcd11DiagnosisIssues(resource);
  if (issues.length === 0) {
    return;
  }

  if (mode === 'warn') {
    getLogger().warn('Kenya ICD-11 diagnosis coding rule not met', {
      resourceType: resource.resourceType,
      id: resource.id,
      project: project?.id,
      issues,
    });
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

function diagnosesChanged(resource: Resource, existing: Resource | undefined): boolean {
  if (existing?.resourceType !== resource.resourceType) {
    return true;
  }
  const current = getKenyaDiagnosisConcepts(resource).map((d) => d.concept);
  const previous = getKenyaDiagnosisConcepts(existing).map((d) => d.concept);
  return JSON.stringify(current) !== JSON.stringify(previous);
}
