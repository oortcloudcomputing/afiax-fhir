// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya HIE connector (DHA Health Information Exchange middleware).
//
// Follows the current DHA HIE documentation at https://hie-docs.dha.go.ke (checked 2026-11-10,
// pages last modified 2026-09-28). It replaces the retired AfyaLink v1 API
// (GET /v1/hie-auth?key=… with Basic auth, /v2/facility-search, /v1/practitioner-search,
// /v2/eligibility, Tiberbu /check-client), which DHA no longer accepts.
//
// - Credentials: a client ID and client secret per app, issued in the AfyaConnect developer
//   portal (https://afyaconnect.dha.go.ke).
// - Token: POST {base}/tenants/token (form client_id, client_secret) returns a Bearer token
//   (about one hour). Tokens are cached until shortly before they expire.
// - Facility: a facility-scoped token carries the facility (facility_id claim). A multi-facility
//   (service-account) token must send X-Facility-Id and X-Facility-Id-Type: fr-code on every
//   call; set the kenyaHieFacilityId secret to send them.
import type { KenyaHieCredentialMode, KenyaHieEnvironment } from '@medplum/core';
import {
  getKenyaHieAgentId,
  getKenyaHieCredentialMode,
  getKenyaHieEnvironment,
  normalizeErrorString,
} from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import { randomUUID } from 'node:crypto';

export const KenyaHieSecretNames = {
  baseUrl: 'kenyaHieBaseUrl',
  clientId: 'kenyaHieClientId',
  clientSecret: 'kenyaHieClientSecret',
  facilityId: 'kenyaHieFacilityId',
} as const;

/**
 * Secret names used before the move to the DHA HIE middleware. They are still read as a
 * fallback, so projects configured earlier keep working: the AfyaConnect client ID was entered
 * as the consumer key and the client secret as the password.
 */
export const KenyaAfyaLinkSecretNames = {
  baseUrl: 'kenyaAfyaLinkBaseUrl',
  consumerKey: 'kenyaAfyaLinkConsumerKey',
  username: 'kenyaAfyaLinkUsername',
  password: 'kenyaAfyaLinkPassword',
} as const;

/** Every secret name the Kenya HIE connector reads (current and legacy). */
export const KenyaHieAllSecretNames: readonly string[] = [
  ...Object.values(KenyaHieSecretNames),
  ...Object.values(KenyaAfyaLinkSecretNames),
];

export const KenyaHieDefaultBaseUrls: Record<KenyaHieEnvironment, string | undefined> = {
  uat: 'https://ilm-dev.dha.go.ke/uat-middleware/api/v1',
  // DHA issues production credentials and the production base URL after certification.
  production: undefined,
};

export interface KenyaAfyaLinkCredentials {
  readonly baseUrl: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** Facility Registry (FR) code sent as X-Facility-Id, for multi-facility tokens. */
  readonly facilityId?: string;
  readonly agentId?: string;
}

export interface AfyaLinkFacilityMessage {
  readonly id?: string | null;
  readonly facility_name?: string | null;
  readonly registration_number?: string | null;
  readonly regulator?: string | null;
  readonly facility_code?: string;
  readonly fr_code?: string | null;
  readonly found?: number;
  readonly approved?: boolean | string | null;
  /** The registry's licence status as returned, for example LICENSED. */
  readonly license_status?: string | null;
  readonly facility_level?: string | null;
  readonly facility_category?: string | null;
  readonly facility_owner?: string | null;
  readonly facility_type?: string | null;
  readonly county?: string | null;
  readonly sub_county?: string | null;
  readonly ward?: string | null;
  readonly operational_status?: string | null;
  readonly sha_operational_status?: string | null;
  readonly current_license_expiry_date?: string | null;
}

export interface AfyaLinkFacilitySearchResponse {
  readonly message?: AfyaLinkFacilityMessage;
}

