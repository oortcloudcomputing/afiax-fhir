// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { forbidden, getProjectSettingString, KenyaBreakGlassFlagCode, KenyaBreakGlassFlagSystem, OperationOutcomeError } from '@medplum/core';
import type { Bundle, Flag, Resource } from '@medplum/fhirtypes';
import type { FhirResponse } from '@medplum/fhir-router';
import type { AuthenticatedRequestContext } from '../../context';

const ConfidentialitySystem = 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality';
const RestrictedCodes = new Set(['R', 'V']);

function hasRestrictedLabel(resource: Resource): boolean {
  return (resource.meta?.security ?? []).some(
    (s) => s.system === ConfidentialitySystem && RestrictedCodes.has(s.code ?? '')
  );
}

/**
 * Called from the FHIR route handler after every successful resource read.
 *
 * If the returned resource carries a Confidentiality label of R (Restricted) or
 * V (Very Restricted), access is denied unless the requesting author holds an
 * active break-glass Flag for that patient.
 *
 * DPA 2019 s.25 / Digital Health Act 2023 s.19 compliance hook.
 */
export async function enforceKenyaSecurityLabels(
  ctx: AuthenticatedRequestContext,
  result: FhirResponse
): Promise<FhirResponse> {
  // Only active for Kenya country pack
  if (getProjectSettingString(ctx.project, 'countryPack') !== 'kenya') return result;

  // Super-admins bypass (system repo, background jobs, seeding)
  if (ctx.repo.isSuperAdmin()) return result;

  // Only check single-resource reads — skip Bundles and OperationOutcomes
  const resource = result[1] as Resource | undefined;
  if (!resource || resource.resourceType === 'Bundle' || resource.resourceType === 'OperationOutcome') {
    return result;
  }

  if (!hasRestrictedLabel(resource)) return result;

  // Only Patient resources currently carry break-glass clearance
  if (resource.resourceType !== 'Patient' || !resource.id) {
    throw new OperationOutcomeError(forbidden);
  }

  const authorRef = ctx.profile?.reference;
  if (!authorRef) throw new OperationOutcomeError(forbidden);

  // Check for an active break-glass Flag authored by this user for this patient.
  // Using systemRepo avoids polluting the access-policy-scoped repo with a
  // diagnostic search, and ensures the Flag is always readable regardless of
  // the requesting AccessPolicy.
  const flags = (await ctx.systemRepo.search<Flag>({
    resourceType: 'Flag',
    filters: [
      { code: 'status', operator: 'eq', value: 'active' },
      { code: 'subject', operator: 'eq', value: `Patient/${resource.id}` },
    ],
    count: 20,
  })) as Bundle<Flag>;

  const now = new Date();
  const hasValidBreakGlass = (flags.entry ?? []).some((entry) => {
    const flag = entry.resource;
    if (!flag) return false;
    // Must be a break-glass flag
    if (!flag.code?.coding?.some((c) => c.system === KenyaBreakGlassFlagSystem && c.code === KenyaBreakGlassFlagCode)) {
      return false;
    }
    // Must be authored by the current user
    if (flag.author?.reference !== authorRef) return false;
    // Must not be expired (period.end in the past means expired)
    if (flag.period?.end && new Date(flag.period.end) < now) return false;
    return true;
  });

  if (hasValidBreakGlass) return result;

  throw new OperationOutcomeError(forbidden);
}
