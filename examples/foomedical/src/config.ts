// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// My Afiax settings come from environment variables at build time (see README.md):
// - MEDPLUM_BASE_URL: the Afiax FHIR server. Defaults to production, https://fhir.afiax.africa/.
//   For a local server use http://localhost:8103/.
// - MEDPLUM_PROJECT_ID: the Afiax project patients sign up to. With no project id, sign-up is closed.
// - GOOGLE_CLIENT_ID and RECAPTCHA_SITE_KEY: optional, Afiax's own keys only.
//
// Never point this app at api.medplum.com: patient data must stay on Afiax servers in Kenya.

export const AFIAX_DEFAULT_BASE_URL = 'https://fhir.afiax.africa/';

export function readEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

export const MEDPLUM_BASE_URL: string = readEnv(import.meta.env?.MEDPLUM_BASE_URL) ?? AFIAX_DEFAULT_BASE_URL;
export const MEDPLUM_PROJECT_ID: string | undefined = readEnv(import.meta.env?.MEDPLUM_PROJECT_ID);
export const MEDPLUM_GOOGLE_CLIENT_ID: string | undefined = readEnv(import.meta.env?.GOOGLE_CLIENT_ID);
export const MEDPLUM_RECAPTCHA_SITE_KEY: string | undefined = readEnv(import.meta.env?.RECAPTCHA_SITE_KEY);
