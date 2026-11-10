// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA claim billing and dispatch through the DHA HIE middleware, on a visit already started
// (see hie-visit.ts). Every call is authorised by the visit's consent token.
//
// Follows https://hie-docs.dha.go.ke (checked 2026-11-10, pages last modified 2026-09-28):
// - Billing Workflows overview: add/remove line, diagnosis and attachment, preview; any order,
//   while the visit and consent stay valid.
//   - POST /claims/lines (JSON, or multipart with an attachments metadata array: "Pattern A");
//     unit_price and quantity are numeric strings. Per diem lines are added by DHA itself.
//   - PATCH /claims/lines removes a line by line_guid (the id from the claim's invoices.lines).
//   - POST /claims/diagnoses adds an ICD-11 code to an intervention; PATCH removes it.
//   - POST /claims/attachments: multipart, the file part named exactly file_blob ("Pattern B");
//     PATCH removes one by attachment_id. Files are binary parts, never base64, and the filename
//     extension must be right because DHA infers the type from it.
//   - POST /claims/preview (provider view); GET /claims/preview/payer once SUBMITTED.
// - Claim Dispatch: the patient consents to the visit end by a discharge OTP
//   (POST /claims/otp/discharge) or a biometrics authorization (discharge_auth_guid), then
//   - outpatient: POST /claims/submit (discharge_reason RECOVERED | REFERRED | ABSCONDED | OTHER;
//     discharge_status FULL by default, or PARTIAL then a second call with FULL);
//   - inpatient: POST /claims/discharge (discharge_reason adds DECEASED);
//   - discard: POST /claims/close with a cancel reason.
import type { HieMultipartFile, HieResult, KenyaAfyaLinkCredentials } from './afyalink';
import { requestKenyaHie } from './afyalink';
import { KenyaHieRequestError } from './hie-visit';

export interface KenyaHiePractitioner {
  readonly identificationType: 'registration_number' | 'National ID' | 'Alien ID' | 'Refugee ID';
  readonly identificationNumber: string;
  readonly regulator: 'KMPDC' | 'COC' | 'NCK' | 'PPB';
}

export interface KenyaHieAttachmentFile {
  /** One of the intervention's applicableDocumentTypes, for example LAB_RESULTS. */
  readonly documentType: string;
  readonly title: string;
  readonly filename: string;
  readonly contentType: string;
  readonly data: Buffer;
}

export interface KenyaHieClaimLineInput {
  readonly interventionCode: string;
  readonly unitPrice: number;
  readonly quantity: number;
  readonly serviceName?: string;
  /** The facility's own code for the service. */
  readonly serviceIdentifier?: string;
  readonly practitioner?: KenyaHiePractitioner;
  /** Supporting documents for the line (sent multipart). */
  readonly attachments?: readonly KenyaHieAttachmentFile[];
}

export const KenyaShaOutpatientDischargeReasons = ['RECOVERED', 'REFERRED', 'ABSCONDED', 'OTHER'] as const;
export const KenyaShaInpatientDischargeReasons = ['RECOVERED', 'REFERRED', 'DECEASED', 'ABSCONDED', 'OTHER'] as const;
export type KenyaShaDischargeReason = (typeof KenyaShaInpatientDischargeReasons)[number];

/** Visit-end consent: the discharge OTP the patient reads out, or a biometrics authorization GUID. */
export interface KenyaHieVisitEndConsent {
  readonly otp?: string;
  readonly dischargeAuthorizationGuid?: string;
  /** The contact the discharge OTP went to (optional, OTP path only). */
  readonly contactId?: string;
}