export interface AfyaLinkPractitionerMessage {
  readonly registration_number?: string | null;
  readonly found?: number;
  readonly is_active?: string | boolean | null;
  readonly full_name?: string | null;
  readonly licensing_body?: string | null;
  readonly client_registry_id?: string | null;
  readonly license_end?: string | null;
}

export interface AfyaLinkPractitionerSearchResponse {
  readonly message?: AfyaLinkPractitionerMessage;
}

export interface AfyaLinkEligibilityScheme {
  readonly schemeId?: number | null;
  readonly schemeName?: string | null;
  readonly memberType?: string | null;
  readonly coverageStatus?: string | null;
  readonly coverageStartDate?: string | null;
  readonly coverageEndDate?: string | null;
  readonly reason?: string | null;
  readonly possibleSolution?: string | null;
}

export interface AfyaLinkEligibilityMessage {
  readonly id?: string | number | null;
  readonly eligible?: string | boolean | number | null;
  readonly full_name?: string | null;
  readonly reason?: string | null;
  readonly possible_solution?: string | null;
  readonly coverageEndDate?: string | null;
  readonly transition_status?: string | null;
  readonly request_id_number?: string | null;
  readonly request_id_type?: string | null;
  readonly message?: string | null;
  readonly status?: string | null;
  readonly member_cr_number?: string | null;
  readonly is_alive?: boolean | null;
  readonly whitelisted_for_otp?: boolean | null;
  readonly facility_biometrics_enforced?: boolean | null;
  readonly schemes?: readonly AfyaLinkEligibilityScheme[];
  // Fields from the retired v3 eligibility API, kept for callers that still read them.
  readonly means_testing_details?: { readonly means_testing_done?: boolean | null } | null;
  readonly client_portal_details?: {
    readonly employment_type?: string | null;
    readonly employer_name?: string | null;
  } | null;
  readonly eligible_employee?: boolean | string | number | null;
  readonly policy_end_employer?: string | null;
}

export interface AfyaLinkEligibilityResponse {
  readonly message?: AfyaLinkEligibilityMessage;
}

export interface AfyaLinkClientRegistryMessage {
  readonly found?: number | string | boolean | null;
  readonly client_registry_id?: string | null;
  readonly full_name?: string | null;
  readonly first_name?: string | null;
  readonly middle_name?: string | null;
  readonly last_name?: string | null;
  readonly date_of_birth?: string | null;
  readonly gender?: string | null;
  readonly phone?: string | null;
  readonly identification_type?: string | null;
  readonly identification_number?: string | null;
  readonly account_status?: string | null;
}

export interface AfyaLinkClientRegistryResponse {
  readonly message?: AfyaLinkClientRegistryMessage;
}

export interface AfyaLinkShrPublicationMessage {
  readonly record_id?: string | null;
  readonly status?: string | null;
  readonly timestamp?: string | null;
  readonly message?: string | null;
}

