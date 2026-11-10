// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { clearKenyaHieTokenCache } from './afyalink';
import {
  addKenyaHieClaimAttachment,
  addKenyaHieClaimDiagnosis,
  addKenyaHieClaimLine,
  closeKenyaHieClaim,
  dischargeKenyaHiePatient,
  editKenyaHieClaimLine,
  finalizeKenyaHiePartialClaim,
  getKenyaHiePayerClaim,
  removeKenyaHieClaimLine,
  resendKenyaHieClaim,
  resubmitKenyaHieClaim,
  sendKenyaHieDischargeOtp,
  submitKenyaHieClaim,
  summarizeKenyaHieClaim,
} from './hie-claims';
import { KenyaHieRequestError } from './hie-visit';

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
const multipartText = (): string => (lastRequest().raw as Buffer).toString('latin1');

const pdf = {
  documentType: 'lab_results',
  title: 'Malaria RDT',
  filename: 'LAB_RESULTS.pdf',
  contentType: 'application/pdf',
  data: Buffer.from('%PDF-1.4 test'),
};

describe('Kenya HIE claim billing', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  test('adds a line as JSON with numeric strings and the doctor', async () => {
    mockHie(200, { id: 'line-1' });
    await addKenyaHieClaimLine(credentials, Token, {
      interventionCode: 'SHA-09-021',
      unitPrice: 300,
      quantity: 2.555,
      serviceName: 'Basic consultation',
      practitioner: { identificationType: 'registration_number', identificationNumber: 'A00000', regulator: 'KMPDC' },
    });
    expect(lastRequest()).toMatchObject({
      url: `${Base}/claims/lines`,
      method: 'POST',
      headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
    });
    expect(json()).toEqual({
      consent_token: Token,
      intervention_code: 'SHA-09-021',
      unit_price: '300',
      quantity: '2.56',
      service_name: 'Basic consultation',
      practitioner_identification_type: 'registration_number',
      practitioner_identification_number: 'A00000',
      practitioner_regulation_body: 'KMPDC',
    });
  });

  test('adds a line with an attachment as multipart, metadata naming the binary part', async () => {
    mockHie(200, { id: 'line-2' });
    await addKenyaHieClaimLine(credentials, Token, {
      interventionCode: 'SHA-18-005',
      unitPrice: 1500,
      quantity: 1,
      attachments: [pdf],
    });
    const { headers } = lastRequest();
    expect(headers['Content-Type']).toMatch(/^multipart\/form-data; boundary=/);
    const body = multipartText();
    expect(body).toContain('name="unit_price"\r\n\r\n1500\r\n');
    expect(body).toContain(
      '[{"document_title":"Malaria RDT","document_type":"LAB_RESULTS","file_field_name":"file_1"}]'
    );
    expect(body).toContain(
      'name="file_1"; filename="LAB_RESULTS.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4 test'
    );
    expect(body).not.toContain(Buffer.from('%PDF-1.4 test').toString('base64'));
  });

  test('refuses a zero price or a bad document type', async () => {
    await expect(
      addKenyaHieClaimLine(credentials, Token, { interventionCode: 'SHA-1', unitPrice: 0, quantity: 1 })
    ).rejects.toThrow('The unit price must be a positive number');
    await expect(
      addKenyaHieClaimAttachment(credentials, Token, 'SHA-1', { ...pdf, documentType: 'lab results!' })
    ).rejects.toThrow('document type');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test('attaches a document with the file part named file_blob', async () => {
    mockHie(200, { id: 'att-1' });
    await addKenyaHieClaimAttachment(credentials, Token, 'SHA-18-005', { ...pdf, documentType: 'INVOICE' });
    expect(lastRequest().url).toBe(`${Base}/claims/attachments`);
    const body = multipartText();
    expect(body).toContain('name="document_type"\r\n\r\nINVOICE\r\n');
    expect(body).toContain('name="file_blob"; filename="LAB_RESULTS.pdf"');
  });

  test('adds a diagnosis and removes a line', async () => {
    mockHie(200, { claim_diagnosis_id: 1 });
    await addKenyaHieClaimDiagnosis(credentials, Token, { interventionCode: 'SHA-18-005', icdCode: 'CA07.0' });
    expect(json()).toEqual({ consent_token: Token, icd_code: 'CA07.0', intervention_code: 'SHA-18-005' });
    mockHie(200, { message: 'removed' });
    await removeKenyaHieClaimLine(credentials, Token, 'line-guid');
    expect(lastRequest()).toMatchObject({ url: `${Base}/claims/lines`, method: 'PATCH' });
    expect(json()).toEqual({ consent_token: Token, line_guid: 'line-guid' });
  });

  test('reads the payer view by the invoice number', async () => {
    mockHie(200, {});
    await getKenyaHiePayerClaim(credentials, 'OPD/1/23');
    expect(lastRequest().url).toBe(`${Base}/claims/preview/payer?provider_claim_no=OPD%2F1%2F23`);
  });

  test('summarizes a claim preview', () => {
    expect(
      summarizeKenyaHieClaim({
        id: 'claim-1',
        workflowState: 'x',
        workflow_state: 'OPEN',
        claim_auth_status: 'AUTHORIZED',
        total_claim_amount: 1800,
        total_claim_net_amount: 1800,
        invoices: [
          {
            invoice_number: 'OPD/1/23',
            lines: [
              { id: 'l1', intervention_code: 'SHA-09-021', quantity: '1', unit_price: '300', line_net_amount: 300 },
            ],
            invoice_flags: [
              { message: 'Missing attachment', is_resolved: false },
              { message: 'Old', is_resolved: true },
            ],
          },
        ],
        claim_diagnoses: [{ intervention_code: 'SHA-09-021', diagnosis_code: '1F40' }],
        claim_attachments: [{ id: 'a1', intervention_code: 'SHA-09-021', attachment_type: 'INVOICE' }],
      })
    ).toEqual({
      claimId: 'claim-1',
      workflowState: 'OPEN',
      claimAuthStatus: 'AUTHORIZED',
      invoiceNumber: 'OPD/1/23',
      totalAmount: 1800,
      netAmount: 1800,
      flags: ['Missing attachment'],
      lines: [
        { id: 'l1', interventionCode: 'SHA-09-021', itemName: null, quantity: 1, unitPrice: 300, netAmount: 300 },
      ],
      diagnoses: [{ interventionCode: 'SHA-09-021', code: '1F40' }],
      attachments: [{ id: 'a1', interventionCode: 'SHA-09-021', type: 'INVOICE' }],
    });
  });
});

describe('Kenya HIE claim dispatch', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  test('sends the discharge OTP', async () => {
    mockHie(200, { message: 'OTP sent' });
    await sendKenyaHieDischargeOtp(credentials, Token, 'CR1');
    expect(lastRequest().url).toBe(`${Base}/claims/otp/discharge`);
    expect(json()).toEqual({ consent_token: Token, patient_id: 'CR1' });
  });

  test('submits an outpatient claim with the OTP and contact', async () => {
    mockHie(200, { id: 'claim-1', workflow_state: 'SUBMITTED' });
    await submitKenyaHieClaim(credentials, Token, {
      invoiceNumber: 'OPD/1/23',
      dischargeReason: 'recovered',
      consent: { otp: '123456', contactId: '675590' },
      notes: 'Stable',
    });
    expect(json()).toEqual({
      consent_token: Token,
      invoice_number: 'OPD/1/23',
      discharge_reason: 'RECOVERED',
      otp: '123456',
      beneficiary_contact_id: '675590',
      notes: 'Stable',
    });
  });

  test('outpatients cannot be submitted as deceased, and need exactly one consent', async () => {
    await expect(
      submitKenyaHieClaim(credentials, Token, {
        invoiceNumber: 'OPD/1',
        dischargeReason: 'DECEASED',
        consent: { otp: '1' },
      })
    ).rejects.toThrow('RECOVERED, REFERRED, ABSCONDED, OTHER');
    await expect(
      submitKenyaHieClaim(credentials, Token, {
        invoiceNumber: 'OPD/1',
        dischargeReason: 'RECOVERED',
        consent: { otp: '1', dischargeAuthorizationGuid: 'g' },
      })
    ).rejects.toThrow('Provide either the discharge OTP');
  });

  test('finalises a partial discharge with only FULL', async () => {
    mockHie(200, {});
    await finalizeKenyaHiePartialClaim(credentials, Token);
    expect(json()).toEqual({ consent_token: Token, discharge_status: 'FULL' });
  });

  test('discharges an inpatient by fingerprints', async () => {
    mockHie(200, {});
    await dischargeKenyaHiePatient(credentials, Token, {
      invoiceNumber: 'IP/783/33956',
      dischargeReason: 'DECEASED',
      dischargeDate: '2026-06-08T20:30:00+03:00',
      consent: { dischargeAuthorizationGuid: 'guid-1', contactId: 'ignored' },
    });
    expect(lastRequest().url).toBe(`${Base}/claims/discharge`);
    expect(json()).toEqual({
      consent_token: Token,
      invoice_number: 'IP/783/33956',
      discharge_reason: 'DECEASED',
      discharge_date: '2026-06-08T20:30:00+03:00',
      discharge_auth_guid: 'guid-1',
    });
  });

  test('closes a claim with a cancel reason', async () => {
    mockHie(200, {});
    await closeKenyaHieClaim(credentials, Token, { reasonType: 'no_service_given', reasonText: 'Patient left' });
    expect(json()).toEqual({
      cancel_reason_text: 'Patient left',
      cancel_reason_type: 'NO_SERVICE_GIVEN',
      consent_token: Token,
    });
  });

  test('reports DHA rejections as request errors', async () => {
    mockHie(400, { message: 'Invalid OTP' });
    await expect(
      submitKenyaHieClaim(credentials, Token, {
        invoiceNumber: 'OPD/1',
        dischargeReason: 'RECOVERED',
        consent: { otp: '000000' },
      })
    ).rejects.toBeInstanceOf(KenyaHieRequestError);
  });
});

