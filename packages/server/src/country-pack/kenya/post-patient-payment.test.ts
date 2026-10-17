// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { jest } from '@jest/globals';
import type { KenyaErpNextSubmissionSnapshot } from '@medplum/core';
import { buildKenyaErpNextSubmissionExtension, getKenyaPatientPaymentSnapshot } from '@medplum/core';
import type { Claim, Patient, PaymentNotice, Project } from '@medplum/fhirtypes';
import type { Response as NodeFetchResponse } from 'node-fetch';
import fetch from 'node-fetch';
import { handlePostPatientPayment } from './post-patient-payment';

jest.mock('../../util/auditevent', () => ({
  createAuditEvent: jest.fn(() => ({ resourceType: 'AuditEvent', entity: [] })),
  logAuditEvent: jest.fn(),
  AuditEventOutcome: { Success: '0', MinorFailure: '4', MajorFailure: '8' },
  OperationInteraction: { code: 'operation' },
  RestfulOperationType: { code: 'rest' },
}));

jest.mock('node-fetch');
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

function mockOkResponse(data: unknown): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(data),
    json: async () => data,
  } as unknown as NodeFetchResponse);
}

// ---------------------------------------------------------------------------

function makeRepo(): any {
  const created: Record<string, object[]> = {};
  const updated: object[] = [];
  let idSeq = 0;

  const patient: Patient = {
    resourceType: 'Patient',
    id: 'patient-001',
    name: [{ given: ['Jane'], family: 'Mwangi' }],
  };

  return {
    created,
    updated,
    createResource: jest.fn(async (resource: { resourceType: string }) => {
      const r = { ...resource, id: `${resource.resourceType}-${++idSeq}` };
      (created[resource.resourceType] ??= []).push(r);
      return r;
    }),
    updateResource: jest.fn(async (resource: object) => {
      updated.push(resource);
      return resource;
    }),
    readReference: jest.fn(async () => patient),
  };
}

function makeCtx(repo: any): any {
  return {
    project: { id: 'project-test' },
    profile: { reference: 'Practitioner/test' },
    systemRepo: repo,
  } as any;
}

function makeProject(erpEnabled = true): Project & { id: string } {
  return {
    resourceType: 'Project',
    id: 'project-test',
    setting: [{ name: 'erpnextEnabled', valueBoolean: erpEnabled }],
    systemSecret: erpEnabled
      ? [
          { name: 'erpnextBaseUrl', valueString: 'https://erp.afiax.africa' },
          { name: 'erpnextApiKey', valueString: 'key' },
          { name: 'erpnextApiSecret', valueString: 'secret' },
          { name: 'erpnextCompany', valueString: 'Afiax Healthcare Ltd' },
          { name: 'mpesaConsumerKey', valueString: 'mpesa-ck' },
          { name: 'mpesaConsumerSecret', valueString: 'mpesa-cs' },
          { name: 'mpesaShortCode', valueString: '400200' },
          { name: 'mpesaPasskey', valueString: 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919' },
          { name: 'afiaxPayBaseUrl', valueString: 'https://pay.afiax.africa' },
          { name: 'afiaxPayApiKey', valueString: 'pay-key' },
          { name: 'afiaxPaySecretKey', valueString: 'pay-secret' },
        ]
      : [],
  };
}

function makeClaimWithInvoice(): Claim & { id: string } {
  const snapshot: KenyaErpNextSubmissionSnapshot = {
    invoiceName: 'ACC-SINV-2026-00010',
    invoiceTotal: 2000,
    currency: 'KES',
    status: 'invoice-created',
    totalConfirmed: 0,
    patientDue: 2000,
  };
  return {
    resourceType: 'Claim',
    id: 'claim-010',
    status: 'active',
    use: 'claim',
    type: { coding: [{ code: 'professional' }] },
    patient: { reference: 'Patient/patient-001' },
    created: '2026-06-18',
    insurer: { reference: 'Organization/sha-001' },
    provider: { reference: 'Organization/facility-001' },
    priority: { coding: [{ code: 'normal' }] },
    insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/cov-001' } }],
    total: { value: 2000, currency: 'KES' },
    extension: [buildKenyaErpNextSubmissionExtension(snapshot)],
  };
}

// ---------------------------------------------------------------------------

describe('handlePostPatientPayment — cash', () => {
  afterEach(() => jest.clearAllMocks());

  test('creates PaymentNotice and ERPNext entry for cash payment', async () => {
    mockOkResponse({ data: { name: 'ACC-PAY-2026-CASH-001' } }); // ERPNext

    const repo = makeRepo();
    const result = await handlePostPatientPayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      method: 'cash',
      amount: 2000,
      currency: 'KES',
      transactionRef: 'RCPT-001',
      correlationId: 'corr-cash-001',
      project: makeProject(),
      baseUrl: 'https://api.afiax.africa',
    });

    expect(result.status).toBe('confirmed');
    expect(result.method).toBe('cash');
    expect(result.amount).toBe(2000);
    expect(result.erpNextPaymentEntry).toBe('ACC-PAY-2026-CASH-001');
    expect(result.patientDue).toBe(0);
    expect(result.message).toContain('Balance cleared');

    // PaymentNotice created
    const notices = repo.created['PaymentNotice'] as PaymentNotice[];
    expect(notices).toHaveLength(1);
    const snap = getKenyaPatientPaymentSnapshot(notices[0]);
    expect(snap?.method).toBe('cash');
    expect(snap?.paymentStatus).toBe('confirmed');
    expect(snap?.transactionRef).toBe('RCPT-001');
  });

  test('still confirms when ERPNext fails (non-blocking)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'ERPNext down',
    } as unknown as NodeFetchResponse);

    const repo = makeRepo();
    const result = await handlePostPatientPayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      method: 'cash',
      amount: 2000,
      currency: 'KES',
      correlationId: 'corr-cash-002',
      project: makeProject(),
      baseUrl: 'https://api.afiax.africa',
    });

    expect(result.status).toBe('confirmed');
    expect(result.erpNextPaymentEntry).toBeUndefined();
  });
});