export interface AfyaLinkShrPublicationResponse {
  readonly message?: AfyaLinkShrPublicationMessage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function getProjectSecret(project: Project, name: string): string | undefined {
  return project.secret?.find((entry) => entry.name === name)?.valueString?.trim() || undefined;
}

function getProjectSystemSecret(project: Project, name: string): string | undefined {
  return project.systemSecret?.find((entry) => entry.name === name)?.valueString?.trim() || undefined;
}

function getManagedProjectSecret(
  project: Project,
  names: readonly string[],
  credentialMode: KenyaHieCredentialMode
): string | undefined {
  for (const name of names) {
    const value =
      credentialMode === 'afiax-managed'
        ? getProjectSystemSecret(project, name)
        : (getProjectSecret(project, name) ?? getProjectSystemSecret(project, name));
    if (value) {
      return value;
    }
  }
  return undefined;
}

function requireManagedProjectSecret(
  project: Project,
  names: readonly string[],
  credentialMode: KenyaHieCredentialMode
): string {
  const value = getManagedProjectSecret(project, names, credentialMode);
  if (!value) {
    throw new Error(
      credentialMode === 'afiax-managed'
        ? `Missing required Afiax-managed Kenya HIE secret: ${names[0]}`
        : `Missing required Kenya HIE secret: ${names[0]}`
    );
  }
  return value;
}

function getKenyaHieBaseUrl(
  project: Project,
  credentialMode: KenyaHieCredentialMode,
  environment: KenyaHieEnvironment
): string {
  const explicitBaseUrl = getManagedProjectSecret(project, [KenyaHieSecretNames.baseUrl], credentialMode);
  if (explicitBaseUrl) {
    return explicitBaseUrl.replace(/\/+$/, '');
  }

  // The legacy override pointed at the retired AfyaLink host; use it only if it names the middleware.
  const legacyBaseUrl = getManagedProjectSecret(project, [KenyaAfyaLinkSecretNames.baseUrl], credentialMode);
  if (legacyBaseUrl && !/^https:\/\/uat\.dha\.go\.ke\/?$/.test(legacyBaseUrl)) {
    return legacyBaseUrl.replace(/\/+$/, '');
  }

  const defaultBaseUrl = KenyaHieDefaultBaseUrls[environment];
  if (defaultBaseUrl) {
    return defaultBaseUrl;
  }

  throw new Error(
    'Missing required Kenya HIE production base URL. DHA issues it with production credentials after certification; configure kenyaHieBaseUrl.'
  );
}

export function getKenyaAfyaLinkCredentials(project: Project): KenyaAfyaLinkCredentials {
  const credentialMode = getKenyaHieCredentialMode(project);
  const environment = getKenyaHieEnvironment(project);
  const facilityId = getManagedProjectSecret(project, [KenyaHieSecretNames.facilityId], credentialMode);
  const agentId = getKenyaHieAgentId(project);
  return {
    baseUrl: getKenyaHieBaseUrl(project, credentialMode, environment),
    clientId: requireManagedProjectSecret(
      project,
      [KenyaHieSecretNames.clientId, KenyaAfyaLinkSecretNames.consumerKey],
      credentialMode
    ),
    clientSecret: requireManagedProjectSecret(
      project,
      [KenyaHieSecretNames.clientSecret, KenyaAfyaLinkSecretNames.password],
      credentialMode
    ),
    ...(facilityId ? { facilityId } : {}),
    ...(agentId ? { agentId } : {}),
  };
}

interface CachedToken {
  readonly token: string;
  readonly expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

/** Clears cached HIE access tokens (used by tests and after credentials change). */
export function clearKenyaHieTokenCache(): void {
  tokenCache.clear();
}

function getTokenCacheKey(credentials: KenyaAfyaLinkCredentials): string {
  return `${credentials.baseUrl}\u0000${credentials.clientId}\u0000${credentials.clientSecret}`;
}

/**
 * Gets an HIE access token with the OAuth2 client credentials (POST /tenants/token).
 * @param credentials - The HIE credentials.
 * @param options - Optional settings.
 * @param options.forceRefresh - Skip the cache and authenticate again (for connection tests).
 * @returns The Bearer access token.
 */
export async function getAfyaLinkToken(
  credentials: KenyaAfyaLinkCredentials,
  options?: { readonly forceRefresh?: boolean }
): Promise<string> {
  const cacheKey = getTokenCacheKey(credentials);
  const cached = tokenCache.get(cacheKey);
  if (!options?.forceRefresh && cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const response = await fetch(`${credentials.baseUrl}/tenants/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
    }).toString(),
  });

  const rawBody = (await response.text()).trim();
  if (!response.ok) {
    throw new Error(`Kenya HIE authentication failed (${response.status}): ${rawBody}`);
  }

  let data: unknown;
  try {
    data = JSON.parse(rawBody);
  } catch {
    throw new Error('Kenya HIE authentication response was not JSON');
  }

  const token = isRecord(data) ? str(data.access_token) : null;
  if (!token) {
    throw new Error('Kenya HIE authentication response did not include an access_token');
  }

  const expiresIn = isRecord(data) && typeof data.expires_in === 'number' ? data.expires_in : 300;
  // Renew a minute early so a request never goes out with a token about to expire.
  const lifetimeMs = Math.max(expiresIn - 60, 0) * 1000;
  if (lifetimeMs > 0) {
    tokenCache.set(cacheKey, { token, expiresAt: Date.now() + lifetimeMs });
  }
  return token;
}

export interface HieResult {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
  readonly text: string;
}

export interface HieMultipartFile {
  /** The form part name. */
  readonly field: string;
  /** DHA infers the file type from the extension, so it must be correct (for example CLAIM_FORM.pdf). */
  readonly filename: string;
  readonly contentType: string;
  readonly data: Buffer;
}

export interface HieMultipart {
  readonly fields: Record<string, string>;
  readonly files: readonly HieMultipartFile[];
}

export interface HieRequestOptions {
  readonly params?: Record<string, string>;
  readonly body?: unknown;
  /** multipart/form-data body, for attachments (DHA: files go as binary parts, never base64). */
  readonly multipart?: HieMultipart;
  /** Extra headers, for example X-Consent-Token and X-PUID on Shared Health Record reads. */
  readonly headers?: Record<string, string>;
}

function quoteFormValue(value: string): string {
  return value.replace(/[\r\n"]/g, (c) => encodeURIComponent(c));
}

/**
 * Builds a multipart/form-data body.
 * @param multipart - The fields and files.
 * @returns The body and its content type with the boundary.
 */
export function buildHieMultipartBody(multipart: HieMultipart): { body: Buffer; contentType: string } {
  const boundary = `----afiax${randomUUID().replace(/-/g, '')}`;
  const parts: Buffer[] = [];
  for (const [name, value] of Object.entries(multipart.fields)) {
    parts.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${quoteFormValue(name)}"\r\n\r\n${value}\r\n`)
    );
  }
  for (const file of multipart.files) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${quoteFormValue(file.field)}"; filename="${quoteFormValue(file.filename)}"\r\nContent-Type: ${file.contentType}\r\n\r\n`
      ),
      file.data,
      Buffer.from('\r\n')
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));
  return { body: Buffer.concat(parts), contentType: `multipart/form-data; boundary=${boundary}` };
}

