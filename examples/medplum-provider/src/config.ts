// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Deployment settings, from MEDPLUM_* environment variables at build time (see .env.defaults).

export interface ProviderAppConfig {
  /** The FHIR server. Undefined keeps the MedplumClient default. */
  readonly baseUrl?: string;
  /** The ClientApplication this app signs in with. */
  readonly clientId?: string;
  /** The admin app, for links to admin-only screens. Undefined hides those links. */
  readonly adminAppUrl?: string;
  /** The user guides. Undefined hides the link. */
  readonly helpUrl?: string;
  /** Afiax support e-mail. Undefined: "contact your Afiax administrator". */
  readonly supportEmail?: string;
}

const config: ProviderAppConfig = {
  baseUrl: import.meta.env?.MEDPLUM_BASE_URL || undefined,
  clientId: import.meta.env?.MEDPLUM_CLIENT_ID || undefined,
  adminAppUrl: import.meta.env?.MEDPLUM_ADMIN_APP_URL || undefined,
  helpUrl: import.meta.env?.MEDPLUM_HELP_URL || undefined,
  supportEmail: import.meta.env?.MEDPLUM_SUPPORT_EMAIL || undefined,
};

export function getConfig(): ProviderAppConfig {
  return config;
}
