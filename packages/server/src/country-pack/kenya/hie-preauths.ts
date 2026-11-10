// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA preauthorizations through the DHA HIE middleware.
//
// Built against DHA's own sources, checked 2026-11-10:
// - hie-docs.dha.go.ke (pages last modified 2026-09-28; changelog newest entry 28 Sep 2026):
//   Preauths Process Overview, Normal Preauths, Elective Preauths, the Surgical, Renal, Oncology,
//   Optical and Imaging preauth guides, Understanding Preauth Statuses, Adding Attachments and the
//   eClaims API reference (POST/GET /preauths, POST /preauths/cancel,
//   DELETE /preauths/diagnoses/{icd_code}, DELETE /preauths/doctors) with its request schemas
//   (BasePreauthRequest and the five special forms).
// - DHA's Postman collection "HIE Integrations UAT API [Published V2] - BIBLE" (published
//   2026-10-07), whose Create * Preauth requests show the wire format:
//   - multipart/form-data;
//   - items, diagnoses, doctors and attachments each one form field holding a JSON array;
//   - each file a binary part named by its attachments[].file_field_name;
//   - items carry only unit_price;
//   - oncology metastases and treatment_setting are JSON arrays;
//   - is_co_insured appears on the renal and oncology requests.
//
// Where DHA's sources disagree, this code follows the stricter documented requirement and the
// difference is noted:
// - expected_service_start_date: the Elective Preauths guide says every elective preauth needs it.
//   The API schema and the Postman requests do not show it. It is sent on elective preauths only.
// - Surgical co-insurance and employment/accident fields are named in the Surgical guide only (not
//   in the API schema or Postman), so they are not sent.
// - Resending a doctor request (POST /claims/doctor-consent) names the doctor field differently in
//   the API reference (practitioner_registration_number) and Postman (identification_number), so
//   it is not built until DHA confirms.
//
// Which path: the intervention's needsPreauth says a preauth is needed;
// needsManualPreauthApproval true means elective (consent before the visit, the token of a pre-visit
// authorization in AUTHORIZED_PENDING_VISIT), else normal (the visit's consent token). The special
// form follows the intervention's category flags (requiresSurgicalPreauth, requiresRenalPreauth,
// requiresOncologyPreauth, requiresOpticalPreauth, requiresRadiologyPreauth); the caller chooses it.
import type { HieMultipartFile, KenyaAfyaLinkCredentials } from './afyalink';
import { requestKenyaHie } from './afyalink';
import type { KenyaHieAttachmentFile, KenyaHiePractitioner } from './hie-claims';
import { KenyaHieRequestError } from './hie-visit';

export const KenyaPreauthAnaesthesiaTypes = ['GENERAL', 'LOCAL', 'SPINAL_BLOCK', 'SEDATION'] as const;
export const KenyaPreauthSessionFrequencies = [
  'TWICE_A_WEEK',
  'ONCE_A_WEEK',
  'ONE_TIME_EVERY_2_WEEKS',
  'ONE_TIME_EVERY_3_WEEKS',
  'ONCE_A_MONTH',
] as const;
export const KenyaPreauthCarcinomaStages = ['STAGE_1', 'STAGE_2', 'STAGE_3', 'STAGE_4'] as const;
export const KenyaPreauthTreatmentSettings = ['DAY_WARD', 'RECLINING_CHAIR', 'SIDE_ROOM'] as const;
export const KenyaPreauthMetastases = ['LUNG', 'LIVER', 'BRAIN', 'BONE', 'OTHER'] as const;
export const KenyaPreauthLensPrescriptions = ['FRAMES_LENSES', 'CONTACT_LENSES'] as const;
export const KenyaPreauthNewOrReplacement = ['NEW', 'REPLACEMENT'] as const;

