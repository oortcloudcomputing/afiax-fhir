// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { jest } from '@jest/globals';
import type { Claim, Patient, Project } from '@medplum/fhirtypes';
import type { Response as NodeFetchResponse } from 'node-fetch';
import fetch from 'node-fetch';
import type { KenyaErpNextCredentials } from './erpnext';
import {
  createErpNextPaymentEntry,
  createErpNextSalesInvoice,
  ensureErpNextCustomer,
  getKenyaErpNextCredentials,
  hasKenyaErpNextCredentials,
} from './erpnext';

jest.mock('node-fetch');
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    resourceType: 'Project',
    id: 'test-project',
    name: 'Test Project',
    setting: [{ name: 'erpnextEnabled', valueBoolean: true }],
    systemSecret: [
      { name: 'erpnextBaseUrl', valueString: 'https://erp.afiax.africa' },
      { name: 'erpnextApiKey', valueString: 'test-api-key' },
      { name: 'erpnextApiSecret', valueString: 'test-api-secret' },
      { name: 'erpnextCompany', valueString: 'Afiax Healthcare Ltd' },
    ],
    ...overrides,
  };
}

const testCredentials: KenyaErpNextCredentials = {
  baseUrl: 'https://erp.afiax.africa',
  apiKey: 'test-api-key',
  apiSecret: 'test-api-secret',
  company: 'Afiax Healthcare Ltd',
};

function mockOkResponse(data: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
  } as unknown as NodeFetchResponse);
}

function mockErrorResponse(status: number, text: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: async () => text,
  } as unknown as NodeFetchResponse);
}

// ---------------------------------------------------------------------------
// Credential helpers
// ---------------------------------------------------------------------------

describe('hasKenyaErpNextCredentials', () => {
  it('returns true when all required secrets are present and erpnextEnabled is true', () => {
    expect(hasKenyaErpNextCredentials(makeProject())).toBe(true);
  });

  it('returns false when erpnextEnabled is false', () => {
    expect(
      hasKenyaErpNextCredentials(makeProject({ setting: [{ name: 'erpnextEnabled', valueBoolean: false }] }))
    ).toBe(false);
  });

  it('returns false when a required secret is missing', () => {
    expect(
      hasKenyaErpNextCredentials(
        makeProject({ systemSecret: [{ name: 'erpnextBaseUrl', valueString: 'https://erp.afiax.africa' }] })
      )
    ).toBe(false);
  });
});

describe('getKenyaErpNextCredentials', () => {
  it('resolves all credentials from systemSecret', () => {
    const creds = getKenyaErpNextCredentials(makeProject());
    expect(creds.baseUrl).toBe('https://erp.afiax.africa');
    expect(creds.apiKey).toBe('test-api-key');
    expect(creds.apiSecret).toBe('test-api-secret');
    expect(creds.company).toBe('Afiax Healthcare Ltd');
  });

  it('strips trailing slash from baseUrl', () => {
    const project = makeProject({
      systemSecret: [
        { name: 'erpnextBaseUrl', valueString: 'https://erp.afiax.africa/' },
        { name: 'erpnextApiKey', valueString: 'key' },
        { name: 'erpnextApiSecret', valueString: 'secret' },
      ],
    });
    expect(getKenyaErpNextCredentials(project).baseUrl).toBe('https://erp.afiax.africa');
  });

  it('defaults company to Afiax Healthcare Ltd when not set', () => {
    const project = makeProject({
      systemSecret: [
        { name: 'erpnextBaseUrl', valueString: 'https://erp.afiax.africa' },
        { name: 'erpnextApiKey', valueString: 'key' },
        { name: 'erpnextApiSecret', valueString: 'secret' },
      ],
    });
    expect(getKenyaErpNextCredentials(project).company).toBe('Afiax Healthcare Ltd');
  });

  it('throws when a required secret is missing', () => {
    expect(() => getKenyaErpNextCredentials(makeProject({ systemSecret: [] }))).toThrow(
      'Missing required Afiax-managed ERPNext secret: erpnextBaseUrl'
    );
  });
});

// ---------------------------------------------------------------------------
// ensureErpNextCustomer
// ---------------------------------------------------------------------------

