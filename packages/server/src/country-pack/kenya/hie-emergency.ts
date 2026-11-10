// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA emergency case claims under ECCIF (DHA Scenarios 7 and 8) through the DHA HIE middleware.
//
// Built against DHA's own sources, checked 2026-11-10:
// - hie-docs.dha.go.ke (pages last modified 2026-09-28; changelog newest 28 Sep 2026): Emergency
//   Case Claims Process Overview, Create Emergency Claim, Get/Add Emergency Protocols, Identify
//   Unknown Patient, Add/Remove Emergency Doctor, Submit Emergency Claim, Scenarios 7 and 8, and the
//   eClaims API reference schemas (POST /claims/emergency with its Identified, Unidentified and
//   Identify Unknown Patient variants; EmergencyProtocolRequest; AddEmergencyProtocolCombinedRequest;
//   POST/DELETE /claims/doctors; POST /claims/submit emergency variants).
// - DHA's Postman collection "HIE Integrations UAT API [Published V2] - BIBLE" (published
//   2026-10-07), Emergency Services folder.
//
// The rules DHA states:
// - one intervention per emergency claim, from the SHA-01 family;
// - consent by OTP only (POST /claims/otp first), no biometrics and no discharge OTP;
// - the attending doctor's details at creation trigger a doctor consent request;
// - billing is by approved protocol, within its applicableTariff;
// - submission within 24 hours, with discharge_reason RECOVERED | REFERRED | ABSCONDED | OTHER,
//   and reason_for_unknown_patient SHA_UNREGISTERED | DECEASED while the patient is unidentified.
//
// Where DHA's sources disagree, the schema and docs (the stricter ones) are followed:
// - Postman's "Identified Patient" request omits otp; the schema and docs require it.
// - Postman's unidentified submit omits discharge_reason and calls reason_for_unknown_patient
//   optional; the Submit guide requires both for an unidentified patient.
// - Postman sends the protocol unit_price as a number; the schema says a numeric string.
import type { HieMultipartFile, HieResult, KenyaAfyaLinkCredentials } from './afyalink';
import { requestKenyaHie } from './afyalink';
import type { KenyaHieAttachmentFile, KenyaHieClaimSummary, KenyaHiePractitioner } from './hie-claims';
import { KenyaShaOutpatientDischargeReasons, summarizeKenyaHieClaim } from './hie-claims';
import { KenyaHieRequestError } from './hie-visit';

export const KenyaEmergencyModesOfArrival = ['AMBULANCE', 'WALK-IN', 'OTHER'] as const;
export const KenyaEmergencyBroughtBy = ['RELATIVE', 'UNKNOWN', 'SAMARITAN', 'PARAMEDICS'] as const;
export const KenyaEmergencyUnknownPatientReasons = ['SHA_UNREGISTERED', 'DECEASED'] as const;
/** DHA: emergency interventions belong to the SHA-01 code family. */
export const KenyaEmergencyInterventionPrefix = 'SHA-01-';

export interface KenyaEmergencyCase {
  readonly interventionCode: string;
  readonly modeOfArrival: string;
  readonly broughtBy: string;
  /** The facility's reference number for the emergency visit, for example EMG/1/2026. */
  readonly referenceNumber: string;
  /** The attending doctor; DHA sends them a consent request by OTP. */
  readonly practitioner: KenyaHiePractitioner;
  readonly notes?: string;
}

export interface KenyaEmergencyPatientConsent {
  readonly crId: string;
  /** From POST /claims/otp. */
  readonly otp: string;
  readonly contactId?: string;
}

export interface KenyaEmergencyClaim extends KenyaHieClaimSummary {
  /** authorization_code: the consent token for every later call on the case. */
  readonly consentToken: string | null;
}