/** The special preauth forms (DHA API schemas). */
export type KenyaPreauthForm =
  | { readonly kind: 'normal' }
  | {
      readonly kind: 'surgical';
      readonly chiefComplaint: string;
      readonly vitalSigns: string;
      readonly historyOfPresentIllness: string;
      readonly physicalExamination: string;
      readonly investigationReportDetails: string;
      readonly typeOfAnaesthesia: string;
      readonly surgeryDate: string;
    }
  | {
      readonly kind: 'renal';
      readonly numberOfSessionsRequired: number;
      readonly costPerSession: number;
      readonly frequencyOfSessions: string;
      readonly clinicalIndications: string;
      readonly startDate?: string;
      readonly isCoInsured?: boolean;
    }
  | {
      readonly kind: 'oncology';
      readonly carcinomaStaging: string;
      readonly comorbidity: string;
      readonly treatmentSetting: readonly string[];
      readonly numberOfSessionsRequired: number;
      readonly costPerSession: number;
      readonly metastases?: readonly string[];
      readonly startDate?: string;
      readonly isCoInsured?: boolean;
    }
  | {
      readonly kind: 'optical';
      readonly necessityOfService: string;
      readonly lensPrescription: string;
      readonly lensAmount: number;
      readonly eyeExaminationAmount: number;
      readonly frameAmount: number;
      readonly newOrReplacement: string;
    }
  | { readonly kind: 'imaging'; readonly clinicalIndications: string };

export type KenyaPreauthFormKind = KenyaPreauthForm['kind'];

export interface KenyaPreauthDoctor extends KenyaHiePractitioner {
  readonly isPrimary: boolean;
}

export interface KenyaPreauthInput {
  readonly interventionCode: string;
  /** ISO dateTime with offset, for example 2026-03-05T15:30:00+03:00. */
  readonly serviceStart: string;
  readonly serviceEnd: string;
  /** Requested amounts; DHA's items carry only unit_price. At least one. */
  readonly unitPrices: readonly number[];
  /** ICD-11 codes. At least one. */
  readonly icdCodes: readonly string[];
  /** At least one, with a valid licence. */
  readonly doctors: readonly KenyaPreauthDoctor[];
  /** The intervention's requiredPreauthDocumentTypes decide which are needed. */
  readonly attachments: readonly KenyaHieAttachmentFile[];
  /** DHA emails the provider about updates on the request. */
  readonly providerNotificationEmail: string;
  /** Elective only (Elective Preauths guide): the planned start of the procedure. */
  readonly expectedServiceStartDate?: string;
  readonly form: KenyaPreauthForm;
}

