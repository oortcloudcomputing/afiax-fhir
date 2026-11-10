// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { clearKenyaHieTokenCache } from './afyalink';
import type { KenyaPreauthInput } from './hie-preauths';
import {
  buildKenyaPreauthMultipart,
  cancelKenyaHiePreauth,
  createKenyaHiePreauth,
  getKenyaHiePreauth,
  removeKenyaHiePreauthDiagnosis,
  removeKenyaHiePreauthDoctor,
} from './hie-preauths';
import { createKenyaHieOtpAuthorization } from './hie-visit';

jest.mock('node-fetch');

const Base = 'https://hie.example/api/v1';
const credentials: KenyaAfyaLinkCredentials = { baseUrl: Base, clientId: 'id', clientSecret: 'secret' };
const mockFetch = fetch as unknown as jest.Mock;
const Token = 'J6LAFNBPZN';

function jsonResponse(status: number, body: unknown): Record<string, unknown> {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function mockHie(status: number, body: unknown): void {
  mockFetch
    .mockResolvedValueOnce(jsonResponse(200, { access_token: 'jwt', expires_in: 3600 }))
    .mockResolvedValueOnce(jsonResponse(status, body));
}

function lastRequest(): { url: string; method: string; headers: Record<string, string>; raw: unknown } {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url, method: init.method, headers: init.headers, raw: init.body };
}

const base: KenyaPreauthInput = {
  interventionCode: 'SHA-11-001',
  serviceStart: '2026-03-05T15:30:00+03:00',
  serviceEnd: '2026-03-05T16:00:00+03:00',
  unitPrices: [500],
  icdCodes: ['ca07.0'],
  doctors: [
    { identificationNumber: 'A00000', identificationType: 'registration_number', regulator: 'KMPDC', isPrimary: true },
  ],
  attachments: [
    {
      documentType: 'LAB_TESTS',
      title: 'Lab Results',
      filename: 'LAB_TESTS.jpg',
      contentType: 'image/jpeg',
      data: Buffer.from('jpeg-bytes'),
    },
  ],
  providerNotificationEmail: 'claims@example.com',
  form: { kind: 'normal' },
};

