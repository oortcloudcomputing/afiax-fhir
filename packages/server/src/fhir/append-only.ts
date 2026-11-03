// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { OperationOutcomeError } from '@medplum/core';
import type { OperationOutcome } from '@medplum/fhirtypes';

/**
 * Resource types that can be created but never updated, patched, deleted or expunged, by any user
 * (project admins and super admins included).
 *
 * The audit trail must be tamper resistant (DHA certification SEC-AUDIT-001, HMPR Reg.12): once an
 * AuditEvent is written, it stays as written for its retention period. A second, write-once copy is
 * kept outside the database in the OpenSearch audit store.
 */
export const appendOnlyResourceTypes: readonly string[] = ['AuditEvent'];

/**
 * Returns true if resources of this type are append-only.
 * @param resourceType - The FHIR resource type.
 * @returns True if the type can only be created.
 */
export function isAppendOnlyResourceType(resourceType: string): boolean {
  return appendOnlyResourceTypes.includes(resourceType);
}

/**
 * Throws a forbidden error if the resource type is append-only.
 * @param resourceType - The FHIR resource type being modified.
 * @param action - The attempted action, for the error message (e.g. "updated", "deleted").
 */
export function assertNotAppendOnly(resourceType: string, action: string): void {
  if (isAppendOnlyResourceType(resourceType)) {
    throw new OperationOutcomeError(appendOnlyOutcome(resourceType, action));
  }
}

function appendOnlyOutcome(resourceType: string, action: string): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      {
        severity: 'error',
        code: 'forbidden',
        details: { text: `${resourceType} resources are append-only and cannot be ${action}` },
      },
    ],
  };
}