export interface KenyaHieClaimSummary {
  readonly claimId: string | null;
  readonly workflowState: string | null;
  readonly claimAuthStatus: string | null;
  readonly invoiceNumber: string | null;
  readonly totalAmount: number | null;
  readonly netAmount: number | null;
  /** DHA's unresolved invoice flags: problems to fix before or after submission. */
  readonly flags: readonly string[];
  readonly lines: readonly {
    readonly id: string | null;
    readonly interventionCode: string | null;
    readonly itemName: string | null;
    readonly quantity: number | null;
    readonly unitPrice: number | null;
    readonly netAmount: number | null;
  }[];
  readonly diagnoses: readonly { readonly interventionCode: string | null; readonly code: string | null }[];
  readonly attachments: readonly {
    readonly id: string | null;
    readonly interventionCode: string | null;
    readonly type: string | null;
  }[];
}

const DocumentTypePattern = /^[A-Z][A-Z0-9_]*$/;
const CancelReasonPattern = /^[A-Z][A-Z_]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value === 'number') {
    return String(value);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function required(value: string | undefined, name: string): string {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`${name} is required`);
  }
  return trimmed;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function ok(result: HieResult, action: string): unknown {
  if (!result.ok) {
    throw new KenyaHieRequestError(action, result);
  }
  return result.body;
}

/**
 * A positive amount to two decimal places, as the numeric string DHA expects for unit_price and quantity.
 * @param value - The amount.
 * @param name - The field name, for the error.
 * @returns The amount as a string.
 */
function amount(value: number, name: string): string {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return String(Math.round(value * 100) / 100);
}

function documentType(value: string): string {
  const type = value?.trim().toUpperCase();
  if (!type || !DocumentTypePattern.test(type)) {
    throw new Error('The attachment document type must be one of DHA document types, for example LAB_RESULTS');
  }
  return type;
}

function practitionerFields(practitioner: KenyaHiePractitioner | undefined): Record<string, string> {
  if (!practitioner) {
    return {};
  }
  return {
    practitioner_identification_type: practitioner.identificationType,
    practitioner_identification_number: required(
      practitioner.identificationNumber,
      'The practitioner identification number'
    ),
    practitioner_regulation_body: practitioner.regulator,
  };
}

/**
 * Normalizes a DHA claim (the virtual claim returned by preview, submit, discharge or close).
 * @param body - The DHA claim.
 * @returns The summary.
 */
export function summarizeKenyaHieClaim(body: unknown): KenyaHieClaimSummary {
  const claim = isRecord(body) ? body : {};
  const invoices = records(claim.invoices);
  const lines = invoices.flatMap((invoice) => records(invoice.lines));
  return {
    claimId: str(claim.id),
    workflowState: str(claim.workflow_state),
    claimAuthStatus: str(claim.claim_auth_status),
    invoiceNumber: str(invoices[0]?.invoice_number),
    totalAmount: num(claim.total_claim_amount),
    netAmount: num(claim.total_claim_net_amount),
    flags: invoices
      .flatMap((invoice) => records(invoice.invoice_flags))
      .filter((flag) => flag.is_resolved !== true)
      .map((flag) => str(flag.message) ?? str(flag.description) ?? str(flag.code))
      .filter((message): message is string => !!message),
    lines: lines.map((line) => ({
      id: str(line.id),
      interventionCode: str(line.intervention_code),
      itemName: str(line.item_name),
      quantity: num(line.quantity),
      unitPrice: num(line.unit_price),
      netAmount: num(line.line_net_amount),
    })),
    diagnoses: records(claim.claim_diagnoses).map((d) => ({
      interventionCode: str(d.intervention_code),
      code: str(d.diagnosis_code),
    })),
    attachments: records(claim.claim_attachments).map((a) => ({
      id: str(a.id),
      interventionCode: str(a.intervention_code),
      type: str(a.attachment_type),
    })),
  };
}

/**
 * Adds a billable line (POST /claims/lines). With attachments it is sent multipart, each file a
 * named binary part listed in the attachments metadata (DHA "Pattern A").
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The line.
 * @returns DHA's line.
 */