describe('DHA preauth request shape (as in DHA Postman "Create Normal Preauth")', () => {
  test('lists are JSON array strings and files are named attachments_N_file_blob', () => {
    const { fields, files } = buildKenyaPreauthMultipart(Token, base, false);
    expect(fields).toEqual({
      consent_token: Token,
      intervention_code: 'SHA-11-001',
      service_start: '2026-03-05T15:30:00+03:00',
      service_end: '2026-03-05T16:00:00+03:00',
      items: '[{"unit_price":"500.00"}]',
      diagnoses: `[{"consent_token":"${Token}","icd_code":"ca07.0"}]`,
      doctors:
        '[{"identification_number":"A00000","identification_type":"registration_number","regulation_body":"KMPDC","intervention_code":"SHA-11-001","is_primary":true}]',
      attachments:
        '[{"document_title":"Lab Results","document_type":"LAB_TESTS","file_field_name":"attachments_0_file_blob"}]',
      provider_notification_email: 'claims@example.com',
    });
    expect(files).toEqual([
      expect.objectContaining({
        field: 'attachments_0_file_blob',
        filename: 'LAB_TESTS.jpg',
        contentType: 'image/jpeg',
      }),
    ]);
  });

  test('elective preauths add expected_service_start_date (Elective Preauths guide)', () => {
    expect(() => buildKenyaPreauthMultipart(Token, base, true)).toThrow('expected service start date is required');
    const { fields } = buildKenyaPreauthMultipart(
      Token,
      { ...base, expectedServiceStartDate: '2026-12-01T08:00:00+03:00' },
      true
    );
    expect(fields.expected_service_start_date).toBe('2026-12-01T08:00:00+03:00');
    expect(buildKenyaPreauthMultipart(Token, base, false).fields.expected_service_start_date).toBeUndefined();
  });

  test('surgical form fields (DHA SurgicalPreauthRequest)', () => {
    const { fields } = buildKenyaPreauthMultipart(
      Token,
      {
        ...base,
        form: {
          kind: 'surgical',
          chiefComplaint: 'Abdominal pain',
          vitalSigns: '110 BP',
          historyOfPresentIllness: 'None',
          physicalExamination: 'Looks pale and weak',
          investigationReportDetails: 'None',
          typeOfAnaesthesia: 'general',
          surgeryDate: '2026-03-08T15:30:00+03:00',
        },
      },
      false
    );
    expect(fields).toMatchObject({
      chief_complaint: 'Abdominal pain',
      vital_signs: '110 BP',
      type_of_anaesthesia: 'GENERAL',
      surgery_date: '2026-03-08T15:30:00+03:00',
    });
  });

  test('renal and oncology form fields, as in DHA Postman', () => {
    const renal = buildKenyaPreauthMultipart(
      Token,
      {
        ...base,
        form: {
          kind: 'renal',
          numberOfSessionsRequired: 7,
          costPerSession: 5000,
          frequencyOfSessions: 'ONCE_A_MONTH',
          clinicalIndications: 'Pain in lower abdomen',
          startDate: '2026-11-21T15:30:00+03:00',
          isCoInsured: true,
        },
      },
      false
    ).fields;
    expect(renal).toMatchObject({
      number_of_sessions_required: '7',
      cost_per_session: '5000',
      frequency_of_sessions: 'ONCE_A_MONTH',
      start_date: '2026-11-21T15:30:00+03:00',
      is_co_insured: 'true',
    });
    const oncology = buildKenyaPreauthMultipart(
      Token,
      {
        ...base,
        form: {
          kind: 'oncology',
          carcinomaStaging: 'STAGE_1',
          comorbidity: 'The comorbidity',
          treatmentSetting: ['DAY_WARD'],
          metastases: ['LUNG'],
          numberOfSessionsRequired: 20,
          costPerSession: 2500,
        },
      },
      false
    ).fields;
    expect(oncology).toMatchObject({
      carcinoma_staging: 'STAGE_1',
      treatment_setting: '["DAY_WARD"]',
      metastases: '["LUNG"]',
      number_of_sessions_required: '20',
      cost_per_session: '2500',
    });
    expect(oncology.is_co_insured).toBeUndefined();
  });

  test('optical and imaging form fields', () => {
    expect(
      buildKenyaPreauthMultipart(
        Token,
        {
          ...base,
          form: {
            kind: 'optical',
            necessityOfService: 'To help patient see clearly',
            lensPrescription: 'FRAMES_LENSES',
            lensAmount: 10000,
            eyeExaminationAmount: 2000,
            frameAmount: 10000,
            newOrReplacement: 'REPLACEMENT',
          },
        },
        false
      ).fields
    ).toMatchObject({ lens_prescription: 'FRAMES_LENSES', lens_amount: '10000', new_or_replacement: 'REPLACEMENT' });
    expect(
      buildKenyaPreauthMultipart(
        Token,
        { ...base, form: { kind: 'imaging', clinicalIndications: 'Head pains' } },
        false
      ).fields.clinical_indications
    ).toBe('Head pains');
  });

  test('refuses what DHA would reject', () => {
    expect(() => buildKenyaPreauthMultipart(Token, { ...base, icdCodes: [] }, false)).toThrow('diagnosis');
    expect(() => buildKenyaPreauthMultipart(Token, { ...base, unitPrices: [] }, false)).toThrow('item');
    expect(() => buildKenyaPreauthMultipart(Token, { ...base, doctors: [] }, false)).toThrow('doctor');
    expect(() => buildKenyaPreauthMultipart(Token, { ...base, serviceStart: '2026-03-05' }, false)).toThrow(
      'date and time'
    );
    expect(() =>
      buildKenyaPreauthMultipart(Token, { ...base, serviceEnd: '2026-03-04T10:00:00+03:00' }, false)
    ).toThrow('before the service start');
    expect(() =>
      buildKenyaPreauthMultipart(
        Token,
        {
          ...base,
          form: {
            kind: 'renal',
            numberOfSessionsRequired: 2,
            costPerSession: 1,
            frequencyOfSessions: 'DAILY',
            clinicalIndications: 'x',
          },
        },
        false
      )
    ).toThrow('TWICE_A_WEEK');
  });
});

