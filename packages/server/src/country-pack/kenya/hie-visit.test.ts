// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { clearKenyaHieTokenCache } from './afyalink';
import {
  createKenyaHieBiometricsAuthorization,
  getKenyaHieAuthorizations,
  getKenyaHiePatientContacts,
  KenyaHieRequestError,
  rejectKenyaHieAuthorization,
  sendKenyaHieVisitOtp,
  startKenyaHieVisit,
} from './hie-visit';

jest.mock('node-fetch');

const Base = 'https://hie.example/api/v1';
const credentials: KenyaAfyaLinkCredentials = { baseUrl: Base, clientId: 'id', clientSecret: 'secret' };
const mockFetch = fetch as unknown as jest.Mock;

function jsonResponse(status: number, body: unknown): Record<string, unknown> {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function mockHie(status: number, body: unknown): void {
  mockFetch
    .mockResolvedValueOnce(jsonResponse(200, { access_token: 'jwt', expires_in: 3600 }))
    .mockResolvedValueOnce(jsonResponse(status, body));
}

function lastRequest(): { url: string; method: string; body: unknown; headers: Record<string, string> } {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url, method: init.method, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
}

describe('Kenya HIE visit consent and start visit', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  test('lists the patient contacts', async () => {
    mockHie(200, {
      count: 1,
      results: [
        {
          id: 675590,
          contactValue: '+254714***898',
          contactType: 'PHO',
          isConfirmed: true,
          active: true,
          isMainContact: true,
        },
      ],
    });

    await expect(getKenyaHiePatientContacts(credentials, 'CR1')).resolves.toEqual([
      { id: 675590, value: '+254714***898', type: 'PHO', confirmed: true, active: true, main: true },
    ]);
    expect(lastRequest()).toMatchObject({ url: `${Base}/patients/contacts?patient_id=CR1`, method: 'GET' });
  });

  test('sends the visit OTP with the chosen contact', async () => {
    mockHie(200, { data: { status: 'success' }, message: 'OTP sent' });

    await expect(
      sendKenyaHieVisitOtp(credentials, { patientId: 'CR1', interventionCodes: [' SHA-12-001 '], contactId: 675590 })
    ).resolves.toEqual({ message: 'OTP sent' });
    expect(lastRequest()).toMatchObject({
      url: `${Base}/claims/otp`,
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json', Authorization: 'Bearer jwt' }),
      body: { patient_id: 'CR1', intervention_codes: ['SHA-12-001'], contact_id: 675590 },
    });
  });

  test('requires an intervention code before sending an OTP', async () => {
    await expect(sendKenyaHieVisitOtp(credentials, { patientId: 'CR1', interventionCodes: [' '] })).rejects.toThrow(
      'At least one SHA intervention code is required'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('creates a fingerprint authorization and returns the capture page', async () => {
    mockHie(200, {
      guid: 'g-1',
      token: 'K5HLPJVDNV',
      status: 'PENDING',
      sessionType: 'OUTPATIENT',
      shaVerificationRequest: { requestUrl: 'https://capture.example/x', embededToken: 'e-1', embedExpiry: 300 },
    });

    const authorization = await createKenyaHieBiometricsAuthorization(credentials, {
      patientId: 'CR1',
      serviceType: 'OUTPATIENT',
      interventionCodes: ['SHA-12-001'],
      agentId: '12345678',
      workStationId: 'ws-1',
      deviceOs: 'windows',
      facilityFrCode: 'FID-47-105963-0',
      facilityName: 'Test Facility',
    });

    expect(authorization).toMatchObject({
      guid: 'g-1',
      token: 'K5HLPJVDNV',
      status: 'PENDING',
      captureUrl: 'https://capture.example/x',
      captureToken: 'e-1',
      captureExpiresIn: 300,
    });
    expect(lastRequest().body).toEqual({
      agent_id: '12345678',
      authorizing_device_os: 'windows',
      ekyc_provider_id: 'Test Facility',
      factors: ['SHA'],
      interventions: ['SHA-12-001'],
      is_biometrics_discharge_authorization: false,
      is_emergency: false,
      is_integration: true,
      patient_id: 'CR1',
      provider: 'FID-47-105963-0',
      service_type: 'OUTPATIENT',
      work_station_id: 'ws-1',
    });
  });

  test('reads an authorization by GUID, including the OTP fallback reason', async () => {
    mockHie(200, [{ guid: 'g-1', status: 'REJECTED', authorizationReason: 'BIOMETRICS_NOT_FOUND_OTP_ALLOWED' }]);

    const [authorization] = await getKenyaHieAuthorizations(credentials, { guid: 'g-1' });
    expect(authorization).toMatchObject({ status: 'REJECTED', reason: 'BIOMETRICS_NOT_FOUND_OTP_ALLOWED' });
    expect(lastRequest().url).toBe(`${Base}/claims/authorizations?guid=g-1`);
  });

  test('rejects a pending authorization', async () => {
    mockHie(200, { message: 'rejected' });

    await rejectKenyaHieAuthorization(credentials, 'K5HLPJVDNV');
    expect(lastRequest()).toMatchObject({ url: `${Base}/claims/authorizations/K5HLPJVDNV/reject`, method: 'POST' });
  });

  test('starts an OTP visit and returns the consent token', async () => {
    mockHie(200, {
      claim_id: 991,
      authorization_code: 'ZLXNV8CUJR',
      authorization_guid: 'g-2',
      visit_number: 'V-1',
      service_type: 'OUTPATIENT',
      workflow_state: 'OPEN',
      scheme_name: 'SHIF',
      interventions: [
        {
          intervention_code: 'SHA-12-001',
          intervention_name: 'Consultation',
          needs_preauth: false,
          intervention_payment_mechanism: 'FEE_FOR_SERVICE',
        },
      ],
    });

    const visit = await startKenyaHieVisit(credentials, {
      patientId: 'CR1',
      serviceType: 'OUTPATIENT',
      interventionCodes: ['SHA-12-001'],
      otp: '123456',
      practitioner: { identificationType: 'registration_number', identificationNumber: 'A1', regulator: 'KMPDC' },
    });

    expect(visit).toMatchObject({
      claimId: '991',
      consentToken: 'ZLXNV8CUJR',
      authorizationGuid: 'g-2',
      visitNumber: 'V-1',
      workflowState: 'OPEN',
      schemeName: 'SHIF',
      interventions: [{ code: 'SHA-12-001', needsPreauth: false, paymentMechanism: 'FEE_FOR_SERVICE' }],
    });
    expect(lastRequest()).toMatchObject({
      url: `${Base}/claims/visit`,
      body: {
        intervention_codes: ['SHA-12-001'],
        patient_id: 'CR1',
        service_type: 'OUTPATIENT',
        otp: '123456',
        practitioner_identification_type: 'registration_number',
        practitioner_identification_number: 'A1',
        practitioner_regulation_body: 'KMPDC',
      },
    });
  });

  test('starts a fingerprint visit with the authorization GUID instead of an OTP', async () => {
    mockHie(200, { claim_id: 5, authorization_code: 'T1' });

    await startKenyaHieVisit(credentials, {
      patientId: 'CR1',
      serviceType: 'CAPITATION',
      interventionCodes: ['SHA-01-001'],
      authorizationGuid: 'g-1',
    });
    expect(lastRequest().body).toEqual({
      intervention_codes: ['SHA-01-001'],
      patient_id: 'CR1',
      service_type: 'CAPITATION',
      auth_guid: 'g-1',
    });
  });

  test('needs exactly one of an OTP or an authorization GUID', async () => {
    const base = { patientId: 'CR1', serviceType: 'OUTPATIENT' as const, interventionCodes: ['X'] };
    await expect(startKenyaHieVisit(credentials, base)).rejects.toThrow('Provide either the OTP');
    await expect(startKenyaHieVisit(credentials, { ...base, otp: '1', authorizationGuid: 'g' })).rejects.toThrow(
      'Provide either the OTP'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('reports a wrong OTP as a request error with the DHA message', async () => {
    mockHie(400, { error: 'Bad Request', message: 'OTP verification failed', trace_id: 't-9' });

    const promise = startKenyaHieVisit(credentials, {
      patientId: 'CR1',
      serviceType: 'OUTPATIENT',
      interventionCodes: ['X'],
      otp: '000000',
    });
    await expect(promise).rejects.toBeInstanceOf(KenyaHieRequestError);
    await expect(promise).rejects.toThrow('Kenya HIE start visit failed (400): OTP verification failed (trace t-9)');
  });

  test('rejects a visit response without a consent token', async () => {
    mockHie(200, { claim_id: 5 });

    await expect(
      startKenyaHieVisit(credentials, {
        patientId: 'CR1',
        serviceType: 'OUTPATIENT',
        interventionCodes: ['X'],
        otp: '1',
      })
    ).rejects.toThrow('did not include an authorization_code');
  });
});
