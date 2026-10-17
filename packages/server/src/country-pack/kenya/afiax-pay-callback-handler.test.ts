// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { jest } from '@jest/globals';
import type { KenyaErpNextSubmissionSnapshot } from '@medplum/core';
import {
  buildKenyaErpNextSubmissionExtension,
  buildKenyaPatientPaymentExtension,
  getKenyaPatientPaymentSnapshot,
} from '@medplum/core';
import type { Bundle, Claim, PaymentNotice, Project } from '@medplum/fhirtypes';
import type { Response as NodeFetchResponse } from 'node-fetch';
import fetch from 'node-fetch';
import { handleKenyaAfiaxPayCallback } from './afiax-pay-callback-handler';
import { AfiaxPayRequestSystem } from './post-patient-payment';

jest.mock('node-fetch');
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

jest.mock('../../fhir/repo', () => ({
  getGlobalSystemRepo: jest.fn(),
  getProjectSystemRepo: jest.fn(),
  SystemRepository: function SystemRepository() {
    // Mocked class stand-in
  },
}));

jest.mock('../../config/loader', () => ({
  getConfig: () => ({ baseUrl: 'https://api.afiax.africa/' }),
}));

import { getGlobalSystemRepo, getProjectSystemRepo } from '../../fhir/repo';
const mockGetGlobalRepo = getGlobalSystemRepo as jest.MockedFunction<typeof getGlobalSystemRepo>;
const mockGetProjectRepo = getProjectSystemRepo as jest.MockedFunction<typeof getProjectSystemRepo>;

// ---------------------------------------------------------------------------

function makeProject(erpEnabled = true): Project {
  return {
    resourceType: 'Project',
    id: 'project-test',
    setting: [{ name: 'erpnextEnabled', valueBoolean: erpEnabled }],
    systemSecret: [
      { name: 'afiaxPayBaseUrl', valueString: 'https://pay.afiax.africa' },
      { name: 'afiaxPayApiKey', valueString: 'pay-key' },
      { name: 'afiaxPaySecretKey', valueString: 'pay-secret' },
      ...(erpEnabled
        ? [
            { name: 'erpnextBaseUrl', valueString: 'https://erp.afiax.africa' },
            { name: 'erpnextApiKey', valueString: 'key' },
            { name: 'erpnextApiSecret', valueString: 'secret' },
            { name: 'erpnextCompany', valueString: 'Afiax Healthcare Ltd' },
          ]
        : []),
    ],
  };
}

/**
 * Queues the Afiax Pay payment-request lookup the handler uses to verify a callback.
 * @param state - The payment request body Afiax Pay returns.
 */
function mockAfiaxPayLookup(state: Record<string, unknown>): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(state),
  } as unknown as NodeFetchResponse);
}

function makeNotice(
  paymentRequestId: string,
  claimRef = 'Claim/claim-001',
  paymentStatus: 'pending' | 'confirmed' | 'failed' = 'pending'
): PaymentNotice {
  const ext = buildKenyaPatientPaymentExtension({
    method: 'afiax-pay',
    paymentStatus,
    amount: 1500,
    currency: 'KES',
    gatewayReference: paymentRequestId,
  });
  return {
    resourceType: 'PaymentNotice',
    id: 'notice-afiax-001',
    status: 'active',
    request: { reference: claimRef },
    created: '2026-06-18T11:00:00.000Z',
    amount: { value: 1500, currency: 'KES' },
    payment: { display: 'Patient afiax-pay payment' },
    recipient: { display: 'Afiax Healthcare' },
    extension: [ext],
    identifier: [{ system: AfiaxPayRequestSystem, value: paymentRequestId }],
  };
}

function makeClaimWithInvoice(): Claim {
  const snapshot: KenyaErpNextSubmissionSnapshot = {
    invoiceName: 'ACC-SINV-2026-00020',
    invoiceTotal: 1500,
    currency: 'KES',
    status: 'invoice-created',
    totalConfirmed: 0,
    patientDue: 1500,
  };
  return {
    resourceType: 'Claim',
    id: 'claim-001',
    status: 'active',
    use: 'claim',
    type: { coding: [{ code: 'professional' }] },
    patient: { reference: 'Patient/patient-001' },
    created: '2026-06-18',
    insurer: { reference: 'Organization/sha-001' },
    provider: { reference: 'Organization/facility-001' },
    priority: { coding: [{ code: 'normal' }] },
    insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/cov-001' } }],
    total: { value: 1500, currency: 'KES' },
    extension: [buildKenyaErpNextSubmissionExtension(snapshot)],
  };
}

