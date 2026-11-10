// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA visit consent and start visit through the DHA HIE middleware.
//
// Follows https://hie-docs.dha.go.ke (checked 2026-11-10, pages last modified 2026-09-28):
// - Start Visit Process Overview and Start Visit Workflow (docs/claims/process/startVisitConsent)
// - Send OTP and Get Beneficiary Valid Contact (docs/consent/process)
// - Biometrics Consent, Biometrics Integration Guide and the OTP fallback for patients with no
//   usable fingerprints (docs/consent)
//
// Consent comes first, by one of two paths. The eligibility check says which applies:
// facilityBiometricsEnforced means fingerprints, unless the patient is whitelistedForOTP.
// - OTP: optionally pick a contact (GET /patients/contacts), send the OTP (POST /claims/otp),
//   then pass the OTP the patient reads out to POST /claims/visit.
// - Biometrics: POST /claims/authorize with the HealthID workstation and agent, show the
//   returned capture page, wait for the authorization to become AUTHORIZED, then pass its GUID
//   to POST /claims/visit. A REJECTED authorization with BIOMETRICS_NOT_FOUND_OTP_ALLOWED means
//   the patient may use OTP instead. A capture that times out stays PENDING and must be rejected
//   before a new one can be created.
// POST /claims/visit returns the visit claim. Its authorization_code is the consent token that
// every later claim call for the visit needs.
import type { HieResult, KenyaAfyaLinkCredentials } from './afyalink';
import { describeHieFailure, requestKenyaHie } from './afyalink';

export type KenyaShaServiceType = 'OUTPATIENT' | 'INPATIENT' | 'CAPITATION' | 'EMERGENCY';

export const KenyaShaServiceTypes: readonly KenyaShaServiceType[] = [
  'OUTPATIENT',
  'INPATIENT',
  'CAPITATION',
  'EMERGENCY',
];

export interface KenyaHieContact {
  readonly id: number;
  /** Masked by DHA, for example +254714***898. Show it to the patient to choose. */
  readonly value: string | null;
  readonly type: string | null;
  readonly confirmed: boolean;
  readonly active: boolean;
  /** The patient's main contact, which DHA uses when no contact is chosen. */
  readonly main: boolean;
}

export interface KenyaHieAuthorization {
  readonly guid: string | null;
  /** The consent token for later calls on this authorization. */
  readonly token: string | null;
  readonly status: string | null;
  readonly reason: string | null;
  readonly serviceType: string | null;
  readonly expiry: string | null;
  readonly isElective: boolean | null;
  readonly beneficiaryName: string | null;
  /** Fingerprint capture page to show to the patient (biometrics path). */
  readonly captureUrl: string | null;
  readonly captureToken: string | null;
  readonly captureExpiresIn: number | null;
}

export interface KenyaHieBiometricsAuthorizationInput {
  readonly patientId: string;
  readonly serviceType: KenyaShaServiceType;
  readonly interventionCodes: readonly string[];
  /** National ID of the biometrics agent registered on HealthID. */
  readonly agentId: string;
  /** The workstationID from HealthID's local status endpoint (http://localhost:18065/status). */
  readonly workStationId: string;
  readonly deviceOs: string;
  /** The facility's FR code. */
  readonly facilityFrCode: string;
  /** The facility name, sent as ekyc_provider_id. */
  readonly facilityName: string;
  readonly isEmergency?: boolean;
}

export interface KenyaHieStartVisitInput {
  readonly patientId: string;
  readonly serviceType: KenyaShaServiceType;
  readonly interventionCodes: readonly string[];
  /** OTP path. */
  readonly otp?: string;
  /** Biometrics path: the GUID of an AUTHORIZED authorization. */
  readonly authorizationGuid?: string;
  readonly practitioner?: {
    readonly identificationType: 'registration_number' | 'National ID' | 'Alien ID' | 'Refugee ID';
    readonly identificationNumber: string;
    readonly regulator: 'KMPDC' | 'COC' | 'NCK' | 'PPB';
  };
}