export interface KenyaHiePreauth {
  readonly id: string | null;
  readonly guid: string | null;
  readonly status: string | null;
  readonly preauthType: string | null;
  readonly interventionCode: string | null;
  readonly isElective: boolean | null;
  readonly needsDoctorApproval: boolean | null;
  readonly doctorReviewStatus: string | null;
  readonly totalEstimatedAmount: number | null;
  readonly finalApprovedAmount: number | null;
  /** SHA's notes (preauthNotes[].note), for example the reason for a rejection. */
  readonly notes: readonly string[];
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

function dateTime(value: string | undefined, name: string): string {
  const v = required(value, name);
  if (!/T\d{2}:\d{2}/.test(v) || Number.isNaN(Date.parse(v))) {
    throw new Error(`${name} must be a date and time, for example 2026-03-05T15:30:00+03:00`);
  }
  return v;
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
  return value;
}

function oneOf(value: string, allowed: readonly string[], name: string): string {
  const v = value?.trim().toUpperCase();
  if (!v || !allowed.includes(v)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')}`);
  }
  return v;
}

function money(value: number, name: string): string {
  return positive(value, name).toFixed(2);
}

function formFields(form: KenyaPreauthForm): Record<string, string> {
  switch (form.kind) {
    case 'normal':
      return {};
    case 'surgical':
      return {
        chief_complaint: required(form.chiefComplaint, 'The chief complaint'),
        vital_signs: required(form.vitalSigns, 'The vital signs'),
        history_of_present_illness: required(form.historyOfPresentIllness, 'The history of present illness'),
        physical_examination: required(form.physicalExamination, 'The physical examination'),
        investigation_report_details: required(form.investigationReportDetails, 'The investigation report details'),
        type_of_anaesthesia: oneOf(form.typeOfAnaesthesia, KenyaPreauthAnaesthesiaTypes, 'The type of anaesthesia'),
        surgery_date: dateTime(form.surgeryDate, 'The surgery date'),
      };
    case 'renal': {
      const fields: Record<string, string> = {
        number_of_sessions_required: String(sessions(form.numberOfSessionsRequired)),
        cost_per_session: String(positive(form.costPerSession, 'The cost per session')),
        frequency_of_sessions: oneOf(form.frequencyOfSessions, KenyaPreauthSessionFrequencies, 'The session frequency'),
        clinical_indications: required(form.clinicalIndications, 'The clinical indications'),
      };
      if (form.startDate) {
        fields.start_date = dateTime(form.startDate, 'The start date');
      }
      if (form.isCoInsured !== undefined) {
        fields.is_co_insured = String(form.isCoInsured);
      }
      return fields;
    }
    case 'oncology': {
      if (!form.treatmentSetting?.length) {
        throw new Error('At least one treatment setting is required');
      }
      const fields: Record<string, string> = {
        carcinoma_staging: oneOf(form.carcinomaStaging, KenyaPreauthCarcinomaStages, 'The carcinoma staging'),
        comorbidity: required(form.comorbidity, 'The comorbidity'),
        treatment_setting: JSON.stringify(
          form.treatmentSetting.map((s) => oneOf(s, KenyaPreauthTreatmentSettings, 'The treatment setting'))
        ),
        number_of_sessions_required: String(sessions(form.numberOfSessionsRequired)),
        cost_per_session: String(positive(form.costPerSession, 'The cost per session')),
      };
      if (form.metastases?.length) {
        fields.metastases = JSON.stringify(
          form.metastases.map((m) => oneOf(m, KenyaPreauthMetastases, 'The metastases site'))
        );
      }
      if (form.startDate) {
        fields.start_date = dateTime(form.startDate, 'The start date');
      }
      if (form.isCoInsured !== undefined) {
        fields.is_co_insured = String(form.isCoInsured);
      }
      return fields;
    }
    case 'optical':
      return {
        necessity_of_service: required(form.necessityOfService, 'The necessity of the service'),
        lens_prescription: oneOf(form.lensPrescription, KenyaPreauthLensPrescriptions, 'The lens prescription'),
        lens_amount: String(positive(form.lensAmount, 'The lens amount')),
        eye_examination_amount: String(positive(form.eyeExaminationAmount, 'The eye examination amount')),
        frame_amount: String(positive(form.frameAmount, 'The frame amount')),
        new_or_replacement: oneOf(form.newOrReplacement, KenyaPreauthNewOrReplacement, 'New or replacement'),
      };
    case 'imaging':
      return { clinical_indications: required(form.clinicalIndications, 'The clinical indications') };
    default:
      throw new Error('Unknown preauth form');
  }
}

function sessions(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('The number of sessions must be a whole number of at least 1');
  }
  return value;
}

/**
 * Builds the POST /preauths multipart body, in the shape of DHA's Postman requests.
 * @param consentToken - The visit's consent token (normal) or the pre-visit authorization token (elective).
 * @param input - The preauth.
 * @param elective - Whether it is an elective preauth.
 * @returns The form fields and files.
 */