function makeProjectRepo(project: Project, notice: PaymentNotice | null, claim: Claim | null): any {
  return {
    readResource: jest.fn(async (type: string) => {
      if (type === 'Claim') {
        return claim;
      }
      throw new Error(`Unexpected: ${type}`);
    }),
    readReference: jest.fn(async (ref: { reference?: string }) => {
      if (ref.reference?.startsWith('Patient/')) {
        return { resourceType: 'Patient', id: 'patient-001', name: [{ given: ['Jane'], family: 'Mwangi' }] };
      }
      throw new Error(`Unexpected readReference: ${ref.reference}`);
    }),
    updateResource: jest.fn(async (r: object) => r),
    search: jest.fn(async (req: { resourceType: string }): Promise<Bundle> => {
      if (req.resourceType === 'PaymentNotice') {
        return { resourceType: 'Bundle', type: 'searchset', entry: notice ? [{ resource: notice }] : [] };
      }
      if (req.resourceType === 'Task') {
        return { resourceType: 'Bundle', type: 'searchset', entry: [] };
      }
      return { resourceType: 'Bundle', type: 'searchset', entry: [] };
    }),
  } as any;
}

function makeGlobalRepo(project: Project): any {
  return { readResource: jest.fn(async () => project) } as any;
}

// ---------------------------------------------------------------------------

