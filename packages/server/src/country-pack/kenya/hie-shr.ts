// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The Shared Health Record (SHR) through the DHA HIE middleware: consent, visit, read, write.
//
// Built against DHA's own sources, checked 2026-11-10:
// - hie-docs.dha.go.ke "Introduction to the Shared Health Record" (last modified 2026-09-28);
// - the live SHR API reference (/sharedhealthrecord/shr-consent and /shr-records), all 13
//   endpoints;
// - DHA's Postman collection (published 2026-10-07), Shared Health Records folder.
//
// Lifecycle (DHA):
// 1. Consent. GET /shr/open-visits first: an open visit at the facility is reused (refresh its
//    token), and a patient with one cannot start another. Otherwise POST /shr/consents:
//    - standard: an OTP goes to the patient; returns consent_id and otp_record;
//    - emergency (emergency 1 + incapacity_reason): approved at once, returns visit_id and
//      consent_token;
//    - dependant (representative_cr_id + representative_relationship; for an incapacitated adult
//      also patient_capable 0 + incapacity_reason): the OTP goes to the representative.
//    resend-otp returns a new otp_record, which must then be used.
// 2. Verify. POST /shr/consents/{id}/verify with otp_record + otp returns consent_token and
//    visit_id. A refusal is recorded with consent_decision Reject + rejection_reason (no token).
// 3. Write. POST /shr/bundles: a FHIR collection Bundle with an id (echoed as mediator_id); every
//    resource needs an id; the Encounter references the visit's EpisodeOfCare and every clinical
//    resource references that Encounter. Accepted means queued, not persisted.
// 4. Read. GET /shr/patient-records (cr_id, practitioner_id, resources) with X-Consent-Token;
//    GET /shr/Observation (subject) with X-Consent-Token and X-PUID; GET /shr/ServiceRequest
//    (referrals by performer or requester organisation, no consent token).
// Close. POST /shr/visits/{id}/close normally returns an otp_record, completed through verify with
// the password (the response then carries end_date); it may close at once (end_date). With
// patient_incapable 1 + incapacity_reason it closes at once. A closed visit's token cannot be
// refreshed.
//
// The consent token is per visit and per patient: never reused across visits or patients.
//
// Where DHA's sources disagree: Postman sends X-Consent-Token on POST /shr/bundles; the API
// reference lists no header there. It is sent (harmless if ignored). Postman's X-HIE-Callback
// header is undocumented and not sent.
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { requestKenyaHie } from './afyalink';
import { KenyaHieRequestError } from './hie-visit';

/** The resource types the SHR accepts and holds (DHA SHR API reference). */
export const KenyaShrResourceTypes = [
  'Encounter',
  'EpisodeOfCare',
  'Observation',
  'Condition',
  'Procedure',
  'Medication',
  'MedicationRequest',
  'MedicationDispense',
  'MedicationAdministration',
  'Immunization',
  'ServiceRequest',
  'AllergyIntolerance',
] as const;
export type KenyaShrResourceType = (typeof KenyaShrResourceTypes)[number];

export const KenyaShrRepresentativeRelationships = ['Healthcare Proxy', 'Sibling', 'Principal', 'Other'] as const;

export interface KenyaShrConsentRequest {
  readonly crId: string;
  /** The facility's FR code. */
  readonly facilityFrCode: string;
  /** Name or role of the person asking, for DHA's audit trail. */
  readonly requestedBy: string;
  readonly visitType: 'OP' | 'IP';
  /** The clinician's PUID; DHA asks for it on every request. */
  readonly practitionerId?: string;
  /** YYYY-MM-DD; DHA defaults to today. */
  readonly startDate?: string;
  /** Emergency: the patient cannot consent at the point of care. */
  readonly emergency?: { readonly incapacityReason: string };
  /** Dependant: consent goes to a representative. */
  readonly representative?: {
    readonly crId: string;
    readonly relationship: string;
    /** For an incapacitated adult (patient_capable 0); not for a minor. */
    readonly incapacityReason?: string;
  };
}

