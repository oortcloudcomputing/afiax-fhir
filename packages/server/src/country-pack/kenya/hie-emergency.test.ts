// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { clearKenyaHieTokenCache } from './afyalink';
import type { KenyaEmergencyCase } from './hie-emergency';
import {
  addKenyaHieEmergencyDoctor,
  addKenyaHieEmergencyProtocol,
  createKenyaHieEmergencyClaim,
  getKenyaHieEmergencyProtocols,
  identifyKenyaHieEmergencyPatient,
  removeKenyaHieEmergencyDoctor,
  submitKenyaHieEmergencyClaim,
} from './hie-emergency';

jest.mock('node-fetch');

const Base = 'https://hie.example/api/v1';
const credentials: KenyaAfyaLinkCredentials = { baseUrl: Base, clientId: 'id', clientSecret: 'secret' };
const mockFetch = fetch as unknown as jest.Mock;
const Token = 'K5HLPJVDNV';

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

const json = (): unknown => JSON.parse(lastRequest().raw as string);

const shock: KenyaEmergencyCase = {
  interventionCode: 'sha-01-005',
  modeOfArrival: 'ambulance',
  broughtBy: 'PARAMEDICS',
  referenceNumber: 'EMG/1/2026',
  practitioner: { identificationNumber: 'A00000', identificationType: 'registration_number', regulator: 'KMPDC' },
  notes: 'Severe shock after a road traffic accident',
};

const caseBody = {
  interventions: ['SHA-01-005'],
  mode_of_arrival: 'AMBULANCE',
  brought_by: 'PARAMEDICS',
  reference_number: 'EMG/1/2026',
  identification_number: 'A00000',
  identification_type: 'registration_number',
  regulation_body: 'KMPDC',
  notes: 'Severe shock after a road traffic accident',
};