describe('handleKenyaAfiaxPayCallback', () => {
  afterEach(() => jest.clearAllMocks());

  test('confirms payment, creates ERPNext entry, updates PaymentNotice', async () => {
    const project = makeProject();
    const notice = makeNotice('AP-2026-100');
    const claim = makeClaimWithInvoice();
    const projectRepo = makeProjectRepo(project, notice, claim);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    mockAfiaxPayLookup({
      payment_request_id: 'AP-2026-100',
      status: 'success',
      amount: 1500,
      currency: 'KES',
      transaction_ref: 'AFPAY-TXN-ABC',
      paid_at: '2026-06-18T11:05:00.000Z',
    });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ data: { name: 'ACC-PAY-AFPAY-001' } }),
    } as unknown as NodeFetchResponse);

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-100',
      status: 'success',
      amount: 1500,
      currency: 'KES',
      transaction_ref: 'AFPAY-TXN-ABC',
      paid_at: '2026-06-18T11:05:00.000Z',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('confirmed');
    expect(result.paymentRequestId).toBe('AP-2026-100');
    expect(result.message).toContain('AFPAY-TXN-ABC');

    // PaymentNotice updated with confirmed status
    const noticeUpdate = projectRepo.updateResource.mock.calls.find(
      (args: unknown[]) => (args[0] as { resourceType: string }).resourceType === 'PaymentNotice'
    );
    expect(noticeUpdate).toBeDefined();
    const snap = getKenyaPatientPaymentSnapshot(noticeUpdate?.[0] as PaymentNotice);
    expect(snap?.paymentStatus).toBe('confirmed');
    expect(snap?.transactionRef).toBe('AFPAY-TXN-ABC');
  });

  test('marks PaymentNotice as failed for status: failed', async () => {
    const project = makeProject(false);
    const notice = makeNotice('AP-2026-200');
    const projectRepo = makeProjectRepo(project, notice, null);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    mockAfiaxPayLookup({ payment_request_id: 'AP-2026-200', status: 'failed', failure_reason: 'Insufficient funds' });

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-200',
      status: 'failed',
      failure_reason: 'Insufficient funds',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('failed');
    // Only the Afiax Pay lookup — no ERPNext calls
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const noticeUpdate = projectRepo.updateResource.mock.calls.find(
      (args: unknown[]) => (args[0] as { resourceType: string }).resourceType === 'PaymentNotice'
    );
    const snap = getKenyaPatientPaymentSnapshot(noticeUpdate?.[0] as PaymentNotice);
    expect(snap?.paymentStatus).toBe('failed');
    expect(snap?.failureReason).toBe('Insufficient funds');
  });

  test('marks cancelled as failed with status: cancelled', async () => {
    const project = makeProject(false);
    const notice = makeNotice('AP-2026-300');
    const projectRepo = makeProjectRepo(project, notice, null);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    mockAfiaxPayLookup({ payment_request_id: 'AP-2026-300', status: 'cancelled' });

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-300',
      status: 'cancelled',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('cancelled');
  });

  test('rejects a forged success callback when Afiax Pay reports the payment failed', async () => {
    const project = makeProject();
    const notice = makeNotice('AP-2026-FORGED');
    const projectRepo = makeProjectRepo(project, notice, makeClaimWithInvoice());

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);
    mockAfiaxPayLookup({ payment_request_id: 'AP-2026-FORGED', status: 'failed', failure_reason: 'Declined' });

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-FORGED',
      status: 'success',
      amount: 1500,
      transaction_ref: 'FAKE',
    });

    expect(result.status).toBe('failed');
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const noticeUpdate = projectRepo.updateResource.mock.calls.find(
      (args: unknown[]) => (args[0] as { resourceType: string }).resourceType === 'PaymentNotice'
    );
    expect(getKenyaPatientPaymentSnapshot(noticeUpdate?.[0] as PaymentNotice)?.paymentStatus).toBe('failed');
  });

  test('makes no changes while Afiax Pay reports the payment as pending', async () => {
    const project = makeProject();
    const notice = makeNotice('AP-2026-PENDING');
    const projectRepo = makeProjectRepo(project, notice, makeClaimWithInvoice());

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);
    mockAfiaxPayLookup({ payment_request_id: 'AP-2026-PENDING', status: 'pending' });

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-PENDING',
      status: 'success',
    });

    expect(result.status).toBe('ignored');
    expect(projectRepo.updateResource).not.toHaveBeenCalled();
  });

  test('makes no changes when the Afiax Pay lookup fails', async () => {
    const project = makeProject();
    const notice = makeNotice('AP-2026-UNVERIFIED');
    const projectRepo = makeProjectRepo(project, notice, makeClaimWithInvoice());

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not found',
    } as unknown as NodeFetchResponse);

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-UNVERIFIED',
      status: 'success',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(projectRepo.updateResource).not.toHaveBeenCalled();
  });

  test('ignores replayed callbacks for an already-confirmed payment', async () => {
    const project = makeProject();
    const notice = makeNotice('AP-2026-DONE', 'Claim/claim-001', 'confirmed');
    const projectRepo = makeProjectRepo(project, notice, makeClaimWithInvoice());

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-DONE',
      status: 'success',
    });

    expect(result.status).toBe('ignored');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(projectRepo.updateResource).not.toHaveBeenCalled();
  });

  test('records the amount reported by Afiax Pay, not the callback body', async () => {
    const project = makeProject(false);
    const notice = makeNotice('AP-2026-AMOUNT');
    const projectRepo = makeProjectRepo(project, notice, null);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);
    mockAfiaxPayLookup({ payment_request_id: 'AP-2026-AMOUNT', status: 'success', amount: 1500, currency: 'KES' });

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-AMOUNT',
      status: 'success',
      amount: 999999,
    });

    expect(result.status).toBe('confirmed');
    const noticeUpdate = projectRepo.updateResource.mock.calls.find(
      (args: unknown[]) => (args[0] as { resourceType: string }).resourceType === 'PaymentNotice'
    );
    expect(getKenyaPatientPaymentSnapshot(noticeUpdate?.[0] as PaymentNotice)?.amount).toBe(1500);
  });

  test('returns ignored when no PaymentNotice matches the paymentRequestId', async () => {
    const project = makeProject(false);
    const projectRepo = makeProjectRepo(project, null, null);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-UNKNOWN',
      status: 'success',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ignored');
  });

  test('returns ignored for unparseable callback body', async () => {
    const project = makeProject(false);
    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(makeProjectRepo(project, null, null));

    const result = await handleKenyaAfiaxPayCallback('project-test', { no_payment_request_id: true });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ignored');
  });

  test('returns error when project is not found', async () => {
    mockGetGlobalRepo.mockReturnValue({
      readResource: jest.fn(async () => {
        throw new Error('Not found');
      }),
    } as any);

    const result = await handleKenyaAfiaxPayCallback('bad-project', {
      payment_request_id: 'AP-2026-ERR',
      status: 'success',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
  });
});