export interface KenyaShrConsent {
  readonly consentId: string | null;
  readonly consentStatus: string | null;
  readonly otpRecord: string | null;
  readonly visitId: string | null;
  readonly consentToken: string | null;
  readonly endDate: string | null;
  readonly message: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

function toConsent(body: unknown): KenyaShrConsent {
  const b = isRecord(body) ? body : {};
  return {
    consentId: str(b.consent_id),
    consentStatus: str(b.consent_status),
    otpRecord: str(b.otp_record),
    visitId: str(b.visit_id),
    consentToken: str(b.consent_token),
    endDate: str(b.end_date),
    message: str(b.message),
  };
}

async function call(
  credentials: KenyaAfyaLinkCredentials,
  action: string,
  method: 'GET' | 'POST',
  path: string,
  options?: Parameters<typeof requestKenyaHie>[3]
): Promise<unknown> {
  const result = await requestKenyaHie(credentials, method, path, options);
  if (!result.ok) {
    throw new KenyaHieRequestError(action, result);
  }
  return result.body;
}

/**
 * Visits at the facility that still hold an open consent for the patient (GET /shr/open-visits).
 * @param credentials - The HIE credentials.
 * @param crId - The patient's Client Registry ID.
 * @param facilityFrCode - The facility's FR code.
 * @returns The open visit ids.
 */
export async function getKenyaShrOpenVisits(
  credentials: KenyaAfyaLinkCredentials,
  crId: string,
  facilityFrCode: string
): Promise<string[]> {
  const body = await call(credentials, 'SHR open visits', 'GET', '/shr/open-visits', {
    params: {
      patient_id: required(crId, 'The patient Client Registry ID'),
      facility_id: required(facilityFrCode, 'The facility FR code'),
    },
  });
  const visits = isRecord(body) && Array.isArray(body.visits) ? body.visits : [];
  return visits.map((v) => (isRecord(v) ? str(v.visit_id) : null)).filter((v): v is string => !!v);
}

/**
 * Starts a consent request (POST /shr/consents): standard, emergency or dependant.
 * @param credentials - The HIE credentials.
 * @param input - The consent request.
 * @returns The consent (otp_record for OTP; visit_id and consent_token for an emergency).
 */
export async function requestKenyaShrConsent(
  credentials: KenyaAfyaLinkCredentials,
  input: KenyaShrConsentRequest
): Promise<KenyaShrConsent> {
  if (input.visitType !== 'OP' && input.visitType !== 'IP') {
    throw new Error('The SHR visit type must be OP or IP');
  }
  if (input.emergency && input.representative) {
    throw new Error('A consent request is either an emergency or a dependant request, not both');
  }
  const body: Record<string, unknown> = {
    cr_id: required(input.crId, 'The patient Client Registry ID'),
    facility_id: required(input.facilityFrCode, 'The facility FR code'),
    requested_by: required(input.requestedBy, 'Who is requesting consent'),
    visit_type: input.visitType,
  };
  if (input.practitionerId?.trim()) {
    body.practitioner_id = input.practitionerId.trim();
  }
  if (input.startDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) {
      throw new Error('The SHR visit start date must be YYYY-MM-DD');
    }
    body.start_date = input.startDate;
  }
  if (input.emergency) {
    body.emergency = 1;
    body.incapacity_reason = required(input.emergency.incapacityReason, 'The reason the patient cannot consent');
  }
  if (input.representative) {
    const relationship = input.representative.relationship?.trim();
    if (!(KenyaShrRepresentativeRelationships as readonly string[]).includes(relationship)) {
      throw new Error(
        `The representative relationship must be one of ${KenyaShrRepresentativeRelationships.join(', ')}`
      );
    }
    body.representative_cr_id = required(input.representative.crId, "The representative's Client Registry ID");
    body.representative_relationship = relationship;
    if (input.representative.incapacityReason?.trim()) {
      body.patient_capable = 0;
      body.incapacity_reason = input.representative.incapacityReason.trim();
    }
  }
  return toConsent(await call(credentials, 'SHR consent request', 'POST', '/shr/consents', { body }));
}

/**
 * Records the patient's decision (POST /shr/consents/{id}/verify): approve with the OTP, or refuse
 * with a reason. Also completes an OTP-gated visit closure (the close call's otp_record).
 * @param credentials - The HIE credentials.
 * @param consentId - The consent id.
 * @param input - The OTP record and password, or a refusal.
 * @param input.otpRecord - The otp_record to verify against.
 * @param input.otp - The password the patient (or representative) received.
 * @param input.rejectionReason - When the patient refuses: why.
 * @returns The consent.
 */