describe('Kenya HIE emergency case claims (ECCIF)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  test('creates an identified emergency claim with the patient OTP (schema Identified variant)', async () => {
    mockHie(200, { id: 'c1', authorization_code: Token, workflow_state: 'OPEN' });
    const claim = await createKenyaHieEmergencyClaim(credentials, shock, { crId: 'CR1', otp: '123456' });
    expect(lastRequest()).toMatchObject({ url: `${Base}/claims/emergency`, method: 'POST' });
    expect(json()).toEqual({ ...caseBody, beneficiary_cr_id: 'CR1', otp: '123456' });
    expect(claim).toMatchObject({ claimId: 'c1', consentToken: Token, workflowState: 'OPEN' });
  });

  test('creates an unidentified emergency claim without patient fields', async () => {
    mockHie(200, { authorization_code: Token });
    await createKenyaHieEmergencyClaim(credentials, shock);
    expect(json()).toEqual(caseBody);
  });

  test('only SHA-01 emergency interventions, and only DHA modes of arrival', async () => {
    await expect(
      createKenyaHieEmergencyClaim(credentials, { ...shock, interventionCode: 'SHA-19-404' })
    ).rejects.toThrow('SHA-01 emergency interventions only');
    await expect(createKenyaHieEmergencyClaim(credentials, { ...shock, modeOfArrival: 'HELICOPTER' })).rejects.toThrow(
      'AMBULANCE, WALK-IN, OTHER'
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('a response without authorization_code is an error', async () => {
    mockHie(200, { id: 'c1' });
    await expect(createKenyaHieEmergencyClaim(credentials, shock)).rejects.toThrow('authorization_code');
  });

  test('identifies an unknown patient with the original fields, CR ID, OTP and token', async () => {
    mockHie(200, { authorization_code: Token });
    await identifyKenyaHieEmergencyPatient(credentials, Token, shock, { crId: 'CR1', otp: '654321', contactId: '1' });
    expect(json()).toEqual({
      ...caseBody,
      beneficiary_cr_id: 'CR1',
      otp: '654321',
      consent_token: Token,
      beneficiary_contact_id: '1',
    });
  });

  test('reads the approved protocols with tariffs and document types', async () => {
    mockHie(200, {
      count: 1,
      results: [
        {
          protocolCode: 'P-001',
          name: 'Chest X-Ray',
          applicableTariff: '2500',
          status: 'ACTIVE',
          intervention: [{ code: 'SHA-01-005', applicableDocumentTypes: ['CASE_NOTE', 'IMAGING_RESULT'] }],
        },
      ],
    });
    await expect(getKenyaHieEmergencyProtocols(credentials, 'SHA-01-005')).resolves.toEqual([
      {
        protocolCode: 'P-001',
        name: 'Chest X-Ray',
        applicableTariff: 2500,
        status: 'ACTIVE',
        applicableDocumentTypes: ['CASE_NOTE', 'IMAGING_RESULT'],
      },
    ]);
    expect(lastRequest().url).toBe(`${Base}/claims/emergency/protocols?active=true&intervention_code=SHA-01-005`);
  });

  test('adds a protocol as JSON with numeric strings', async () => {
    mockHie(200, { id: 'line-1' });
    await addKenyaHieEmergencyProtocol(credentials, Token, {
      protocolCode: 'P-001',
      interventionCode: 'SHA-01-005',
      unitPrice: 2500,
      quantity: 1,
    });
    expect(json()).toEqual({
      consent_token: Token,
      protocol_code: 'P-001',
      intervention_code: 'SHA-01-005',
      unit_price: '2500',
      quantity: '1',
    });
  });

  test('adds combined protocol details as multipart (DHA Postman shape)', async () => {
    mockHie(200, { id: 'line-2' });
    await addKenyaHieEmergencyProtocol(credentials, Token, {
      protocolCode: 'P-001',
      interventionCode: 'SHA-01-005',
      unitPrice: 200,
      quantity: 1,
      icdCodes: ['5B5K.0'],
      attachments: [
        {
          documentType: 'invoice',
          title: 'Invoice',
          filename: 'INVOICE.pdf',
          contentType: 'application/pdf',
          data: Buffer.from('%PDF'),
        },
      ],
    });
    expect(lastRequest().headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
    const body = (lastRequest().raw as Buffer).toString('latin1');
    expect(body).toContain('name="diagnoses"\r\n\r\n["5B5K.0"]\r\n');
    expect(body).toContain(
      'name="attachments"\r\n\r\n[{"document_title":"Invoice","document_type":"INVOICE","file_field_name":"attachments_0_file_blob"}]\r\n'
    );
    expect(body).toContain('name="attachments_0_file_blob"; filename="INVOICE.pdf"');
  });

  test('adds and removes the attending doctor', async () => {
    mockHie(200, { status: 'ok' });
    await addKenyaHieEmergencyDoctor(credentials, Token, {
      identificationNumber: '24131705',
      identificationType: 'National ID',
      regulator: 'NCK',
    });
    expect(lastRequest()).toMatchObject({ url: `${Base}/claims/doctors`, method: 'POST' });
    expect(json()).toEqual({
      consent_token: Token,
      identification_number: '24131705',
      identification_type: 'National ID',
      regulation_body: 'NCK',
    });
    mockHie(204, undefined);
    await removeKenyaHieEmergencyDoctor(credentials, Token);
    expect(lastRequest()).toMatchObject({ url: `${Base}/claims/doctors`, method: 'DELETE' });
    expect(json()).toEqual({ consent_token: Token });
  });

  test('submits identified and unidentified claims per the Submit guide', async () => {
    mockHie(200, { workflow_state: 'SUBMITTED' });
    await submitKenyaHieEmergencyClaim(
      credentials,
      Token,
      { invoiceNumber: 'EMG/1', dischargeReason: 'recovered' },
      true
    );
    expect(json()).toEqual({ consent_token: Token, invoice_number: 'EMG/1', discharge_reason: 'RECOVERED' });

    await expect(
      submitKenyaHieEmergencyClaim(credentials, Token, { invoiceNumber: 'EMG/2', dischargeReason: 'OTHER' }, false)
    ).rejects.toThrow('SHA_UNREGISTERED, DECEASED');
    await expect(
      submitKenyaHieEmergencyClaim(credentials, Token, { invoiceNumber: 'EMG/2', dischargeReason: 'DECEASED' }, true)
    ).rejects.toThrow('RECOVERED, REFERRED, ABSCONDED, OTHER');

    mockHie(200, { workflow_state: 'SUBMITTED' });
    await submitKenyaHieEmergencyClaim(
      credentials,
      Token,
      { invoiceNumber: 'EMG/2', dischargeReason: 'OTHER', reasonForUnknownPatient: 'deceased' },
      false
    );
    expect(json()).toEqual({
      consent_token: Token,
      invoice_number: 'EMG/2',
      discharge_reason: 'OTHER',
      reason_for_unknown_patient: 'DECEASED',
    });
  });
});