export interface KenyaEmergencyProtocol {
  readonly protocolCode: string | null;
  readonly name: string | null;
  /** The SHA-approved amount for the protocol. */
  readonly applicableTariff: number | null;
  readonly status: string | null;
  /** The intervention's accepted attachment document types. */
  readonly applicableDocumentTypes: readonly string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value === 'number') {
    return String(value);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

function oneOf(value: string | undefined, allowed: readonly string[], name: string): string {
  const v = value?.trim().toUpperCase();
  if (!v || !allowed.includes(v)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')}`);
  }
  return v;
}

function amount(value: number, name: string): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return String(Math.round(value * 100) / 100);
}

function ok(result: HieResult, action: string): unknown {
  if (!result.ok) {
    throw new KenyaHieRequestError(action, result);
  }
  return result.body;
}

/**
 * Checks an intervention is a single emergency (SHA-01) intervention.
 * @param code - The intervention code.
 * @returns The code.
 */
export function requireEmergencyIntervention(code: string | undefined): string {
  const c = required(code, 'The emergency intervention code').toUpperCase();
  if (!c.startsWith(KenyaEmergencyInterventionPrefix)) {
    throw new Error('Emergency claims are for SHA-01 emergency interventions only');
  }
  return c;
}

function caseFields(input: KenyaEmergencyCase): Record<string, unknown> {
  const body: Record<string, unknown> = {
    interventions: [requireEmergencyIntervention(input.interventionCode)],
    mode_of_arrival: oneOf(input.modeOfArrival, KenyaEmergencyModesOfArrival, 'The mode of arrival'),
    brought_by: oneOf(input.broughtBy, KenyaEmergencyBroughtBy, 'Brought by'),
    reference_number: required(input.referenceNumber, 'The reference number'),
    identification_number: required(input.practitioner.identificationNumber, 'The doctor identification number'),
    identification_type: input.practitioner.identificationType,
    regulation_body: input.practitioner.regulator,
  };
  if (input.notes?.trim()) {
    body.notes = input.notes.trim();
  }
  return body;
}

function toEmergencyClaim(body: unknown): KenyaEmergencyClaim {
  const claim = isRecord(body) ? body : {};
  return { ...summarizeKenyaHieClaim(body), consentToken: str(claim.authorization_code) };
}

/**
 * Creates an emergency case claim (POST /claims/emergency). With a patient it is the Identified
 * variant (CR ID and the patient's OTP); without, the Unidentified variant.
 * @param credentials - The HIE credentials.
 * @param input - The emergency case.
 * @param patient - The identified patient's consent, or undefined when unidentified.
 * @returns The claim and its consent token.
 */
export async function createKenyaHieEmergencyClaim(
  credentials: KenyaAfyaLinkCredentials,
  input: KenyaEmergencyCase,
  patient?: KenyaEmergencyPatientConsent
): Promise<KenyaEmergencyClaim> {
  const body = caseFields(input);
  if (patient) {
    body.beneficiary_cr_id = required(patient.crId, 'The patient Client Registry ID');
    body.otp = required(patient.otp, "The patient's OTP");
  }
  const claim = toEmergencyClaim(
    ok(await requestKenyaHie(credentials, 'POST', '/claims/emergency', { body }), 'create emergency claim')
  );
  if (!claim.consentToken) {
    throw new Error('Kenya HIE emergency claim response did not include an authorization_code (consent token)');
  }
  return claim;
}

/**
 * Identifies the patient on an unidentified emergency claim (POST /claims/emergency, Identify
 * Unknown Patient variant): the original case fields again, plus the patient's CR ID, OTP and the
 * claim's consent token. Protocols already added are kept.
 * @param credentials - The HIE credentials.
 * @param consentToken - The unidentified claim's consent token.
 * @param input - The same case fields used at creation.
 * @param patient - The now-known patient's consent.
 * @returns The claim.
 */