describe('ensureErpNextCustomer', () => {
  const patient: Patient & { id: string } = {
    resourceType: 'Patient',
    id: 'patient-001',
    name: [{ given: ['Jane', 'Wanjiku'], family: 'Mwangi' }],
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing customer when found by FHIR patient ID', async () => {
    mockOkResponse({ data: [{ name: 'Jane Wanjiku Mwangi' }] });

    const result = await ensureErpNextCustomer(testCredentials, patient);
    expect(result.customerName).toBe('Jane Wanjiku Mwangi');
    expect(result.created).toBe(false);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('creates a new customer when none found', async () => {
    mockOkResponse({ data: [] });
    mockOkResponse({ data: { name: 'Jane Wanjiku Mwangi' } });

    const result = await ensureErpNextCustomer(testCredentials, patient, 'KE-CR-2024-0098765');
    expect(result.customerName).toBe('Jane Wanjiku Mwangi');
    expect(result.created).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const createCall = mockFetch.mock.calls[1];
    const body = JSON.parse(createCall[1]?.body as string);
    expect(body.customer_name).toBe('Jane Wanjiku Mwangi');
    expect(body.custom_fhir_patient_id).toBe('Patient/patient-001');
    expect(body.custom_dha_client_registry_id).toBe('KE-CR-2024-0098765');
    expect(body.customer_group).toBe('Healthcare');
    expect(body.territory).toBe('Kenya');
  });

  it('uses Patient ID as customer name when patient has no name', async () => {
    const unnamed: Patient & { id: string } = { resourceType: 'Patient', id: 'patient-002' };
    mockOkResponse({ data: [] });
    mockOkResponse({ data: { name: 'Patient/patient-002' } });

    const result = await ensureErpNextCustomer(testCredentials, unnamed);
    expect(result.customerName).toBe('Patient/patient-002');
  });

  it('throws when ERPNext returns an error on customer search', async () => {
    mockErrorResponse(403, 'Forbidden');
    await expect(ensureErpNextCustomer(testCredentials, patient)).rejects.toThrow('ERPNext GET');
  });
});

// ---------------------------------------------------------------------------
// createErpNextSalesInvoice
// ---------------------------------------------------------------------------

describe('createErpNextSalesInvoice', () => {
  const claim: Claim & { id: string } = {
    resourceType: 'Claim',
    id: 'claim-001',
    status: 'active',
    type: { coding: [{ code: 'professional' }] },
    use: 'claim',
    patient: { reference: 'Patient/patient-001' },
    created: '2026-06-16',
    insurer: { reference: 'Organization/sha' },
    provider: { reference: 'Organization/facility-001' },
    priority: { coding: [{ code: 'normal' }] },
    insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/coverage-001' } }],
    total: { value: 3000, currency: 'KES' },
    item: [
      {
        sequence: 1,
        productOrService: { coding: [{ code: 'CONSULT-OPD', display: 'Outpatient Consultation' }] },
        quantity: { value: 1 },
        unitPrice: { value: 1500, currency: 'KES' },
      },
      {
        sequence: 2,
        productOrService: { coding: [{ code: 'LAB-MALARIA', display: 'Malaria RDT' }] },
        quantity: { value: 1 },
        unitPrice: { value: 1500, currency: 'KES' },
      },
    ],
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns existing invoice when found by FHIR claim ID', async () => {
    mockOkResponse({ data: [{ name: 'ACC-SINV-2026-00001', grand_total: 3000, currency: 'KES' }] });

    const result = await createErpNextSalesInvoice(testCredentials, claim, 'Jane Wanjiku Mwangi');
    expect(result.invoiceName).toBe('ACC-SINV-2026-00001');
    expect(result.invoiceTotal).toBe(3000);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('creates a new Sales Invoice from claim items', async () => {
    mockOkResponse({ data: [] });
    mockOkResponse({ data: { name: 'ACC-SINV-2026-00002', grand_total: 3000, currency: 'KES' } });

    const result = await createErpNextSalesInvoice(testCredentials, claim, 'Jane Wanjiku Mwangi');
    expect(result.invoiceName).toBe('ACC-SINV-2026-00002');
    expect(result.invoiceTotal).toBe(3000);

    const createCall = mockFetch.mock.calls[1];
    const body = JSON.parse(createCall[1]?.body as string);
    expect(body.customer).toBe('Jane Wanjiku Mwangi');
    expect(body.currency).toBe('KES');
    expect(body.items).toHaveLength(2);
    expect(body.items[0].item_code).toBe('CONSULT-OPD');
    expect(body.items[1].item_code).toBe('LAB-MALARIA');
    expect(body.custom_fhir_claim_id).toBe('Claim/claim-001');
  });

  it('throws when ERPNext invoice creation fails', async () => {
    mockOkResponse({ data: [] });
    mockErrorResponse(422, 'Validation error');
    await expect(createErpNextSalesInvoice(testCredentials, claim, 'Jane Wanjiku Mwangi')).rejects.toThrow(
      'ERPNext POST'
    );
  });
});

// ---------------------------------------------------------------------------
// createErpNextPaymentEntry
// ---------------------------------------------------------------------------

describe('createErpNextPaymentEntry', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates a Payment Entry and returns the doc name', async () => {
    mockOkResponse({ data: { name: 'ACC-PAY-2026-00001' } });

    const result = await createErpNextPaymentEntry(testCredentials, {
      invoiceName: 'ACC-SINV-2026-00002',
      amount: 2000,
      currency: 'KES',
      modeOfPayment: 'SHA Claims',
      partyName: 'SHA - Social Health Authority',
      customFields: { custom_sha_claim_state: 'approved' },
    });

    expect(result.paymentEntryName).toBe('ACC-PAY-2026-00001');
    expect(result.amount).toBe(2000);

    const body = JSON.parse(mockFetch.mock.calls[0][1]?.body as string);
    expect(body.payment_type).toBe('Receive');
    expect(body.paid_amount).toBe(2000);
    expect(body.references[0].reference_name).toBe('ACC-SINV-2026-00002');
    expect(body.custom_sha_claim_state).toBe('approved');
  });

  it('throws when ERPNext returns an error', async () => {
    mockErrorResponse(500, 'Internal Server Error');
    await expect(
      createErpNextPaymentEntry(testCredentials, {
        invoiceName: 'ACC-SINV-2026-00002',
        amount: 1000,
        currency: 'KES',
        modeOfPayment: 'Cash',
        partyName: 'Jane Wanjiku Mwangi',
      })
    ).rejects.toThrow('ERPNext POST');
  });
});