describe('handlePostPatientPayment — card', () => {
  afterEach(() => jest.clearAllMocks());

  test('confirms card payment with auth code', async () => {
    mockOkResponse({ data: { name: 'ACC-PAY-CARD-001' } });

    const repo = makeRepo();
    const result = await handlePostPatientPayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      method: 'card',
      amount: 2000,
      currency: 'KES',
      transactionRef: 'AUTH-XYZ-987',
      correlationId: 'corr-card-001',
      project: makeProject(),
      baseUrl: 'https://api.afiax.africa',
    });

    expect(result.status).toBe('confirmed');
    expect(result.method).toBe('card');
    expect(result.erpNextPaymentEntry).toBe('ACC-PAY-CARD-001');
  });
});

describe('handlePostPatientPayment — mpesa-manual', () => {
  afterEach(() => jest.clearAllMocks());

  test('confirms mpesa-manual with receipt code', async () => {
    mockOkResponse({ data: { name: 'ACC-PAY-MPESA-MANUAL-001' } });

    const repo = makeRepo();
    const result = await handlePostPatientPayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      method: 'mpesa-manual',
      amount: 2000,
      currency: 'KES',
      transactionRef: 'QHX5LMP001',
      phone: '0712345678',
      correlationId: 'corr-mpesa-manual-001',
      project: makeProject(),
      baseUrl: 'https://api.afiax.africa',
    });

    expect(result.status).toBe('confirmed');
    expect(result.method).toBe('mpesa-manual');
    expect(result.erpNextPaymentEntry).toBe('ACC-PAY-MPESA-MANUAL-001');
  });
});