export async function identifyKenyaHieEmergencyPatient(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: KenyaEmergencyCase,
  patient: KenyaEmergencyPatientConsent
): Promise<KenyaEmergencyClaim> {
  const body = {
    ...caseFields(input),
    beneficiary_cr_id: required(patient.crId, 'The patient Client Registry ID'),
    otp: required(patient.otp, "The patient's OTP"),
    consent_token: required(consentToken, 'The emergency claim consent token'),
    ...(patient.contactId?.trim() ? { beneficiary_contact_id: patient.contactId.trim() } : {}),
  };
  return toEmergencyClaim(
    ok(await requestKenyaHie(credentials, 'POST', '/claims/emergency', { body }), 'identify emergency patient')
  );
}

/**
 * The approved protocols for an emergency intervention (GET /claims/emergency/protocols).
 * @param credentials - The HIE credentials.
 * @param interventionCode - The emergency intervention.
 * @returns The active protocols with their approved tariffs.
 */
export async function getKenyaHieEmergencyProtocols(
  credentials: KenyaAfyaLinkCredentials,
  interventionCode: string
): Promise<KenyaEmergencyProtocol[]> {
  const body = ok(
    await requestKenyaHie(credentials, 'GET', '/claims/emergency/protocols', {
      params: { active: 'true', intervention_code: requireEmergencyIntervention(interventionCode) },
    }),
    'emergency protocols lookup'
  );
  // DHA's ProtocolResponse: a page with results.
  const results = isRecord(body) && Array.isArray(body.results) ? body.results : [];
  return results.filter(isRecord).map((p) => {
    const interventions = Array.isArray(p.intervention) ? p.intervention.filter(isRecord) : [];
    const tariff = str(p.applicableTariff);
    return {
      protocolCode: str(p.protocolCode),
      name: str(p.name),
      applicableTariff: tariff !== null && Number.isFinite(Number(tariff)) ? Number(tariff) : null,
      status: str(p.status),
      applicableDocumentTypes: (Array.isArray(interventions[0]?.applicableDocumentTypes)
        ? (interventions[0].applicableDocumentTypes as unknown[])
        : []
      )
        .map(str)
        .filter((t): t is string => !!t),
    };
  });
}

/**
 * Adds a performed protocol to the emergency claim (POST /claims/emergency/protocols). With
 * diagnoses or attachments it is the Combined variant, sent multipart: diagnoses a JSON array of
 * ICD-11 codes, attachments a JSON array of metadata naming each binary part.
 * @param credentials - The HIE credentials.
 * @param consentToken - The emergency claim's consent token.
 * @param input - The protocol line.
 * @param input.protocolCode - From the protocols lookup.
 * @param input.interventionCode - The claim's emergency intervention.
 * @param input.unitPrice - Within the protocol's applicableTariff.
 * @param input.quantity - The quantity.
 * @param input.icdCodes - ICD-11 diagnoses.
 * @param input.attachments - Documents, of the intervention's applicableDocumentTypes.
 * @returns DHA's line.
 */
export async function addKenyaHieEmergencyProtocol(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: {
    readonly protocolCode: string;
    readonly interventionCode: string;
    readonly unitPrice: number;
    readonly quantity: number;
    readonly icdCodes?: readonly string[];
    readonly attachments?: readonly KenyaHieAttachmentFile[];
  }
): Promise<unknown> {
  const fields: Record<string, string> = {
    consent_token: required(consentToken, 'The emergency claim consent token'),
    protocol_code: required(input.protocolCode, 'The protocol code'),
    intervention_code: requireEmergencyIntervention(input.interventionCode),
    unit_price: amount(input.unitPrice, 'The unit price'),
    quantity: amount(input.quantity, 'The quantity'),
  };
  const icdCodes = (input.icdCodes ?? []).map((c) => c.trim()).filter(Boolean);
  const attachments = input.attachments ?? [];
  if (!icdCodes.length && !attachments.length) {
    return ok(
      await requestKenyaHie(credentials, 'POST', '/claims/emergency/protocols', { body: fields }),
      'add emergency protocol'
    );
  }
  const files: HieMultipartFile[] = attachments.map((a, index) => ({
    field: `attachments_${index}_file_blob`,
    filename: required(a.filename, 'The attachment file name'),
    contentType: a.contentType,
    data: a.data,
  }));
  if (icdCodes.length) {
    fields.diagnoses = JSON.stringify(icdCodes);
  }
  if (attachments.length) {
    fields.attachments = JSON.stringify(
      attachments.map((a, index) => ({
        document_title: required(a.title, 'The attachment title'),
        document_type: required(a.documentType, 'The attachment document type').toUpperCase(),
        file_field_name: files[index].field,
      }))
    );
  }
  return ok(
    await requestKenyaHie(credentials, 'POST', '/claims/emergency/protocols', { multipart: { fields, files } }),
    'add emergency protocol'
  );
}

