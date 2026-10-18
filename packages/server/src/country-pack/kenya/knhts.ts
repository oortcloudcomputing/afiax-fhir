// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Client for the Kenya National Health Terminology Service (KNHTS, https://nhts.dha.go.ke).
// KNHTS is an Open Concept Lab (OCL) instance run by the DHA; its public API serves the national
// sources: WHO ICD-11 (diagnoses), ICHI (interventions), LOINC (laboratory), MOH-PPB HPT (health
// products) and the MOH-KENYA interface terminologies (encounter types, coverage, claims, ...).

import { getConfig } from '../../config/loader';

export const KnhtsDefaultBaseUrl = 'https://ilm-hie.dha.go.ke/ocl';

/** A KNHTS source, addressed by its OCL owner and source id. */
export interface KnhtsSource {
  readonly owner: string;
  readonly source: string;
}

export const KnhtsSources = {
  icd11: { owner: 'WHO', source: 'ICD-11' },
  icd10: { owner: 'WHO', source: 'ICD-10-WHO' },
  ichi: { owner: 'WHO', source: 'ICHI' },
  icf: { owner: 'WHO', source: 'ICF' },
  icdO3: { owner: 'WHO', source: 'ICD-O-3' },
  loinc: { owner: 'Regenstrief', source: 'LOINC' },
  healthProducts: { owner: 'MOH-PPB', source: 'HPT' },
  investigations: { owner: 'MOH-PPB', source: 'Investigations' },
  shaInterventions: { owner: 'MOH-KENYA', source: 'BenefitsAndInterventions' },
  documentTypes: { owner: 'MOH-KENYA', source: 'document-types' },
  encounterTypes: { owner: 'MOH-KENYA', source: 'ORG-00001-SRC-027' },
  allergyCodes: { owner: 'MOH-KENYA', source: 'ORG-00001-SRC-012' },
  patientIdentifiers: { owner: 'MOH-KENYA', source: 'ORG-00001-SRC-016' },
  practitionerRoles: { owner: 'MOH-KENYA', source: 'ORG-00001-SRC-036' },
  claimTypes: { owner: 'MOH-KENYA', source: 'ORG-00001-SRC-037' },
  counties: { owner: 'MOH-KENYA', source: 'ORG-00001-SRC-018' },
} as const satisfies Record<string, KnhtsSource>;

export type KnhtsLookupResult =
  | { readonly status: 'found'; readonly display: string | undefined; readonly retired: boolean }
  | { readonly status: 'not-found' }
  | { readonly status: 'unavailable'; readonly reason: string };

const FOUND_TTL_MS = 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 3000;
const MAX_CACHE_ENTRIES = 20_000;

const cache = new Map<string, { result: KnhtsLookupResult; expires: number }>();

export function getKnhtsBaseUrl(): string {
  return (getConfig().knhtsBaseUrl || KnhtsDefaultBaseUrl).replace(/\/$/, '');
}

export function isKnhtsValidationEnabled(): boolean {
  return getConfig().knhtsValidation !== false;
}

/**
 * Looks up a concept in a KNHTS source. Results are cached (found 24 h, not found 1 h); outages
 * are never cached and are reported as 'unavailable' so callers can decide not to block on them.
 * @param source - The KNHTS source.
 * @param code - The concept code.
 * @param fetchFn - Fetch implementation (for tests).
 * @returns The lookup result.
 */
export async function lookupKnhtsConcept(
  source: KnhtsSource,
  code: string,
  fetchFn: typeof fetch = fetch
): Promise<KnhtsLookupResult> {
  const key = `${source.owner}/${source.source}/${code}`;
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expires > now) {
    return cached.result;
  }

  const url = `${getKnhtsBaseUrl()}/orgs/${encodeURIComponent(source.owner)}/sources/${encodeURIComponent(
    source.source
  )}/concepts/${encodeURIComponent(code)}/`;

  let result: KnhtsLookupResult;
  try {
    const response = await fetchFn(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (response.status === 404) {
      result = { status: 'not-found' };
    } else if (!response.ok) {
      return { status: 'unavailable', reason: `KNHTS returned HTTP ${response.status}` };
    } else {
      const body = (await response.json()) as { id?: string; display_name?: string; retired?: boolean };
      result =
        body.id === code
          ? { status: 'found', display: body.display_name, retired: body.retired === true }
          : { status: 'not-found' };
    }
  } catch (err) {
    return { status: 'unavailable', reason: err instanceof Error ? err.message : String(err) };
  }

  if (cache.size >= MAX_CACHE_ENTRIES) {
    cache.clear();
  }
  cache.set(key, { result, expires: now + (result.status === 'found' ? FOUND_TTL_MS : NOT_FOUND_TTL_MS) });
  return result;
}

/** Clears the lookup cache (tests). */
export function clearKnhtsCache(): void {
  cache.clear();
}
