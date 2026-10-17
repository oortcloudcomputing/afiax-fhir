// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  forbidden,
  getProjectSettingString,
  KenyaBreakGlassFlagCode,
  KenyaBreakGlassFlagSystem,
  OperationOutcomeError,
} from '@medplum/core';
import type { FhirResponse } from '@medplum/fhir-router';
import type { Bundle, BundleEntry, Flag, Patient, Resource } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';

const ConfidentialitySystem = 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality';
const RestrictedCodes = new Set(['R', 'V']);

function hasRestrictedLabel(resource: Resource): boolean {
  return (resource.meta?.security ?? []).some(
    (s) => s.system === ConfidentialitySystem && RestrictedCodes.has(s.code ?? '')
  );
}

async function hasBreakGlassForPatient(ctx: AuthenticatedRequestContext, patientId: string): Promise<boolean> {
  const authorRef = ctx.profile?.reference;
  if (!authorRef) {
    return false;
  }

  const flags = (await ctx.systemRepo.search<Flag>({
    resourceType: 'Flag',
    filters: [
      { code: 'status', operator: 'eq', value: 'active' },
      { code: 'subject', operator: 'eq', value: `Patient/${patientId}` },
    ],
    count: 20,
  })) as Bundle<Flag>;

  const now = new Date();
  return (flags.entry ?? []).some((entry) => {
    const flag = entry.resource;
    if (!flag) {
      return false;
    }
    if (!flag.code?.coding?.some((c) => c.system === KenyaBreakGlassFlagSystem && c.code === KenyaBreakGlassFlagCode)) {
      return false;
    }
    if (flag.author?.reference !== authorRef) {
      return false;
    }
    if (flag.period?.end && new Date(flag.period.end) < now) {
      return false;
    }
    return true;
  });
}

function getPatientIdFromResource(resource: Resource): string | undefined {
  if (resource.resourceType === 'Patient') {
    return resource.id;
  }
  // Resources with a subject or patient reference to a Patient
  const rec = resource as unknown as Record<string, unknown>;
  const subject = rec.subject as { reference?: string } | undefined;
  const patient = rec.patient as { reference?: string } | undefined;
  const ref = subject?.reference ?? patient?.reference;
  if (ref?.startsWith('Patient/')) {
    return ref.slice('Patient/'.length);
  }
  return undefined;
}

async function canAccessRestrictedResource(ctx: AuthenticatedRequestContext, resource: Resource): Promise<boolean> {
  const patientId = getPatientIdFromResource(resource);
  if (!patientId) {
    return false;
  } // no patient linkage → deny
  return hasBreakGlassForPatient(ctx, patientId);
}

/**
 * Called from the FHIR route handler after every successful resource read/search.
 *
 * Enforces Confidentiality R/V labels:
 * - Single resource: denied unless break-glass Flag exists for the linked patient.
 * - Bundle (search result): restricted entries are stripped from the result set.
 *
 * DPA 2019 s.25 / Digital Health Act 2023 s.19 compliance hook.
 * @param ctx - The authenticated request context.
 * @param result - The FHIR response from the read or search.
 * @returns The response, with restricted resources denied or removed.
 */
export async function enforceKenyaSecurityLabels(
  ctx: AuthenticatedRequestContext,
  result: FhirResponse
): Promise<FhirResponse> {
  // Only active for Kenya country pack
  if (getProjectSettingString(ctx.project, 'countryPack') !== 'kenya') {
    return result;
  }

  // Super-admins bypass (system repo, background jobs, seeding)
  if (ctx.repo.isSuperAdmin()) {
    return result;
  }

  const resource = result[1];
  if (!resource) {
    return result;
  }

  // OperationOutcome — pass through
  if (resource.resourceType === 'OperationOutcome') {
    return result;
  }

  // Bundle (search result) — filter out restricted entries the requester cannot see
  if (resource.resourceType === 'Bundle') {
    const bundle = resource as Bundle;
    if (!bundle.entry?.length) {
      return result;
    }

    const filteredEntries: BundleEntry[] = [];
    for (const entry of bundle.entry) {
      const entryResource = entry.resource;
      if (!entryResource || !hasRestrictedLabel(entryResource)) {
        filteredEntries.push(entry);
        continue;
      }
      const allowed = await canAccessRestrictedResource(ctx, entryResource);
      if (allowed) {
        filteredEntries.push(entry);
      }
      // else silently drop — don't reveal that a restricted record exists
    }

    if (filteredEntries.length === bundle.entry.length) {
      return result;
    }

    return [
      result[0],
      {
        ...bundle,
        entry: filteredEntries,
        total: filteredEntries.filter((e) => e.resource).length,
      } as Bundle,
    ];
  }

  // Single resource — deny if restricted and no break-glass
  if (!hasRestrictedLabel(resource)) {
    return result;
  }

  const allowed = await canAccessRestrictedResource(ctx, resource);
  if (allowed) {
    return result;
  }

  throw new OperationOutcomeError(forbidden);
}

// Re-export for use in break-glass operation and tests
export { hasBreakGlassForPatient };

// Type assertion helper consumed by tests
export type { Patient };