/**
 * Adds an attending doctor to the emergency claim (POST /claims/doctors).
 * @param credentials - The HIE credentials.
 * @param consentToken - The emergency claim's consent token.
 * @param practitioner - The doctor.
 * @returns DHA's response.
 */
export async function addKenyaHieEmergencyDoctor(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  practitioner: KenyaHiePractitioner
): Promise<unknown> {
  const body = {
    consent_token: required(consentToken, 'The emergency claim consent token'),
    identification_number: required(practitioner.identificationNumber, 'The doctor identification number'),
    identification_type: practitioner.identificationType,
    regulation_body: practitioner.regulator,
  };
  return ok(await requestKenyaHie(credentials, 'POST', '/claims/doctors', { body }), 'add emergency doctor');
}

/**
 * Removes the doctor from the emergency claim (DELETE /claims/doctors), for example one who
 * rejected the consent request; add a replacement after.
 * @param credentials - The HIE credentials.
 * @param consentToken - The emergency claim's consent token.
 * @returns DHA's response (204 when removed).
 */
export async function removeKenyaHieEmergencyDoctor(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string
): Promise<unknown> {
  const body = { consent_token: required(consentToken, 'The emergency claim consent token') };
  return ok(await requestKenyaHie(credentials, 'DELETE', '/claims/doctors', { body }), 'remove emergency doctor');
}

/**
 * Submits the emergency claim (POST /claims/submit, emergency variants). DHA requires the doctor's
 * consent to be APPROVED first, and submission within 24 hours.
 * @param credentials - The HIE credentials.
 * @param consentToken - The emergency claim's consent token.
 * @param input - The invoice, discharge reason and, for an unidentified patient, the reason.
 * @param input.invoiceNumber - The facility's invoice number.
 * @param input.dischargeReason - RECOVERED, REFERRED, ABSCONDED or OTHER.
 * @param input.reasonForUnknownPatient - SHA_UNREGISTERED or DECEASED; required while unidentified.
 * @param identified - Whether the patient is identified.
 * @returns The submitted claim.
 */
export async function submitKenyaHieEmergencyClaim(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: {
    readonly invoiceNumber: string;
    readonly dischargeReason: string;
    readonly reasonForUnknownPatient?: string;
  },
  identified: boolean
): Promise<KenyaHieClaimSummary> {
  const body: Record<string, string> = {
    consent_token: required(consentToken, 'The emergency claim consent token'),
    invoice_number: required(input.invoiceNumber, 'The invoice number'),
    discharge_reason: oneOf(input.dischargeReason, KenyaShaOutpatientDischargeReasons, 'The discharge reason'),
  };
  if (!identified) {
    body.reason_for_unknown_patient = oneOf(
      input.reasonForUnknownPatient,
      KenyaEmergencyUnknownPatientReasons,
      'The reason the patient is unidentified'
    );
  }
  return summarizeKenyaHieClaim(
    ok(await requestKenyaHie(credentials, 'POST', '/claims/submit', { body }), 'submit emergency claim')
  );
}
