// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// Afiax Provider settings come from environment variables at build time:
// - MEDPLUM_BASE_URL: the Afiax FHIR server. Defaults to production, https://fhir.afiax.africa/.
//   For a local server use http://localhost:8103/.
// The Afiax image builds with a placeholder that the container replaces at start-up (the same
// variable, set per environment).
//
// Never point this app at api.medplum.com: patient data must stay on Afiax servers in Kenya.

export const AFIAX_DEFAULT_BASE_URL = 'https://fhir.afiax.africa/';

export function readEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export const MEDPLUM_BASE_URL: string = readEnv(import.meta.env?.MEDPLUM_BASE_URL) ?? AFIAX_DEFAULT_BASE_URL;