/**
 * Sends one request to the HIE middleware with a Bearer token, and the facility headers when
 * kenyaHieFacilityId is configured. JSON bodies are parsed; the raw text is kept for errors.
 * @param credentials - The HIE credentials.
 * @param method - The HTTP method.
 * @param path - The path below the HIE base URL, for example /claims/visit.
 * @param options - Query parameters and a JSON body.
 * @returns The status, parsed body and raw text.
 */
export async function requestKenyaHie(
  credentials: KenyaAfyaLinkCredentials,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  options?: HieRequestOptions
): Promise<HieResult> {
  const token = await getAfyaLinkToken(credentials);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (credentials.facilityId) {
    headers['X-Facility-Id'] = credentials.facilityId;
    headers['X-Facility-Id-Type'] = 'fr-code';
  }
  for (const [name, value] of Object.entries(options?.headers ?? {})) {
    headers[name] = value;
  }
  let requestBody: string | Buffer | undefined;
  if (options?.multipart) {
    const multipart = buildHieMultipartBody(options.multipart);
    headers['Content-Type'] = multipart.contentType;
    requestBody = multipart.body;
  } else if (options?.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    requestBody = JSON.stringify(options.body);
  }

  const query = options?.params ? `?${new URLSearchParams(options.params).toString()}` : '';
  const response = await fetch(`${credentials.baseUrl}${path}${query}`, {
    method,
    headers,
    ...(requestBody !== undefined ? { body: requestBody } : {}),
  });
  const text = await response.text();
  let body: unknown = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  return { status: response.status, ok: response.ok, body, text };
}