export function buildKenyaPreauthMultipart(
  consentToken: string,
  input: KenyaPreauthInput,
  elective: boolean
): { fields: Record<string, string>; files: HieMultipartFile[] } {
  const token = required(consentToken, 'The consent token');
  const interventionCode = required(input.interventionCode, 'The intervention code');
  const serviceStart = dateTime(input.serviceStart, 'The service start');
  const serviceEnd = dateTime(input.serviceEnd, 'The service end');
  if (Date.parse(serviceEnd) < Date.parse(serviceStart)) {
    throw new Error('The service end cannot be before the service start');
  }
  if (!input.unitPrices.length) {
    throw new Error('At least one item is required');
  }
  const icdCodes = input.icdCodes.map((c) => c.trim()).filter(Boolean);
  if (!icdCodes.length) {
    throw new Error('At least one ICD-11 diagnosis is required');
  }
  if (!input.doctors.length) {
    throw new Error('At least one doctor is required');
  }
  const email = required(input.providerNotificationEmail, 'The provider notification email');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('The provider notification email is not a valid email address');
  }

  const files: HieMultipartFile[] = input.attachments.map((a, index) => ({
    field: `attachments_${index}_file_blob`,
    filename: required(a.filename, 'The attachment file name'),
    contentType: a.contentType,
    data: a.data,
  }));
  const fields: Record<string, string> = {
    consent_token: token,
    intervention_code: interventionCode,
    service_start: serviceStart,
    service_end: serviceEnd,
    items: JSON.stringify(input.unitPrices.map((p) => ({ unit_price: money(p, 'The item price') }))),
    diagnoses: JSON.stringify(icdCodes.map((icd) => ({ consent_token: token, icd_code: icd }))),
    doctors: JSON.stringify(
      input.doctors.map((d) => ({
        identification_number: required(d.identificationNumber, 'The doctor identification number'),
        identification_type: d.identificationType,
        regulation_body: d.regulator,
        intervention_code: interventionCode,
        is_primary: d.isPrimary,
      }))
    ),
    attachments: JSON.stringify(
      input.attachments.map((a, index) => ({
        document_title: required(a.title, 'The attachment title'),
        document_type: required(a.documentType, 'The attachment document type').toUpperCase(),
        file_field_name: files[index].field,
      }))
    ),
    provider_notification_email: email,
    ...formFields(input.form),
  };
  if (elective) {
    fields.expected_service_start_date = dateTime(input.expectedServiceStartDate, 'The expected service start date');
  }
  return { fields, files };
}

/**
 * Normalizes DHA's preauth (POST and GET /preauths return the same shape).
 * @param body - The DHA preauth.
 * @returns The summary.
 */
export function summarizeKenyaHiePreauth(body: unknown): KenyaHiePreauth {
  const p = isRecord(body) ? body : {};
  return {
    id: str(p.id),
    guid: str(p.guid),
    status: str(p.status),
    preauthType: str(p.preauthType),
    interventionCode: str(p.interventionCode),
    isElective: typeof p.isElective === 'boolean' ? p.isElective : null,
    needsDoctorApproval: typeof p.needsDoctorApproval === 'boolean' ? p.needsDoctorApproval : null,
    doctorReviewStatus: str(p.doctorReviewStatus),
    totalEstimatedAmount: num(p.totalEstimatedAmountForPreauth),
    finalApprovedAmount: num(p.finalApprovedAmount),
    // preauthFlags items have no documented fields, so they are not read.
    notes: (Array.isArray(p.preauthNotes) ? p.preauthNotes : [])
      .map((n) => (isRecord(n) ? str(n.note) : null))
      .filter((n): n is string => !!n),
  };
}

/**
 * Creates a preauthorization (POST /preauths, multipart).
 * @param credentials - The HIE credentials.
 * @param consentToken - The visit's consent token (normal) or the pre-visit authorization token (elective).
 * @param input - The preauth.
 * @param elective - Whether it is an elective preauth.
 * @returns The DHA preauth.
 */
export async function createKenyaHiePreauth(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: KenyaPreauthInput,
  elective: boolean
): Promise<KenyaHiePreauth> {
  const multipart = buildKenyaPreauthMultipart(consentToken, input, elective);
  const result = await requestKenyaHie(credentials, 'POST', '/preauths', { multipart });
  if (!result.ok) {
    throw new KenyaHieRequestError('create preauth', result);
  }
  return summarizeKenyaHiePreauth(result.body);
}

