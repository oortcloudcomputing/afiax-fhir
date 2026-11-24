// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Deployment settings, from MEDPLUM_* environment variables at build time (see .env.defaults).
// The Afiax image builds with placeholders that the container replaces at start-up (the same
// variables, set per environment).
//
// Never point this app at api.medplum.com: patient data must stay on Afiax servers in Kenya.

export const AFIAX_DEFAULT_BASE_URL = 'https://fhir.afiax.africa/';

export interface ProviderAppConfig {
  /** The Afiax FHIR server. Defaults to production, never Medplum's cloud. */
  readonly baseUrl: string;
  /** The ClientApplication this app signs in with. */
  readonly clientId?: string;
  /** The admin app, for links to admin-only screens. Undefined hides those links. */
  readonly adminAppUrl?: string;
  /** The user guides. Undefined hides the link. */
  readonly helpUrl?: string;
  /** Afiax support e-mail. Undefined: "contact your Afiax administrator". */
  readonly supportEmail?: string;
  /** Minutes without activity before signing out; 0 switches it off (change register 1.7). */
  readonly idleTimeoutMinutes?: string;
  /** afiax-services, for the Prescription Network's offer requests. Undefined hides them. */
  readonly afiaxServicesUrl?: string;
  /** MapTiler key for maps (decision 2026-11-23, as My Afiax). Undefined: OpenStreetMap tiles in development only. */
  readonly maptilerKey?: string;
}

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;

/**
 * The idle sign-out: 15 minutes unless configured (shared ward computers).
 * @returns The idle time in milliseconds; 0 when switched off.
 */
export function getIdleTimeoutMs(): number {
  const configured = Number(getConfig().idleTimeoutMinutes);
  const minutes = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_IDLE_TIMEOUT_MINUTES;
  return minutes * 60_000;
}

export function readEnv(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

const config: ProviderAppConfig = {
  baseUrl: readEnv(import.meta.env?.MEDPLUM_BASE_URL) ?? AFIAX_DEFAULT_BASE_URL,
  clientId: readEnv(import.meta.env?.MEDPLUM_CLIENT_ID),
  adminAppUrl: readEnv(import.meta.env?.MEDPLUM_ADMIN_APP_URL),
  helpUrl: readEnv(import.meta.env?.MEDPLUM_HELP_URL),
  supportEmail: readEnv(import.meta.env?.MEDPLUM_SUPPORT_EMAIL),
  idleTimeoutMinutes: readEnv(import.meta.env?.MEDPLUM_IDLE_TIMEOUT_MINUTES),
  afiaxServicesUrl: readEnv(import.meta.env?.MEDPLUM_AFIAX_SERVICES_URL),
  maptilerKey: readEnv(import.meta.env?.MEDPLUM_MAPTILER_KEY),
};

export function getConfig(): ProviderAppConfig {
  return config;
}