async function hieGet(
  credentials: KenyaAfyaLinkCredentials,
  path: string,
  params: Record<string, string>
): Promise<HieResult> {
  return requestKenyaHie(credentials, 'GET', path, { params });
}

/**
 * DHA answers "no match" with 400 and a message such as "zero results found" or
 * "no practitioner membership returned"; treat those as not found rather than errors.
 * @param result - The HIE response.
 * @returns True when the response means the registry has no match.
 */
function isNotFoundResult(result: HieResult): boolean {
  if (result.status === 404) {
    return true;
  }
  if (result.status !== 400 || !isRecord(result.body)) {
    return false;
  }
  const message = str(result.body.message)?.toLowerCase() ?? '';
  return /zero results|not found|no practitioner|no facility|no patient|no record/.test(message);
}

/**
 * Describes a failed HIE response with DHA's message and trace ID when present.
 * @param result - The HIE response.
 * @returns The message to report.
 */
export function describeHieFailure(result: HieResult): string {
  if (isRecord(result.body)) {
    const message = str(result.body.message);
    const traceId = str(result.body.trace_id);
    if (message) {
      return traceId ? `${message} (trace ${traceId})` : message;
    }
  }
  return result.text;
}

const FacilityIdentifierPattern = /^FID-/i;

function getFacilityIdentifierType(facilityCode: string): 'fr-code' | 'mfl' {
  return FacilityIdentifierPattern.test(facilityCode.trim()) ? 'fr-code' : 'mfl';
}

/**
 * The registry sends dates as date-times in Kenya time (2026-12-31T00:00:00+03:00). Keep the
 * calendar date as written: converting to UTC would move midnight EAT to the previous day.
 * @param value - The registry value.
 * @returns The YYYY-MM-DD date, or the value unchanged if it is not dated.
 */
function toCalendarDate(value: string | null): string | null {
  const match = value?.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : value;
}

function normalizeFacilityRecord(payload: Record<string, unknown>, facilityCode: string): AfyaLinkFacilityMessage {
  const address = isRecord(payload.address) ? payload.address : {};
  const regulatory = isRecord(payload.regulatoryOperationalStatus) ? payload.regulatoryOperationalStatus : {};
  const sha = isRecord(payload.SHAOperationStatus) ? payload.SHAOperationStatus : {};
  const licenseStatus = str(payload.facilityLicenseStatus);
  // The registry reports the licence state (for example LICENSED); anything else means the
  // facility is not approved for use.
  let approved: string | null = null;
  if (licenseStatus) {
    approved = /^licen[sc]ed$/i.test(licenseStatus) ? 'true' : 'not approved';
  }
  return {
    id: str(payload.uuid) ?? str(payload.fidCode),
    facility_name: str(payload.officialName),
    registration_number: str(payload.registrationNumber),
    regulator: str(payload.regulatoryBody),
    facility_code: facilityCode,
    fr_code: str(payload.frCode),
    found: 1,
    approved,
    license_status: licenseStatus,
    facility_level: str(payload.kephLevel),
    facility_category: str(payload.facilityType),
    facility_owner: str(payload.facilityOwnership),
    facility_type: str(payload.facilityType),
    county: str(address.county),
    sub_county: str(address.subCounty),
    ward: str(address.ward),
    operational_status: str(regulatory.operationalStatus),
    sha_operational_status: str(sha.operationalStatus),
    current_license_expiry_date: toCalendarDate(str(payload.facilityLicenseEndDate)),
  };
}

/**
 * Looks up a facility in the Facility Registry (GET /facilities/search).
 * @param credentials - The HIE credentials.
 * @param facilityCode - An FR code (FID-…) or a KMHFL (MFL) code.
 * @returns The normalized facility record, with found 0 when there is no match.
 */
