// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { KenyaDiagnosisCodingIssue } from '@medplum/core';
import {
  getKenyaDiagnosisConcepts,
  getKenyaIcd11Codings,
  getKenyaIcd11DiagnosisEnforcement,
  getKenyaIcd11DiagnosisIssues,
  getProjectSettingString,
  OperationOutcomeError,
} from '@medplum/core';
import type { OperationOutcome, Project, Resource } from '@medplum/fhirtypes';
import { getLogger } from '../../logger';
import type { KnhtsLookupResult } from './knhts';
import { isKnhtsValidationEnabled, KnhtsSources, lookupKnhtsConcept } from './knhts';

/**
 * Applies the Kenya ICD-11 diagnosis coding rule to a resource being written.
 *
 * The MoH and DHA have adopted ICD-11 MMS as the national diagnosis coding standard, so in Kenya
 * projects every Condition.code and Claim.diagnosis[].diagnosisCodeableConcept must carry an ICD-11
 * MMS coding. ICD-10 and SNOMED CT codings may accompany it but cannot replace it.
 *
 * Each ICD-11 code (every part of a postcoordinated code) must also exist in the national terminology
 * service, KNHTS (WHO ICD-11 source). If KNHTS cannot be reached, the write is accepted on the format
 * check alone and a warning is logged: an outage of the national service must not stop clinical care.
 *
 * The rule only runs when the diagnoses are new or changed, so legacy ICD-10-only records can still
 * be updated (e.g. a status change) without being recoded. System writes are not checked.
 * @param project - The project the write belongs to.
 * @param resource - The resource being written.
 * @param existing - The current version of the resource, for updates.
 * @param isSystemWrite - True for internal system/super-admin writes.
 * @param lookup - KNHTS concept lookup (for tests).
 */
export async function enforceKenyaIcd11Diagnosis(
  project: Project | undefined,
  resource: Resource,
  existing: Resource | undefined,
  isSystemWrite: boolean,
  lookup: (code: string) => Promise<KnhtsLookupResult> = (code) => lookupKnhtsConcept(KnhtsSources.icd11, code)
): Promise<void> {
  if (isSystemWrite || getProjectSettingString(project, 'countryPack') !== 'kenya') {
    return;
  }

  const mode = getKenyaIcd11DiagnosisEnforcement(project);
  if (mode === 'off' || !diagnosesChanged(resource, existing)) {
    return;
  }

  const issues = getKenyaIcd11DiagnosisIssues(resource);
  if (issues.length === 0 && isKnhtsValidationEnabled()) {
    issues.push(...(await getKnhtsIssues(project, resource, lookup)));
  }
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

/**
 * Checks every ICD-11 code on the resource's diagnoses against KNHTS.
 * @param project - The project (for logging).
 * @param resource - The resource being written.
 * @param lookup - KNHTS concept lookup.
 * @returns One issue per code that KNHTS does not know or has retired.
 */
async function getKnhtsIssues(
  project: Project | undefined,
  resource: Resource,
  lookup: (code: string) => Promise<KnhtsLookupResult>
): Promise<KenyaDiagnosisCodingIssue[]> {
  const issues: KenyaDiagnosisCodingIssue[] = [];
  for (const { expression, concept } of getKenyaDiagnosisConcepts(resource)) {
    for (const coding of getKenyaIcd11Codings(concept)) {
      for (const part of (coding.code as string).split(/[&/]/)) {
        const result = await lookup(part);
        if (result.status === 'not-found') {
          issues.push({ expression, message: `ICD-11 code ${part} is not in the national terminology service (KNHTS)` });
        } else if (result.status === 'found' && result.retired) {
          issues.push({ expression, message: `ICD-11 code ${part} is retired in KNHTS` });
        } else if (result.status === 'unavailable') {
          getLogger().warn('KNHTS unavailable; ICD-11 code accepted on format check only', {
            code: part,
            project: project?.id,
            reason: result.reason,
          });
        }
      }
    }
  }
  return issues;
}