/**
 * Reads the preauthorization linked to a consent token (GET /preauths).
 * @param credentials - The HIE credentials.
 * @param consentToken - The consent token the preauth was created with.
 * @returns The DHA preauth.
 */
export async function getKenyaHiePreauth(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string
): Promise<KenyaHiePreauth> {
  const result = await requestKenyaHie(credentials, 'GET', '/preauths', {
    params: { consent_token: required(consentToken, 'The consent token') },
  });
  if (!result.ok) {
    throw new KenyaHieRequestError('preauth lookup', result);
  }
  return summarizeKenyaHiePreauth(Array.isArray(result.body) ? result.body[0] : result.body);
}

/**
 * Cancels a preauthorization (POST /preauths/cancel). DHA allows it only while DRAFT, FINALISED,
 * PENDING_DOCTOR_APPROVAL or pending clarification.
 * @param credentials - The HIE credentials.
 * @param consentToken - The consent token the preauth was created with.
 * @param interventionCode - The preauth's intervention.
 * @returns DHA's response.
 */
export async function cancelKenyaHiePreauth(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  interventionCode: string
): Promise<unknown> {
  const body = {
    consent_token: required(consentToken, 'The consent token'),
    intervention_code: required(interventionCode, 'The intervention code'),
  };
  const result = await requestKenyaHie(credentials, 'POST', '/preauths/cancel', { body });
  if (!result.ok) {
    throw new KenyaHieRequestError('cancel preauth', result);
  }
  return result.body;
}

/**
 * Removes a diagnosis from a preauthorization (DELETE /preauths/diagnoses/{icd_code}; the code is
 * in the path and the body).
 * @param credentials - The HIE credentials.
 * @param consentToken - The consent token the preauth was created with.
 * @param input - The intervention and ICD-11 code.
 * @param input.interventionCode - The preauth's intervention.
 * @param input.icdCode - The ICD-11 code to remove.
 * @returns DHA's response.
 */
export async function removeKenyaHiePreauthDiagnosis(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: { readonly interventionCode: string; readonly icdCode: string }
): Promise<unknown> {
  const icdCode = required(input.icdCode, 'The ICD-11 code');
  const body = {
    consent_token: required(consentToken, 'The consent token'),
    icd_code: icdCode,
    intervention_code: required(input.interventionCode, 'The intervention code'),
  };
  const result = await requestKenyaHie(credentials, 'DELETE', `/preauths/diagnoses/${encodeURIComponent(icdCode)}`, {
    body,
  });
  if (!result.ok) {
    throw new KenyaHieRequestError('remove preauth diagnosis', result);
  }
  return result.body;
}

/**
 * Removes a doctor from a preauthorization (DELETE /preauths/doctors).
 * @param credentials - The HIE credentials.
 * @param consentToken - The consent token the preauth was created with.
 * @param input - The intervention and the doctor's registration number.
 * @param input.interventionCode - The preauth's intervention.
 * @param input.registrationNumber - The doctor's regulator registration number.
 * @returns DHA's response.
 */
export async function removeKenyaHiePreauthDoctor(
  credentials: KenyaAfyaLinkCredentials,
  consentToken: string,
  input: { readonly interventionCode: string; readonly registrationNumber: string }
): Promise<unknown> {
  const body = {
    consent_token: required(consentToken, 'The consent token'),
    intervention_code: required(input.interventionCode, 'The intervention code'),
    practitioner_registration_number: required(input.registrationNumber, 'The doctor registration number'),
  };
  const result = await requestKenyaHie(credentials, 'DELETE', '/preauths/doctors', { body });
  if (!result.ok) {
    throw new KenyaHieRequestError('remove preauth doctor', result);
  }
  return result.body;
}