export async function searchAfyaLinkFacility(
  credentials: KenyaAfyaLinkCredentials,
  facilityCode: string
): Promise<AfyaLinkFacilitySearchResponse> {
  const code = facilityCode.trim();
  const result = await hieGet(credentials, '/facilities/search', {
    identifier: code,
    'identifier-type': getFacilityIdentifierType(code),
  });

  if (isNotFoundResult(result)) {
    return { message: { facility_code: code, found: 0 } };
  }
  if (!result.ok) {
    throw new Error(`Kenya HIE facility search failed (${result.status}): ${describeHieFailure(result)}`);
  }

  try {
    const records = Array.isArray(result.body) ? result.body : [result.body];
    const record = records.find(isRecord);
    if (!record) {
      return { message: { facility_code: code, found: 0 } };
    }
    return { message: normalizeFacilityRecord(record, code) };
  } catch (err) {
    throw new Error(`Failed to parse Kenya HIE facility search response: ${normalizeErrorString(err)}`);
  }
}

const PractitionerRegulators = new Set(['KMPDC', 'COC', 'NCK', 'PPB']);

function buildPractitionerSearchParams(
  identificationType: string,
  identificationNumber: string
): Record<string, string> {
  const type = identificationType.trim().toUpperCase();
  if (type === 'KMPDC' || type === 'COC') {
    // Licence (registration) number lookup; the registry's preferred identifier.
    return { identification_number: identificationNumber, identification_type: 'registration_number', regulator: type };
  }
  if (type === 'PPB' || type === 'NCK') {
    // Pharmacists and nurses are captured by National ID in Afiax FHIR.
    return { identification_number: identificationNumber, identification_type: 'National ID', regulator: type };
  }
  if (type === 'ID' || type === 'NATIONAL ID') {
    return { identification_number: identificationNumber, identification_type: 'National ID' };
  }
  if (type === 'ALIEN ID' || type === 'REFUGEE ID') {
    return { identification_number: identificationNumber, identification_type: identificationType.trim() };
  }
  if (type === 'REGISTRATION_NUMBER') {
    return { identification_number: identificationNumber, identification_type: 'registration_number' };
  }
  throw new Error(
    `Unsupported practitioner identification type for the DHA Health Worker Registry: ${identificationType}. Use a KMPDC, COC, PPB or NCK number, or a National, Alien or Refugee ID.`
  );
}

/**
 * Looks up a practitioner in the Health Worker Registry (GET /professionals).
 * @param credentials - The HIE credentials.
 * @param identificationType - KMPDC, COC, PPB, NCK, ID or registration_number.
 * @param identificationNumber - The licence or ID number.
 * @returns The normalized practitioner record, with found 0 when there is no match.
 */
export async function searchAfyaLinkPractitioner(
  credentials: KenyaAfyaLinkCredentials,
  identificationType: string,
  identificationNumber: string
): Promise<AfyaLinkPractitionerSearchResponse> {
  const params = buildPractitionerSearchParams(identificationType, identificationNumber.trim());
  const result = await hieGet(credentials, '/professionals', params);

  if (isNotFoundResult(result)) {
    return { message: { found: 0, registration_number: null, is_active: null } };
  }
  if (!result.ok) {
    throw new Error(`Kenya HIE practitioner search failed (${result.status}): ${describeHieFailure(result)}`);
  }

  const payload = isRecord(result.body) && isRecord(result.body.message) ? result.body.message : undefined;
  const membership = payload && isRecord(payload.membership) ? payload.membership : undefined;
  if (!payload || !membership) {
    return { message: { found: 0, registration_number: null, is_active: null } };
  }

  const identifiers = isRecord(payload.identifiers) ? payload.identifiers : {};
  const licenses = Array.isArray(payload.licenses) ? payload.licenses.filter(isRecord) : [];
  const latestLicenseEnd = licenses
    .map((license) => str(license.license_end))
    .filter((value): value is string => !!value)
    .sort()
    .pop();
  let isActive: string | boolean | null = null;
  if (typeof membership.is_active === 'number') {
    isActive = membership.is_active === 1;
  } else if (typeof membership.is_active === 'boolean' || typeof membership.is_active === 'string') {
    isActive = membership.is_active;
  }

  return {
    message: {
      found: 1,
      registration_number:
        str(membership.registration_id) ?? (PractitionerRegulators.has(params.regulator) ? identificationNumber : null),
      is_active: isActive,
      full_name: str(membership.full_name),
      licensing_body: str(membership.licensing_body),
      client_registry_id: str(identifiers.client_registry_id),
      license_end: latestLicenseEnd ?? null,
    },
  };
}