export async function addKenyaHieClaimLine(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: KenyaHieClaimLineInput
): Promise<unknown> {
  const fields: Record<string, string> = {
    consent_token: required(consentToken, 'The visit consent token'),
    intervention_code: required(input.interventionCode, 'The intervention code'),
    unit_price: amount(input.unitPrice, 'The unit price'),
    quantity: amount(input.quantity, 'The quantity'),
    ...practitionerFields(input.practitioner),
  };
  if (input.serviceName?.trim()) {
    fields.service_name = input.serviceName.trim();
  }
  if (input.serviceIdentifier?.trim()) {
    fields.service_identifier = input.serviceIdentifier.trim();
  }
  const attachments = input.attachments ?? [];
  if (attachments.length === 0) {
    return ok(await requestKenyaHie(credentials, 'POST', '/claims/lines', { body: fields }), 'add claim line');
  }
  const files: HieMultipartFile[] = attachments.map((a, index) => ({
    field: `file_${index + 1}`,
    filename: required(a.filename, 'The attachment file name'),
    contentType: a.contentType,
    data: a.data,
  }));
  fields.attachments = JSON.stringify(
    attachments.map((a, index) => ({
      document_title: required(a.title, 'The attachment title'),
      document_type: documentType(a.documentType),
      file_field_name: files[index].field,
    }))
  );
  return ok(
    await requestKenyaHie(credentials, 'POST', '/claims/lines', { multipart: { fields, files } }),
    'add claim line'
  );
}

/**
 * Removes a line (PATCH /claims/lines). Per diem lines cannot be removed.
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param lineGuid - The line id from the claim's invoices.lines.
 * @returns DHA's confirmation.
 */
export async function removeKenyaHieClaimLine(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  lineGuid: string
): Promise<unknown> {
  const body = {
    consent_token: required(consentToken, 'The visit consent token'),
    line_guid: required(lineGuid, 'The line id'),
  };
  return ok(await requestKenyaHie(credentials, 'PATCH', '/claims/lines', { body }), 'remove claim line');
}

/**
 * Adds an ICD-11 diagnosis to an intervention on the claim (POST /claims/diagnoses).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The intervention and ICD-11 code, and optionally the attending doctor.
 * @param input.interventionCode - The intervention the diagnosis justifies.
 * @param input.icdCode - The ICD-11 code, for example CA07.0.
 * @param input.practitioner - The attending doctor, if not added before.
 * @returns DHA's diagnosis.
 */
export async function addKenyaHieClaimDiagnosis(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: { readonly interventionCode: string; readonly icdCode: string; readonly practitioner?: KenyaHiePractitioner }
): Promise<unknown> {
  const body = {
    consent_token: required(consentToken, 'The visit consent token'),
    icd_code: required(input.icdCode, 'The ICD-11 code'),
    intervention_code: required(input.interventionCode, 'The intervention code'),
    ...practitionerFields(input.practitioner),
  };
  return ok(await requestKenyaHie(credentials, 'POST', '/claims/diagnoses', { body }), 'add claim diagnosis');
}

/**
 * Removes a diagnosis from an intervention on the claim (PATCH /claims/diagnoses).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The intervention and ICD-11 code.
 * @param input.interventionCode - The intervention.
 * @param input.icdCode - The ICD-11 code to remove.
 * @returns DHA's confirmation.
 */
export async function removeKenyaHieClaimDiagnosis(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: { readonly interventionCode: string; readonly icdCode: string }
): Promise<unknown> {
  const body = {
    consent_token: required(consentToken, 'The visit consent token'),
    icd_code: required(input.icdCode, 'The ICD-11 code'),
    intervention_code: required(input.interventionCode, 'The intervention code'),
  };
  return ok(await requestKenyaHie(credentials, 'PATCH', '/claims/diagnoses', { body }), 'remove claim diagnosis');
}

/**
 * Attaches a document to an intervention on the claim (POST /claims/attachments, multipart, the
 * file part named file_blob).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param interventionCode - The intervention the document supports.
 * @param file - The document.
 * @returns DHA's attachment.
 */