export async function verifyKenyaShrConsent(
  credentials: KenyaAfyaLinkCredentials,
  consentId: string,
  input: { readonly otpRecord?: string; readonly otp?: string; readonly rejectionReason?: string }
): Promise<KenyaShrConsent> {
  const id = encodeURIComponent(required(consentId, 'The consent id'));
  let body: Record<string, string>;
  if (input.rejectionReason?.trim()) {
    body = { consent_decision: 'Reject', rejection_reason: input.rejectionReason.trim() };
    if (input.otpRecord?.trim()) {
      body.otp_record = input.otpRecord.trim();
    }
  } else {
    body = {
      otp_record: required(input.otpRecord, 'The OTP record'),
      otp: required(input.otp, 'The OTP'),
    };
  }
  return toConsent(await call(credentials, 'SHR consent verify', 'POST', `/shr/consents/${id}/verify`, { body }));
}

/**
 * The state of a consent request (GET /shr/consents/{id}/status).
 * @param credentials - The HIE credentials.
 * @param consentId - The consent id.
 * @returns The consent.
 */
export async function getKenyaShrConsentStatus(
  credentials: KenyaAfyaLinkCredentials,
  consentId: string
): Promise<KenyaShrConsent> {
  const id = encodeURIComponent(required(consentId, 'The consent id'));
  return toConsent(await call(credentials, 'SHR consent status', 'GET', `/shr/consents/${id}/status`));
}

/**
 * Resends the consent OTP (POST /shr/consents/{id}/resend-otp). Use the new otp_record.
 * @param credentials - The HIE credentials.
 * @param consentId - The consent id.
 * @returns The consent, with the new otp_record.
 */
export async function resendKenyaShrConsentOtp(
  credentials: KenyaAfyaLinkCredentials,
  consentId: string
): Promise<KenyaShrConsent> {
  const id = encodeURIComponent(required(consentId, 'The consent id'));
  return toConsent(await call(credentials, 'SHR resend OTP', 'POST', `/shr/consents/${id}/resend-otp`));
}

/**
 * A fresh consent token for an open visit (POST /shr/visits/{id}/refresh).
 * @param credentials - The HIE credentials.
 * @param visitId - The SHR visit id.
 * @returns The consent, with the new token.
 */
export async function refreshKenyaShrVisit(
  credentials: KenyaAfyaLinkCredentials,
  visitId: string
): Promise<KenyaShrConsent> {
  const id = encodeURIComponent(required(visitId, 'The SHR visit id'));
  return toConsent(await call(credentials, 'SHR visit refresh', 'POST', `/shr/visits/${id}/refresh`));
}

/**
 * Closes the visit (POST /shr/visits/{id}/close). Usually returns an otp_record to verify; may
 * close at once (end_date). For a patient who cannot consent to the closure, pass the reason and
 * it closes at once.
 * @param credentials - The HIE credentials.
 * @param visitId - The SHR visit id.
 * @param incapacityReason - When the patient cannot consent to the closure (unconscious, deceased).
 * @returns The consent (otp_record, or end_date when closed).
 */
export async function closeKenyaShrVisit(
  credentials: KenyaAfyaLinkCredentials,
  visitId: string,
  incapacityReason?: string
): Promise<KenyaShrConsent> {
  const id = encodeURIComponent(required(visitId, 'The SHR visit id'));
  const body = incapacityReason?.trim()
    ? { patient_incapable: 1, incapacity_reason: incapacityReason.trim() }
    : undefined;
  return toConsent(
    await call(credentials, 'SHR visit close', 'POST', `/shr/visits/${id}/close`, body ? { body } : undefined)
  );
}

/**
 * Checks a bundle against the rules DHA states for POST /shr/bundles.
 * @param bundle - The bundle.
 * @returns The problems found (empty when it passes).
 */