/**
 * The eligibility identification types DHA accepts. Afiax's own labels map onto them.
 * "SHA Number" and "Temporary ID" are not in DHA's list; they are passed through unchanged
 * and DHA rejects them, which surfaces as an error to the caller.
 * @param identificationType - The identification type label.
 * @returns The DHA identification type.
 */
function toHiePatientIdentificationType(identificationType: string): string {
  const normalized = identificationType
    .trim()
    .toUpperCase()
    .replace(/[_\s]+/g, ' ');
  const map: Record<string, string> = {
    'NATIONAL ID': 'National ID',
    ID: 'National ID',
    'CR ID': 'ClientRegistry ID',
    'CLIENTREGISTRY ID': 'ClientRegistry ID',
    'CLIENT REGISTRY ID': 'ClientRegistry ID',
    'BIRTH NOTIFICATION': 'Birth Notification',
    'BIRTH CERTIFICATE': 'Birth Certificate',
    'BIRTH CERTIFICATE NUMBER': 'Birth Certificate',
    'ALIEN ID': 'Alien ID',
    'REFUGEE ID': 'Refugee ID',
    'MANDATE NUMBER': 'Mandate Number',
  };
  return map[normalized] ?? identificationType.trim();
}

function isActiveCoverage(status: string | null): boolean {
  return !!status && /^(active|eligible|1|true)$/i.test(status.trim());
}

/**
 * Checks SHA eligibility (GET /patients/eligibility).
 * @param credentials - The HIE credentials.
 * @param identificationType - The patient identification type (ClientRegistry ID preferred).
 * @param identificationNumber - The identification number.
 * @returns The normalized eligibility result.
 */
export async function searchAfyaLinkEligibility(
  credentials: KenyaAfyaLinkCredentials,
  identificationType: string,
  identificationNumber: string
): Promise<AfyaLinkEligibilityResponse> {
  const hieType = toHiePatientIdentificationType(identificationType);
  const result = await hieGet(credentials, '/patients/eligibility', {
    identification_number: identificationNumber.trim(),
    identification_type: hieType,
  });

  if (isNotFoundResult(result)) {
    return {
      message: {
        eligible: 0,
        request_id_type: identificationType,
        request_id_number: identificationNumber,
        message: 'No eligibility match found',
      },
    };
  }
  if (!result.ok || !isRecord(result.body)) {
    throw new Error(`Kenya HIE eligibility check failed (${result.status}): ${describeHieFailure(result)}`);
  }

  const body = result.body;
  const schemes: AfyaLinkEligibilityScheme[] = (Array.isArray(body.schemes) ? body.schemes : [])
    .filter(isRecord)
    .map((scheme) => {
      const coverage = isRecord(scheme.coverage) ? scheme.coverage : {};
      return {
        schemeId: typeof scheme.schemeId === 'number' ? scheme.schemeId : null,
        schemeName: str(scheme.schemeName),
        memberType: str(scheme.memberType),
        coverageStatus: str(coverage.status),
        coverageStartDate: str(coverage.startDate),
        coverageEndDate: str(coverage.endDate),
        reason: str(coverage.reason),
        possibleSolution: str(coverage.possibleSolution),
      };
    });

  const isAlive = typeof body.isAlive === 'boolean' ? body.isAlive : null;
  const activeScheme = schemes.find((scheme) => isActiveCoverage(scheme.coverageStatus ?? null));
  const firstScheme = activeScheme ?? schemes[0];
  // A deceased patient is never eligible: DHA says to block every later transaction.
  const eligible = isAlive !== false && !!activeScheme;
  const statusDesc = str(body.statusDesc);

  return {
    message: {
      id: str(body.hash),
      eligible: eligible ? 1 : 0,
      full_name: str(body.fullName),
      reason: firstScheme?.reason ?? (isAlive === false ? 'Patient is recorded as deceased' : statusDesc),
      possible_solution: firstScheme?.possibleSolution ?? null,
      coverageEndDate: firstScheme?.coverageEndDate ?? null,
      transition_status: firstScheme?.coverageStatus ?? str(body.statusCode),
      request_id_number: str(body.requestIdNumber) ?? identificationNumber,
      request_id_type: identificationType,
      message: statusDesc,
      status: str(body.statusCode),
      member_cr_number: str(body.memberCrNumber),
      is_alive: isAlive,
      whitelisted_for_otp: typeof body.whitelistedForOTP === 'boolean' ? body.whitelistedForOTP : null,
      facility_biometrics_enforced:
        typeof body.facilityBiometricsEnforced === 'boolean' ? body.facilityBiometricsEnforced : null,
      schemes,
    },
  };
}