export async function addKenyaHieClaimAttachment(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  interventionCode: string,
  file: KenyaHieAttachmentFile
): Promise<unknown> {
  const fields = {
    consent_token: required(consentToken, 'The visit consent token'),
    document_type: documentType(file.documentType),
    intervention_code: required(interventionCode, 'The intervention code'),
  };
  const files = [
    {
      field: 'file_blob',
      filename: required(file.filename, 'The attachment file name'),
      contentType: file.contentType,
      data: file.data,
    },
  ];
  return ok(
    await requestKenyaHie(credentials, 'POST', '/claims/attachments', { multipart: { fields, files } }),
    'add claim attachment'
  );
}

/**
 * Removes an attachment (PATCH /claims/attachments).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The attachment and its intervention.
 * @param input.attachmentId - The attachment id DHA returned.
 * @param input.interventionCode - The intervention it is linked to.
 * @returns DHA's confirmation.
 */
export async function removeKenyaHieClaimAttachment(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: { readonly attachmentId: string; readonly interventionCode: string }
): Promise<unknown> {
  const body = {
    attachment_id: required(input.attachmentId, 'The attachment id'),
    consent_token: required(consentToken, 'The visit consent token'),
    intervention_code: required(input.interventionCode, 'The intervention code'),
  };
  return ok(await requestKenyaHie(credentials, 'PATCH', '/claims/attachments', { body }), 'remove claim attachment');
}

/**
 * The claim as the provider sees it (POST /claims/preview).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @returns The DHA claim.
 */
export async function previewKenyaHieClaim(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string
): Promise<unknown> {
  const body = { consent_token: required(consentToken, 'The visit consent token') };
  return ok(await requestKenyaHie(credentials, 'POST', '/claims/preview', { body }), 'claim preview');
}

/**
 * The claim as the payer sees it (GET /claims/preview/payer), once it is SUBMITTED.
 * @param credentials - The HIE credentials.
 * @param invoiceNumber - The invoice number sent on submission (provider_claim_no).
 * @returns The payer's claim.
 */
export async function getKenyaHiePayerClaim(
  credentials: KenyaAfyaLinkCredentials,
  invoiceNumber: string
): Promise<unknown> {
  const params = { provider_claim_no: required(invoiceNumber, 'The invoice number') };
  return ok(await requestKenyaHie(credentials, 'GET', '/claims/preview/payer', { params }), 'payer claim preview');
}

/**
 * Sends the visit-end OTP to the patient (POST /claims/otp/discharge).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param patientId - The patient's Client Registry ID.
 * @returns DHA's confirmation.
 */
export async function sendKenyaHieDischargeOtp(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  patientId: string
): Promise<unknown> {
  const body = {
    consent_token: required(consentToken, 'The visit consent token'),
    patient_id: required(patientId, 'The patient Client Registry ID'),
  };
  return ok(await requestKenyaHie(credentials, 'POST', '/claims/otp/discharge', { body }), 'send discharge OTP');
}

function visitEndConsent(consent: KenyaHieVisitEndConsent, allowContact: boolean): Record<string, string> {
  const otp = consent.otp?.trim();
  const guid = consent.dischargeAuthorizationGuid?.trim();
  if (!otp === !guid) {
    throw new Error(
      'Provide either the discharge OTP the patient received or the GUID of an authorized fingerprint consent'
    );
  }
  if (guid) {
    return { discharge_auth_guid: guid };
  }
  const fields: Record<string, string> = { otp: otp as string };
  if (allowContact && consent.contactId?.trim()) {
    fields.beneficiary_contact_id = consent.contactId.trim();
  }
  return fields;
}

function dischargeReason(reason: string, allowed: readonly string[]): string {
  const normalized = reason?.trim().toUpperCase();
  if (!normalized || !allowed.includes(normalized)) {
    throw new Error(`The discharge reason must be one of ${allowed.join(', ')}`);
  }
  return normalized;
}