describe('Kenya HIE claim resubmission', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  test('reopens a returned claim at the API reference path', async () => {
    mockHie(200, { status: 'DRAFT_RESUBMIT' });
    await resubmitKenyaHieClaim(credentials, Token);
    expect(lastRequest()).toMatchObject({ url: `${Base}/claims/lines/resubmit`, method: 'POST' });
    expect(json()).toEqual({ consent_token: Token });
  });

  test('edits a line with an integer quantity (guide and API reference)', async () => {
    mockHie(200, { id: 'l1' });
    await editKenyaHieClaimLine(credentials, Token, { lineId: 'l1', unitPrice: 250, quantity: 2 });
    expect(lastRequest()).toMatchObject({ url: `${Base}/claims/lines/edit`, method: 'PATCH' });
    expect(json()).toEqual({ consent_token: Token, line_id: 'l1', unit_price: '250', quantity: 2 });
    await expect(
      editKenyaHieClaimLine(credentials, Token, { lineId: 'l1', unitPrice: 250, quantity: 1.5 })
    ).rejects.toThrow('whole number');
  });

  test('sends again with only the consent token', async () => {
    mockHie(200, { workflow_state: 'SUBMITTED' });
    await resendKenyaHieClaim(credentials, Token, 'discharge');
    expect(lastRequest().url).toBe(`${Base}/claims/discharge`);
    expect(json()).toEqual({ consent_token: Token });
  });
});