/**
 * Looks up a patient in the Client Registry (GET /patients).
 * @param credentials - The HIE credentials.
 * @param identificationType - The patient identification type.
 * @param identificationNumber - The identification number.
 * @returns The normalized patient record, with found 0 when there is no match.
 */
export async function searchAfyaLinkClientRegistry(
  credentials: KenyaAfyaLinkCredentials,
  identificationType: string,
  identificationNumber: string
): Promise<AfyaLinkClientRegistryResponse> {
  const result = await hieGet(credentials, '/patients', {
    identification_number: identificationNumber.trim(),
    identification_type: toHiePatientIdentificationType(identificationType),
  });

  const notFound: AfyaLinkClientRegistryResponse = {
    message: { found: 0, identification_type: identificationType, identification_number: identificationNumber },
  };
  if (isNotFoundResult(result)) {
    return notFound;
  }
  if (!result.ok) {
    throw new Error(`Kenya HIE client registry lookup failed (${result.status}): ${describeHieFailure(result)}`);
  }

  const record = Array.isArray(result.body) ? result.body.find(isRecord) : result.body;
  if (!isRecord(record) || !str(record.id)) {
    return notFound;
  }

  const firstName = str(record.first_name);
  const middleName = str(record.middle_name);
  const lastName = str(record.last_name);
  return {
    message: {
      found: 1,
      client_registry_id: str(record.id),
      full_name: [firstName, middleName, lastName].filter(Boolean).join(' ') || null,
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      date_of_birth: str(record.date_of_birth),
      gender: str(record.gender),
      phone: str(record.phone),
      identification_type: str(record.identification_type) ?? identificationType,
      identification_number: str(record.identification_number) ?? identificationNumber,
      account_status: str(record.deceased_datetime) ? 'deceased' : null,
    },
  };
}

/**
 * Publishing to the Shared Health Record now needs patient consent and an open visit
 * (POST /shr/consents, verify the OTP, then POST /shr/bundles with the visit's consent).
 * That flow is not built yet, so this fails clearly instead of calling the retired endpoint.
 * @param _credentials - The HIE credentials.
 * @param _bundle - The FHIR bundle to publish.
 * @returns Never returns.
 */
export async function publishToAfyaLinkShr(
  _credentials: KenyaAfyaLinkCredentials,
  _bundle: Record<string, unknown>
): Promise<AfyaLinkShrPublicationResponse> {
  throw new Error(
    'Kenya Shared Health Record publication is not available yet: DHA now requires patient consent and an open visit (POST /shr/consents, then POST /shr/bundles), which Afiax FHIR does not implement yet.'
  );
}