/**
 * Ends an outpatient visit and submits the claim (POST /claims/submit, standard claim). PARTIAL
 * lets the patient leave while the documents are finished; then call again with only FULL
 * (see finalizeKenyaHiePartialClaim).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The invoice, reason, visit-end consent and optional notes and status.
 * @param input.invoiceNumber - The facility's invoice number.
 * @param input.dischargeReason - RECOVERED, REFERRED, ABSCONDED or OTHER.
 * @param input.consent - The visit-end consent.
 * @param input.dischargeStatus - FULL (default) or PARTIAL.
 * @param input.notes - Free-text notes.
 * @returns The DHA claim.
 */
export async function submitKenyaHieClaim(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: {
    readonly invoiceNumber: string;
    readonly dischargeReason: string;
    readonly consent: KenyaHieVisitEndConsent;
    readonly dischargeStatus?: 'FULL' | 'PARTIAL';
    readonly notes?: string;
  }
): Promise<unknown> {
  const body: Record<string, string> = {
    consent_token: required(consentToken, 'The visit consent token'),
    invoice_number: required(input.invoiceNumber, 'The invoice number'),
    discharge_reason: dischargeReason(input.dischargeReason, KenyaShaOutpatientDischargeReasons),
    ...visitEndConsent(input.consent, true),
  };
  if (input.dischargeStatus) {
    body.discharge_status = input.dischargeStatus;
  }
  if (input.notes?.trim()) {
    body.notes = input.notes.trim();
  }
  return ok(await requestKenyaHie(credentials, 'POST', '/claims/submit', { body }), 'submit claim');
}

/**
 * Submits a claim that was discharged PARTIAL (POST /claims/submit with discharge_status FULL).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @returns The DHA claim.
 */
export async function finalizeKenyaHiePartialClaim(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string
): Promise<unknown> {
  const body = { consent_token: required(consentToken, 'The visit consent token'), discharge_status: 'FULL' };
  return ok(await requestKenyaHie(credentials, 'POST', '/claims/submit', { body }), 'finalise partial claim');
}

/**
 * Discharges an inpatient, which submits the claim (POST /claims/discharge).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The invoice, reason, date and visit-end consent.
 * @param input.invoiceNumber - The facility's invoice number for the episode.
 * @param input.dischargeReason - RECOVERED, REFERRED, DECEASED, ABSCONDED or OTHER.
 * @param input.dischargeDate - When the patient was discharged (ISO dateTime with offset).
 * @param input.consent - The visit-end consent.
 * @returns The DHA claim.
 */
export async function dischargeKenyaHiePatient(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: {
    readonly invoiceNumber: string;
    readonly dischargeReason: string;
    readonly dischargeDate: string;
    readonly consent: KenyaHieVisitEndConsent;
  }
): Promise<unknown> {
  const date = required(input.dischargeDate, 'The discharge date');
  if (Number.isNaN(Date.parse(date))) {
    throw new Error('The discharge date must be a date and time, for example 2026-06-08T20:30:00+03:00');
  }
  const body = {
    consent_token: required(consentToken, 'The visit consent token'),
    invoice_number: required(input.invoiceNumber, 'The invoice number'),
    discharge_reason: dischargeReason(input.dischargeReason, KenyaShaInpatientDischargeReasons),
    discharge_date: date,
    ...visitEndConsent(input.consent, false),
  };
  return ok(await requestKenyaHie(credentials, 'POST', '/claims/discharge', { body }), 'discharge patient');
}

/**
 * Discards the claim (POST /claims/close), for example a visit where no service was given.
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The cancel reason type and text.
 * @param input.reasonType - DHA's cancel reason, for example NO_SERVICE_GIVEN or WRONG_PATIENT.
 * @param input.reasonText - Why the claim is closed.
 * @returns The DHA claim.
 */