describe('handlePostPatientPayment — mpesa-stk', () => {
  afterEach(() => jest.clearAllMocks());

  test('initiates STK push and returns pending with checkoutRequestId', async () => {
    // M-Pesa OAuth token
    mockOkResponse({ access_token: 'test-mpesa-token' });
    // STK push response
    mockOkResponse({
      CheckoutRequestID: 'ws_CO_18062026_001',
      MerchantRequestID: 'MR-001',
      ResponseCode: '0',
      ResponseDescription: 'Success. Request accepted for processing',
      CustomerMessage: 'Success. Request accepted for processing',
    });

    const repo = makeRepo();
    const result = await handlePostPatientPayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      method: 'mpesa-stk',
      amount: 2000,
      currency: 'KES',
      phone: '0712345678',
      correlationId: 'corr-stk-001',
      project: makeProject(),
      baseUrl: 'https://api.afiax.africa',
    });

    expect(result.status).toBe('pending');
    expect(result.method).toBe('mpesa-stk');
    expect(result.checkoutRequestId).toBe('ws_CO_18062026_001');
    expect(result.customerMessage).toBe('Success. Request accepted for processing');

    // PaymentNotice created with identifier for callback lookup
    const notices = repo.created['PaymentNotice'] as PaymentNotice[];
    expect(notices).toHaveLength(1);
    const gatewayIdentifier = notices[0].identifier?.find(
      (i) => i.system === 'https://afiax.africa/kenya/identifier/mpesa-checkout-request'
    );
    expect(gatewayIdentifier?.value).toBe('ws_CO_18062026_001');

    const snap = getKenyaPatientPaymentSnapshot(notices[0]);
    expect(snap?.paymentStatus).toBe('pending');
    expect(snap?.gatewayReference).toBe('ws_CO_18062026_001');
  });

  test('returns error when phone is missing', async () => {
    const repo = makeRepo();
    const result = await handlePostPatientPayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      method: 'mpesa-stk',
      amount: 2000,
      currency: 'KES',
      correlationId: 'corr-stk-002',
      project: makeProject(),
      baseUrl: 'https://api.afiax.africa',
    });
    expect(result.status).toBe('error');
    expect(result.message).toContain('phone is required');
  });

  test('returns error when M-Pesa credentials are not configured', async () => {
    const repo = makeRepo();
    const result = await handlePostPatientPayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      method: 'mpesa-stk',
      amount: 2000,
      currency: 'KES',
      phone: '0712345678',
      correlationId: 'corr-stk-003',
      project: makeProject(false), // no secrets
      baseUrl: 'https://api.afiax.africa',
    });
    expect(result.status).toBe('error');
    expect(result.message).toContain('M-Pesa credentials');
  });
});

describe('handlePostPatientPayment — afiax-pay', () => {
  afterEach(() => jest.clearAllMocks());

  test('initiates Afiax Pay request and returns pending with paymentUrl', async () => {
    mockOkResponse({
      payment_request_id: 'AP-2026-001',
      payment_url: 'https://pay.afiax.africa/checkout/AP-2026-001',
      status: 'pending',
    });

    const repo = makeRepo();
    const result = await handlePostPatientPayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      method: 'afiax-pay',
      amount: 2000,
      currency: 'KES',
      phone: '0712345678',
      correlationId: 'corr-pay-001',
      project: makeProject(),
      baseUrl: 'https://api.afiax.africa',
    });

    expect(result.status).toBe('pending');
    expect(result.method).toBe('afiax-pay');
    expect(result.paymentRequestId).toBe('AP-2026-001');
    expect(result.paymentUrl).toBe('https://pay.afiax.africa/checkout/AP-2026-001');

    // PaymentNotice with Afiax Pay identifier
    const notices = repo.created['PaymentNotice'] as PaymentNotice[];
    expect(notices).toHaveLength(1);
    const gatewayIdentifier = notices[0].identifier?.find(
      (i) => i.system === 'https://afiax.africa/kenya/identifier/afiax-pay-request'
    );
    expect(gatewayIdentifier?.value).toBe('AP-2026-001');
  });

  test('returns error when Afiax Pay credentials are not configured', async () => {
    const projectNoAfiaxPay: Project & { id: string } = {
      resourceType: 'Project',
      id: 'project-test',
      setting: [],
      systemSecret: [],
    };
    const repo = makeRepo();
    const result = await handlePostPatientPayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      method: 'afiax-pay',
      amount: 2000,
      currency: 'KES',
      correlationId: 'corr-pay-002',
      project: projectNoAfiaxPay,
      baseUrl: 'https://api.afiax.africa',
    });
    expect(result.status).toBe('error');
    expect(result.message).toContain('Afiax Pay credentials');
  });
});