export interface KenyaHieVisit {
  readonly claimId: string | null;
  /** The consent token for every later claim call on this visit. */
  readonly consentToken: string | null;
  readonly authorizationGuid: string | null;
  readonly visitNumber: string | null;
  readonly serviceType: string | null;
  readonly workflowState: string | null;
  readonly claimAuthStatus: string | null;
  readonly visitStart: string | null;
  readonly memberName: string | null;
  readonly schemeName: string | null;
  readonly interventions: readonly {
    readonly code: string | null;
    readonly name: string | null;
    readonly needsPreauth: boolean | null;
    readonly paymentMechanism: string | null;
  }[];
}

export class KenyaHieRequestError extends Error {
  readonly status: number;
  constructor(action: string, result: HieResult) {
    super(`Kenya HIE ${action} failed (${result.status}): ${describeHieFailure(result)}`);
    this.name = 'KenyaHieRequestError';
    this.status = result.status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value === 'number') {
    return String(value);
  }
  return typeof value === 'string' && value.trim() ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function requireCodes(interventionCodes: readonly string[]): string[] {
  const codes = interventionCodes.map((code) => code.trim()).filter(Boolean);
  if (codes.length === 0) {
    throw new Error('At least one SHA intervention code is required');
  }
  return codes;
}

function requireValue(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

export function normalizeAuthorization(payload: Record<string, unknown>): KenyaHieAuthorization {
  const capture = isRecord(payload.shaVerificationRequest) ? payload.shaVerificationRequest : {};
  return {
    guid: str(payload.guid),
    token: str(payload.token),
    status: str(payload.status),
    reason: str(payload.authorizationReason),
    serviceType: str(payload.sessionType) ?? str(payload.benefitType),
    expiry: str(payload.expiry),
    isElective: bool(payload.isElective),
    beneficiaryName: str(payload.beneficiaryName),
    captureUrl: str(capture.requestUrl),
    captureToken: str(capture.embededToken),
    captureExpiresIn: typeof capture.embedExpiry === 'number' ? capture.embedExpiry : null,
  };
}

/**
 * Lists the patient's registered contacts (GET /patients/contacts). The values are masked.
 * @param credentials - The HIE credentials.
 * @param patientId - The patient's Client Registry ID.
 * @returns The contacts.
 */
export async function getKenyaHiePatientContacts(
  credentials: KenyaAfyaLinkCredentials,
  patientId: string
): Promise<KenyaHieContact[]> {
  const result = await requestKenyaHie(credentials, 'GET', '/patients/contacts', {
    params: { patient_id: requireValue(patientId, 'The patient Client Registry ID') },
  });
  if (!result.ok) {
    throw new KenyaHieRequestError('patient contacts lookup', result);
  }
  const results = isRecord(result.body) && Array.isArray(result.body.results) ? result.body.results : [];
  return results.filter(isRecord).map((contact) => ({
    id: typeof contact.id === 'number' ? contact.id : Number(contact.id),
    value: str(contact.contactValue),
    type: str(contact.contactType),
    confirmed: contact.isConfirmed === true,
    active: contact.active !== false,
    main: contact.isMainContact === true,
  }));
}

/**
 * Sends the start-visit OTP to the patient (POST /claims/otp).
 * @param credentials - The HIE credentials.
 * @param input - The patient, the intervention codes for the visit and an optional contact.
 * @param input.patientId - The patient's Client Registry ID.
 * @param input.interventionCodes - The SHA intervention codes being authorized.
 * @param input.contactId - Optional contact from getKenyaHiePatientContacts; otherwise the default.
 * @returns DHA's confirmation message.
 */
export async function sendKenyaHieVisitOtp(
  credentials: KenyaAfyaLinkCredentials,
  input: { readonly patientId: string; readonly interventionCodes: readonly string[]; readonly contactId?: number }
): Promise<{ readonly message: string | null }> {
  const body: Record<string, unknown> = {
    patient_id: requireValue(input.patientId, 'The patient Client Registry ID'),
    intervention_codes: requireCodes(input.interventionCodes),
  };
  if (input.contactId !== undefined) {
    body.contact_id = input.contactId;
  }
  const result = await requestKenyaHie(credentials, 'POST', '/claims/otp', { body });
  if (!result.ok) {
    throw new KenyaHieRequestError('send OTP', result);
  }
  return { message: isRecord(result.body) ? str(result.body.message) : null };
}

/**
 * Creates a fingerprint authorization (POST /claims/authorize, biometrics variant). It starts
 * PENDING and returns the capture page to show to the patient.
 * @param credentials - The HIE credentials.
 * @param input - The biometrics authorization details.
 * @returns The authorization.
 */
export async function createKenyaHieBiometricsAuthorization(
  credentials: KenyaAfyaLinkCredentials,
  input: KenyaHieBiometricsAuthorizationInput
): Promise<KenyaHieAuthorization> {
  const body = {
    agent_id: requireValue(input.agentId, 'The biometrics agent National ID'),
    authorizing_device_os: requireValue(input.deviceOs, 'The workstation operating system'),
    ekyc_provider_id: requireValue(input.facilityName, 'The facility name'),
    // "SHA" is eKYC against the national register (adults); minors use their own flow.
    factors: ['SHA'],
    interventions: requireCodes(input.interventionCodes),
    is_biometrics_discharge_authorization: false,
    is_emergency: input.isEmergency === true,
    is_integration: true,
    patient_id: requireValue(input.patientId, 'The patient Client Registry ID'),
    provider: requireValue(input.facilityFrCode, 'The facility FR code'),
    service_type: input.serviceType,
    work_station_id: requireValue(input.workStationId, 'The HealthID workstation ID'),
  };
  const result = await requestKenyaHie(credentials, 'POST', '/claims/authorize', { body });
  if (!result.ok || !isRecord(result.body)) {
    throw new KenyaHieRequestError('biometrics authorization', result);
  }
  return normalizeAuthorization(result.body);
}

/**
 * Creates a pre-visit authorization by OTP (POST /claims/authorize, OTP variant), for an elective
 * case before any visit exists. DHA returns it AUTHORIZED_PENDING_VISIT; its token is the
 * consent_token for the elective preauth. The OTP comes from POST /claims/otp (sendKenyaHieVisitOtp).
 * Body as in DHA's Postman collection "Create Authorization for OTP Visit" and the Pre-Visit
 * Authorization guide (docs/claims/process/eligibility/preVisitAuthorization).
 * @param credentials - The HIE credentials.
 * @param input - The patient, service type, interventions and OTP.
 * @param input.patientId - The patient's Client Registry ID.
 * @param input.serviceType - OUTPATIENT or INPATIENT.
 * @param input.interventionCodes - The planned interventions.
 * @param input.otp - The OTP the patient received.
 * @returns The authorization.
 */
export async function createKenyaHieOtpAuthorization(
  credentials: KenyaAfyaLinkCredentials,
  input: {
    readonly patientId: string;
    readonly serviceType: 'OUTPATIENT' | 'INPATIENT';
    readonly interventionCodes: readonly string[];
    readonly otp: string;
  }
): Promise<KenyaHieAuthorization> {
  if (input.serviceType !== 'OUTPATIENT' && input.serviceType !== 'INPATIENT') {
    throw new Error('A pre-visit authorization is for OUTPATIENT or INPATIENT services');
  }
  const body = {
    patient_id: requireValue(input.patientId, 'The patient Client Registry ID'),
    service_type: input.serviceType,
    otp: requireValue(input.otp, 'The OTP'),
    interventions: requireCodes(input.interventionCodes),
  };
  const result = await requestKenyaHie(credentials, 'POST', '/claims/authorize', { body });
  if (!result.ok || !isRecord(result.body)) {
    throw new KenyaHieRequestError('pre-visit authorization', result);
  }
  return normalizeAuthorization(result.body);
}

/**
 * Reads an authorization (GET /claims/authorizations) by GUID or consent token. DHA documents a
 * patient_id search too, but UAT rejects it ("kindly provide guid or token"), so it is not offered.
 * @param credentials - The HIE credentials.
 * @param query - The authorization GUID or its consent token.
 * @param query.guid - The authorization GUID.
 * @param query.token - The consent token.
 * @returns The matching authorizations.
 */
export async function getKenyaHieAuthorizations(
  credentials: KenyaAfyaLinkCredentials,
  query: { readonly guid?: string; readonly token?: string }
): Promise<KenyaHieAuthorization[]> {
  let params: Record<string, string>;
  if (query.guid?.trim()) {
    params = { guid: query.guid.trim() };
  } else if (query.token?.trim()) {
    params = { token: query.token.trim() };
  } else {
    throw new Error('An authorization GUID or consent token is required');
  }
  const result = await requestKenyaHie(credentials, 'GET', '/claims/authorizations', { params });
  if (!result.ok) {
    throw new KenyaHieRequestError('authorization lookup', result);
  }
  const records = Array.isArray(result.body) ? result.body : [result.body];
  return records.filter(isRecord).map(normalizeAuthorization);
}

/**
 * Rejects a pending authorization (POST /claims/authorizations/{token}/reject), for example a
 * fingerprint capture that timed out and still blocks a new authorization.
 * @param credentials - The HIE credentials.
 * @param consentToken - The authorization's consent token.
 */
export async function rejectKenyaHieAuthorization(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string
): Promise<void> {
  const token = requireValue(consentToken, 'The authorization consent token');
  const result = await requestKenyaHie(
    credentials,
    'POST',
    `/claims/authorizations/${encodeURIComponent(token)}/reject`
  );
  if (!result.ok) {
    throw new KenyaHieRequestError('authorization reject', result);
  }
}

function normalizeVisit(payload: Record<string, unknown>): KenyaHieVisit {
  const interventions = (Array.isArray(payload.interventions) ? payload.interventions : [])
    .filter(isRecord)
    .map((intervention) => ({
      code: str(intervention.intervention_code),
      name: str(intervention.intervention_name),
      needsPreauth: bool(intervention.needs_preauth),
      paymentMechanism: str(intervention.intervention_payment_mechanism),
    }));
  return {
    claimId: str(payload.claim_id) ?? str(payload.id),
    consentToken: str(payload.authorization_code),
    authorizationGuid: str(payload.authorization_guid),
    visitNumber: str(payload.visit_number),
    serviceType: str(payload.service_type),
    workflowState: str(payload.workflow_state),
    claimAuthStatus: str(payload.claim_auth_status),
    visitStart: str(payload.visit_start),
    memberName: str(payload.member_name),
    schemeName: str(payload.scheme_name),
    interventions,
  };
}

/**
 * Starts the SHA visit (POST /claims/visit), creating the visit claim.
 * @param credentials - The HIE credentials.
 * @param input - The patient, service type, interventions and either an OTP or an authorization GUID.
 * @returns The visit, including the consent token for later claim calls.
 */
export async function startKenyaHieVisit(
  credentials: KenyaAfyaLinkCredentials,
  input: KenyaHieStartVisitInput
): Promise<KenyaHieVisit> {
  const otp = input.otp?.trim();
  const authorizationGuid = input.authorizationGuid?.trim();
  if (!otp === !authorizationGuid) {
    throw new Error('Provide either the OTP the patient received or the GUID of an authorized fingerprint consent');
  }
  if (!KenyaShaServiceTypes.includes(input.serviceType)) {
    throw new Error(`Unsupported SHA service type: ${input.serviceType}`);
  }
  const body: Record<string, unknown> = {
    intervention_codes: requireCodes(input.interventionCodes),
    patient_id: requireValue(input.patientId, 'The patient Client Registry ID'),
    service_type: input.serviceType,
    ...(otp ? { otp } : { auth_guid: authorizationGuid }),
  };
  if (input.practitioner) {
    body.practitioner_identification_type = input.practitioner.identificationType;
    body.practitioner_identification_number = requireValue(
      input.practitioner.identificationNumber,
      'The practitioner identification number'
    );
    body.practitioner_regulation_body = input.practitioner.regulator;
  }
  const result = await requestKenyaHie(credentials, 'POST', '/claims/visit', { body });
  if (!result.ok || !isRecord(result.body)) {
    throw new KenyaHieRequestError('start visit', result);
  }
  const visit = normalizeVisit(result.body);
  if (!visit.consentToken) {
    throw new Error('Kenya HIE start visit response did not include an authorization_code (consent token)');
  }
  return visit;
}