export function checkKenyaShrBundle(bundle: Record<string, unknown>): string[] {
  const problems: string[] = [];
  if (bundle.resourceType !== 'Bundle') {
    problems.push('resourceType must be Bundle');
  }
  if (!str(bundle.id)) {
    problems.push('the bundle needs an id (DHA echoes it as mediator_id)');
  }
  if (bundle.type !== undefined && bundle.type !== 'collection') {
    problems.push('the bundle type must be collection');
  }
  const resources = (Array.isArray(bundle.entry) ? bundle.entry : [])
    .map((e) => (isRecord(e) && isRecord(e.resource) ? e.resource : undefined))
    .filter((r): r is Record<string, unknown> => !!r);
  if (!resources.length) {
    problems.push('the bundle has no resources');
  }
  for (const r of resources) {
    const type = String(r.resourceType);
    if (!(KenyaShrResourceTypes as readonly string[]).includes(type)) {
      problems.push(`${type} is not a resource type the SHR accepts`);
    }
    if (!str(r.id)) {
      problems.push(`a ${type} has no id`);
    }
  }
  const encounters = resources.filter((r) => r.resourceType === 'Encounter');
  const episodes = new Set(
    resources.filter((r) => r.resourceType === 'EpisodeOfCare').map((r) => `EpisodeOfCare/${String(r.id)}`)
  );
  if (encounters.length !== 1) {
    problems.push('the bundle needs exactly one Encounter');
  } else {
    const encounter = encounters[0];
    const episodeRefs = (Array.isArray(encounter.episodeOfCare) ? encounter.episodeOfCare : [])
      .map((e) => (isRecord(e) ? str(e.reference) : null))
      .filter((e): e is string => !!e);
    if (!episodeRefs.length) {
      problems.push("the Encounter must reference the visit's EpisodeOfCare");
    } else if (episodes.size && !episodeRefs.some((e) => episodes.has(e))) {
      problems.push('the Encounter references an EpisodeOfCare that is not in the bundle');
    }
    const encounterRef = `Encounter/${String(encounter.id)}`;
    for (const r of resources) {
      // Medication has no encounter element in FHIR.
      if (r.resourceType === 'Encounter' || r.resourceType === 'EpisodeOfCare' || r.resourceType === 'Medication') {
        continue;
      }
      // FHIR R4/R4B: MedicationDispense and MedicationAdministration link the encounter as context.
      const link =
        r.resourceType === 'MedicationDispense' || r.resourceType === 'MedicationAdministration'
          ? r.context
          : r.encounter;
      const ref = isRecord(link) ? str(link.reference) : null;
      if (ref !== encounterRef) {
        problems.push(`${String(r.resourceType)}/${String(r.id)} must reference ${encounterRef}`);
      }
    }
  }
  return problems;
}

/**
 * Writes a FHIR collection Bundle to the SHR (POST /shr/bundles), after checking DHA's rules.
 * Accepted means queued: confirm a resource landed by reading it back.
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param bundle - The bundle.
 * @returns The mediator_id (the bundle id) and DHA's message.
 */
export async function submitKenyaShrBundle(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  bundle: Record<string, unknown>
): Promise<{ readonly mediatorId: string | null; readonly message: string | null }> {
  const problems = checkKenyaShrBundle(bundle);
  if (problems.length) {
    throw new Error(`The bundle does not meet DHA's SHR rules: ${problems.join('; ')}`);
  }
  const body = await call(credentials, 'SHR bundle submit', 'POST', '/shr/bundles', {
    body: bundle,
    headers: { 'X-Consent-Token': required(consentToken, 'The SHR consent token') },
  });
  const b = isRecord(body) ? body : {};
  return { mediatorId: str(b.mediator_id), message: str(b.message) };
}

/**
 * Reads the patient's records (GET /shr/patient-records), consent-scoped.
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The patient, practitioner, resource types and paging.
 * @param input.crId - The patient's Client Registry ID.
 * @param input.practitionerId - The reading practitioner's Health Worker Registry id.
 * @param input.resources - The resource types to return.
 * @param input.pageToken - The next page token.
 * @returns DHA's FHIR search result, unchanged.
 */