describe('Kenya HIE preauth calls', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  test('creates a preauth as multipart and reads the result', async () => {
    mockHie(200, {
      id: 77,
      guid: 'pa-guid',
      status: 'PENDING_DOCTOR_APPROVAL',
      interventionCode: 'SHA-11-001',
      isElective: false,
      needsDoctorApproval: true,
      totalEstimatedAmountForPreauth: 500,
      preauthNotes: [{ note: 'Awaiting doctor', authorName: 'SHA' }],
      preauthFlags: [{}],
    });
    const preauth = await createKenyaHiePreauth(credentials, Token, base, false);
    expect(lastRequest()).toMatchObject({ url: `${Base}/preauths`, method: 'POST' });
    expect(lastRequest().headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
    const body = (lastRequest().raw as Buffer).toString('latin1');
    expect(body).toContain('name="attachments_0_file_blob"; filename="LAB_TESTS.jpg"\r\nContent-Type: image/jpeg');
    expect(preauth).toEqual({
      id: '77',
      guid: 'pa-guid',
      status: 'PENDING_DOCTOR_APPROVAL',
      preauthType: null,
      interventionCode: 'SHA-11-001',
      isElective: false,
      needsDoctorApproval: true,
      doctorReviewStatus: null,
      totalEstimatedAmount: 500,
      finalApprovedAmount: null,
      notes: ['Awaiting doctor'],
    });
  });

  test('reads, cancels and edits a preauth', async () => {
    mockHie(200, { status: 'FINALISED', finalApprovedAmount: 450 });
    await expect(getKenyaHiePreauth(credentials, Token)).resolves.toMatchObject({
      status: 'FINALISED',
      finalApprovedAmount: 450,
    });
    expect(lastRequest().url).toBe(`${Base}/preauths?consent_token=${Token}`);

    mockHie(200, { message: 'cancelled' });
    await cancelKenyaHiePreauth(credentials, Token, 'SHA-11-001');
    expect(lastRequest()).toMatchObject({ url: `${Base}/preauths/cancel`, method: 'POST' });
    expect(JSON.parse(lastRequest().raw as string)).toEqual({ consent_token: Token, intervention_code: 'SHA-11-001' });

    mockHie(200, {});
    await removeKenyaHiePreauthDiagnosis(credentials, Token, { interventionCode: 'SHA-11-001', icdCode: 'ca07.0' });
    expect(lastRequest()).toMatchObject({ url: `${Base}/preauths/diagnoses/ca07.0`, method: 'DELETE' });
    expect(JSON.parse(lastRequest().raw as string)).toEqual({
      consent_token: Token,
      icd_code: 'ca07.0',
      intervention_code: 'SHA-11-001',
    });

    mockHie(200, {});
    await removeKenyaHiePreauthDoctor(credentials, Token, {
      interventionCode: 'SHA-11-001',
      registrationNumber: 'A00000',
    });
    expect(lastRequest()).toMatchObject({ url: `${Base}/preauths/doctors`, method: 'DELETE' });
    expect(JSON.parse(lastRequest().raw as string)).toEqual({
      consent_token: Token,
      intervention_code: 'SHA-11-001',
      practitioner_registration_number: 'A00000',
    });
  });

  test('creates a pre-visit OTP authorization (DHA Postman "Create Authorization for OTP Visit")', async () => {
    mockHie(200, { guid: 'auth-1', token: 'TKN', status: 'AUTHORIZED_PENDING_VISIT' });
    await expect(
      createKenyaHieOtpAuthorization(credentials, {
        patientId: 'CR1',
        serviceType: 'OUTPATIENT',
        interventionCodes: ['SHA-11-001'],
        otp: '123456',
      })
    ).resolves.toMatchObject({ guid: 'auth-1', token: 'TKN', status: 'AUTHORIZED_PENDING_VISIT' });
    expect(lastRequest().url).toBe(`${Base}/claims/authorize`);
    expect(JSON.parse(lastRequest().raw as string)).toEqual({
      patient_id: 'CR1',
      service_type: 'OUTPATIENT',
      otp: '123456',
      interventions: ['SHA-11-001'],
    });
  });
});