export async function closeKenyaHieClaim(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: { readonly reasonType: string; readonly reasonText: string }
): Promise<unknown> {
  const reasonType = input.reasonType?.trim().toUpperCase();
  if (!reasonType || !CancelReasonPattern.test(reasonType)) {
    throw new Error('The cancel reason type must be one of DHA cancel reasons, for example NO_SERVICE_GIVEN');
  }
  const body = {
    cancel_reason_text: required(input.reasonText, 'The cancel reason'),
    cancel_reason_type: reasonType,
    consent_token: required(consentToken, 'The visit consent token'),
  };
  return ok(await requestKenyaHie(credentials, 'POST', '/claims/close', { body }), 'close claim');
}

// Resubmission (docs/claims/guides/claim-resubmission, Resubmit Claim and Edit Claim Line guides,
// last modified 2026-09-28). A claim the payer returned (rejected, sent back, clarification,
// missing documents) is reopened with resubmit; while it is DRAFT_RESUBMIT* the facility may add
// attachments, add diagnoses and edit a line's price or quantity downwards only; then it is sent
// again through the normal submit (outpatient) or discharge (inpatient) route, without the
// first-time fields (invoice number, discharge reason, consent). A claim in FAILED_TO_SUBMIT never
// reached the payer: it is not resubmitted, the submit or discharge route is simply called again,
// also without those fields.
//
// DHA's sources disagree on two points:
// - The resubmit path: the eClaims API reference (and the guide's "Resubmit Claim" API link) says
//   POST /claims/lines/resubmit; the Postman collection says POST /claims/resubmit. Verified on
//   DHA UAT 2026-11-10 with an invalid token: /claims/lines/resubmit is handled ("failed to
//   resubmit claim line: ... no valid active virtual claim found"), /claims/resubmit is a 404.
// - Edit Claim Line: the guide and the API reference agree on consent_token, line_id, unit_price and
//   an integer quantity; the Postman request (claim_line_id, scheme_code, no consent token) is a
//   stub and is not followed.

/** The resubmit route: the eClaims API reference, confirmed live on DHA UAT (Postman's is a 404). */
export const KenyaHieResubmitPath = '/claims/lines/resubmit';

/**
 * Reopens a returned claim for corrections (POST /claims/lines/resubmit).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @returns DHA's response.
 */
export async function resubmitKenyaHieClaim(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string
): Promise<unknown> {
  const body = { consent_token: required(consentToken, 'The visit consent token') };
  return ok(await requestKenyaHie(credentials, 'POST', KenyaHieResubmitPath, { body }), 'resubmit claim');
}

/**
 * Edits a line's unit price and quantity on a claim reopened for resubmission
 * (PATCH /claims/lines/edit). DHA allows only a lower amount.
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param input - The line and its new price and quantity.
 * @param input.lineId - The line id from the claim's invoices.lines.
 * @param input.unitPrice - The new unit price.
 * @param input.quantity - The new quantity (a whole number).
 * @returns DHA's line.
 */
export async function editKenyaHieClaimLine(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: { readonly lineId: string; readonly unitPrice: number; readonly quantity: number }
): Promise<unknown> {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('The quantity must be a whole number of at least 1');
  }
  const body = {
    consent_token: required(consentToken, 'The visit consent token'),
    line_id: required(input.lineId, 'The line id'),
    unit_price: amount(input.unitPrice, 'The unit price'),
    quantity: input.quantity,
  };
  return ok(await requestKenyaHie(credentials, 'PATCH', '/claims/lines/edit', { body }), 'edit claim line');
}

/**
 * Sends a claim again after resubmission corrections, or after FAILED_TO_SUBMIT, through the normal
 * route with only the consent token (the first-time fields were captured on the original submission).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token.
 * @param route - submit (outpatient) or discharge (inpatient).
 * @returns The DHA claim.
 */
export async function resendKenyaHieClaim(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  route: 'submit' | 'discharge'
): Promise<unknown> {
  const body = { consent_token: required(consentToken, 'The visit consent token') };
  return ok(await requestKenyaHie(credentials, 'POST', `/claims/${route}`, { body }), `re-send claim (${route})`);
}