export async function getKenyaShrPatientRecords(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: {
    readonly crId: string;
    readonly practitionerId: string;
    readonly resources: readonly string[];
    readonly pageToken?: string;
  }
): Promise<unknown> {
  const resources = input.resources.map((r) => r.trim()).filter(Boolean);
  if (!resources.length) {
    throw new Error('At least one resource type is required');
  }
  const unknown = resources.filter((r) => !(KenyaShrResourceTypes as readonly string[]).includes(r));
  if (unknown.length) {
    throw new Error(`The SHR does not hold ${unknown.join(', ')}`);
  }
  const params: Record<string, string> = {
    cr_id: required(input.crId, 'The patient Client Registry ID'),
    practitioner_id: required(input.practitionerId, 'The practitioner id'),
    resources: resources.join(','),
  };
  if (input.pageToken?.trim()) {
    params.page_token = input.pageToken.trim();
  }
  return call(credentials, 'SHR patient records', 'GET', '/shr/patient-records', {
    params,
    headers: { 'X-Consent-Token': required(consentToken, 'The SHR consent token') },
  });
}

/**
 * The patient's observations as a FHIR searchset (GET /shr/Observation), consent-scoped and
 * attributed to the clinician (X-PUID).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The patient, clinician and paging.
 * @param input.crId - The patient's Client Registry ID.
 * @param input.practitionerId - The clinician's PUID.
 * @param input.pageToken - The next page token.
 * @returns DHA's searchset Bundle.
 */
export async function getKenyaShrObservations(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: { readonly crId: string; readonly practitionerId: string; readonly pageToken?: string }
): Promise<unknown> {
  const params: Record<string, string> = { subject: required(input.crId, 'The patient Client Registry ID') };
  if (input.pageToken?.trim()) {
    params.page_token = input.pageToken.trim();
  }
  return call(credentials, 'SHR observations', 'GET', '/shr/Observation', {
    params,
    headers: {
      'X-Consent-Token': required(consentToken, 'The SHR consent token'),
      'X-PUID': required(input.practitionerId, "The clinician's PUID"),
    },
  });
}

/**
 * Referrals addressed to, or raised by, a facility (GET /shr/ServiceRequest). Not consent-scoped.
 * @param credentials - The HIE credentials.
 * @param input - Which side, the facility, and filters.
 * @param input.direction - incoming (performer) or outgoing (requester).
 * @param input.facilityFrCode - The facility's FR code.
 * @param input.status - A FHIR ServiceRequest status.
 * @param input.count - Page size.
 * @param input.pageToken - The next page token.
 * @returns DHA's searchset Bundle.
 */
export async function getKenyaShrReferrals(
  credentials: KenyaAfyaLinkCredentials,
  input: {
    readonly direction: 'incoming' | 'outgoing';
    readonly facilityFrCode: string;
    readonly status?: string;
    readonly count?: number;
    readonly pageToken?: string;
  }
): Promise<unknown> {
  const statuses = ['draft', 'active', 'on-hold', 'revoked', 'completed', 'entered-in-error', 'unknown'];
  const params: Record<string, string> = {
    [input.direction === 'incoming' ? 'performer:Organization' : 'requester:Organization']: required(
      input.facilityFrCode,
      'The facility FR code'
    ),
  };
  if (input.status) {
    if (!statuses.includes(input.status)) {
      throw new Error(`The referral status must be one of ${statuses.join(', ')}`);
    }
    params.status = input.status;
  }
  if (input.count !== undefined) {
    params.count = String(input.count);
  }
  if (input.pageToken?.trim()) {
    params.page_token = input.pageToken.trim();
  }
  return call(credentials, 'SHR referrals', 'GET', '/shr/ServiceRequest', { params });
}

/**
 * Security labels: the catalogue (GET /shr/security-labels), or those for a resource type or code
 * (GET /shr/resource-labels).
 * @param credentials - The HIE credentials.
 * @param query - resourceName and/or code for a lookup; neither for the catalogue.
 * @param query.resourceName - A FHIR resource type.
 * @param query.code - A code.
 * @returns DHA's response.
 */
export async function getKenyaShrSecurityLabels(
  credentials: KenyaAfyaLinkCredentials,
  query: { readonly resourceName?: string; readonly code?: string } = {}
): Promise<unknown> {
  const params: Record<string, string> = {};
  if (query.resourceName?.trim()) {
    params.resource_name = query.resourceName.trim();
  }
  if (query.code?.trim()) {
    params.code = query.code.trim();
  }
  if (!Object.keys(params).length) {
    return call(credentials, 'SHR security labels', 'GET', '/shr/security-labels');
  }
  return call(credentials, 'SHR resource labels', 'GET', '/shr/resource-labels', { params });
}
