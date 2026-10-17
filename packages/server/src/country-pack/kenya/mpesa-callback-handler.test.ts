// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  buildKenyaErpNextSubmissionExtension,
  buildKenyaPatientPaymentExtension,
  getKenyaPatientPaymentSnapshot,
  type KenyaErpNextSubmissionSnapshot,
} from '@medplum/core';
import type { Bundle, Claim, PaymentNotice, Project } from '@medplum/fhirtypes';
import { jest } from '@jest/globals';
import fetch, { type Response as NodeFetchResponse } from 'node-fetch';
import { handleKenyaMpesaCallback } from './mpesa-callback-handler';
import { MpesaCheckoutRequestSystem } from './post-patient-payment';

jest.mock('node-fetch');
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

jest.mock('../../fhir/repo', () => ({
  getGlobalSystemRepo: jest.fn(),
  getProjectSystemRepo: jest.fn(),
  SystemRepository: class {},
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
      { name: 'mpesaConsumerKey', valueString: 'consumer-key' },
      { name: 'mpesaConsumerSecret', valueString: 'consumer-secret' },
      { name: 'mpesaShortCode', valueString: '174379' },
      { name: 'mpesaPasskey', valueString: 'passkey' },
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
 * Queues the Daraja OAuth + STK Push Query responses the handler uses to verify a callback.
 * @param checkoutRequestId - The CheckoutRequestID Daraja reports.
 * @param resultCode - The ResultCode Daraja reports.
 * @param resultDesc - The ResultDesc Daraja reports.
 */
function mockDarajaQuery(checkoutRequestId: string, resultCode: number, resultDesc: string): void {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => ({ access_token: 'daraja-token' }),
  } as unknown as NodeFetchResponse);
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({ ResponseCode: '0', CheckoutRequestID: checkoutRequestId, ResultCode: String(resultCode), ResultDesc: resultDesc }),
  } as unknown as NodeFetchResponse);
}

function makeNotice(
  checkoutRequestId: string,
  claimRef = 'Claim/claim-001',
  paymentStatus: 'pending' | 'confirmed' | 'failed' = 'pending'
): PaymentNotice {
  const ext = buildKenyaPatientPaymentExtension({
    method: 'mpesa-stk',
    paymentStatus,
    amount: 2000,
    currency: 'KES',
    gatewayReference: checkoutRequestId,
    phone: '0712345678',
  });
  return {
    resourceType: 'PaymentNotice',
    id: 'notice-001',
    status: 'active',
    request: { reference: claimRef },
    created: '2026-06-18T10:00:00.000Z',
    amount: { value: 2000, currency: 'KES' },
    payment: { display: 'Patient mpesa-stk payment' },
    recipient: { display: 'Afiax Healthcare' },
    extension: [ext],
    identifier: [
      { system: MpesaCheckoutRequestSystem, value: checkoutRequestId },
    ],
  };
}

function makeClaimWithInvoice(): Claim {
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
    total: { value: 2000, currency: 'KES' },
    extension: [buildKenyaErpNextSubmissionExtension(snapshot)],
  };
}

function makeProjectRepo(project: Project, notice: PaymentNotice | null, claim: Claim | null) {
  return {
    readResource: jest.fn(async (type: string, id: string) => {
      if (type === 'Claim') return claim;
      throw new Error(`Unexpected readResource: ${type}/${id}`);
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
        return {
          resourceType: 'Bundle',
          type: 'searchset',
          entry: notice ? [{ resource: notice }] : [],
        };
      }
      if (req.resourceType === 'Task') {
        return { resourceType: 'Bundle', type: 'searchset', entry: [] };
      }
      return { resourceType: 'Bundle', type: 'searchset', entry: [] };
    }),
  } as any;
}

function makeGlobalRepo(project: Project) {
  return {
    readResource: jest.fn(async () => project),
  } as any;
}

function makeMpesaSuccessCallback(checkoutRequestId: string, receipt = 'MPE001XYZ') {
  return {
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 0,
        ResultDesc: 'The service request is processed successfully.',
        CallbackMetadata: {
          Item: [
            { Name: 'Amount', Value: 2000 },
            { Name: 'MpesaReceiptNumber', Value: receipt },
            { Name: 'PhoneNumber', Value: 254712345678 },
          ],
        },
      },
    },
  };
}

function makeMpesaFailureCallback(checkoutRequestId: string) {
  return {
    Body: {
      stkCallback: {
        CheckoutRequestID: checkoutRequestId,
        ResultCode: 1032,
        ResultDesc: 'Request cancelled by user',
      },
    },
  };
}

// ---------------------------------------------------------------------------

describe('handleKenyaMpesaCallback', () => {
  afterEach(() => jest.clearAllMocks());

  test('confirms payment, creates ERPNext entry, updates PaymentNotice and Claim', async () => {
    const project = makeProject();
    const notice = makeNotice('ws_CO_001');
    const claim = makeClaimWithInvoice();
    const projectRepo = makeProjectRepo(project, notice, claim);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    mockDarajaQuery('ws_CO_001', 0, 'The service request is processed successfully.');
    // ERPNext payment entry
    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
      text: async () => JSON.stringify({ data: { name: 'ACC-PAY-MPESA-001' } }),
    } as unknown as NodeFetchResponse);

    const result = await handleKenyaMpesaCallback('project-test', makeMpesaSuccessCallback('ws_CO_001', 'MPE001XYZ'));

    expect(result.ok).toBe(true);
    expect(result.status).toBe('confirmed');
    expect(result.checkoutRequestId).toBe('ws_CO_001');
    expect(result.message).toContain('MPE001XYZ');

    // PaymentNotice updated
    const updateCalls = projectRepo.updateResource.mock.calls;
    const noticeUpdate = updateCalls.find((args: unknown[]) => {
      const r = args[0] as { resourceType: string };
      return r.resourceType === 'PaymentNotice';
    });
    expect(noticeUpdate).toBeDefined();
    const updatedNotice = noticeUpdate![0] as PaymentNotice;
    const snap = getKenyaPatientPaymentSnapshot(updatedNotice);
    expect(snap?.paymentStatus).toBe('confirmed');
    expect(snap?.transactionRef).toBe('MPE001XYZ');
  });

  test('marks PaymentNotice as failed when M-Pesa resultCode is non-zero', async () => {
    const project = makeProject(false); // ERPNext off — no fetch calls expected
    const notice = makeNotice('ws_CO_002');
    const projectRepo = makeProjectRepo(project, notice, null);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    mockDarajaQuery('ws_CO_002', 1032, 'Request cancelled by user');

    const result = await handleKenyaMpesaCallback('project-test', makeMpesaFailureCallback('ws_CO_002'));

    expect(result.ok).toBe(true);
    expect(result.status).toBe('failed');
    // Only the Daraja OAuth + query calls — no ERPNext calls
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const updateCalls = projectRepo.updateResource.mock.calls;
    const noticeUpdate = updateCalls.find((args: unknown[]) => {
      return (args[0] as { resourceType: string }).resourceType === 'PaymentNotice';
    });
    const updatedNotice = noticeUpdate![0] as PaymentNotice;
    const snap = getKenyaPatientPaymentSnapshot(updatedNotice);
    expect(snap?.paymentStatus).toBe('failed');
    expect(snap?.failureReason).toContain('cancelled');
  });

  test('rejects a forged success callback when Daraja reports the payment failed', async () => {
    const project = makeProject();
    const notice = makeNotice('ws_CO_FORGED');
    const projectRepo = makeProjectRepo(project, notice, makeClaimWithInvoice());

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);
    mockDarajaQuery('ws_CO_FORGED', 1032, 'Request cancelled by user');

    const result = await handleKenyaMpesaCallback('project-test', makeMpesaSuccessCallback('ws_CO_FORGED', 'FAKE123'));

    expect(result.status).toBe('failed');
    // No ERPNext payment entry is created
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const noticeUpdate = projectRepo.updateResource.mock.calls.find(
      (args: unknown[]) => (args[0] as { resourceType: string }).resourceType === 'PaymentNotice'
    );
    expect(getKenyaPatientPaymentSnapshot(noticeUpdate?.[0] as PaymentNotice)?.paymentStatus).toBe('failed');
  });

  test('makes no changes when Daraja verification fails', async () => {
    const project = makeProject();
    const notice = makeNotice('ws_CO_UNVERIFIED');
    const projectRepo = makeProjectRepo(project, notice, makeClaimWithInvoice());

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    } as unknown as NodeFetchResponse);

    const result = await handleKenyaMpesaCallback('project-test', makeMpesaSuccessCallback('ws_CO_UNVERIFIED'));

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(projectRepo.updateResource).not.toHaveBeenCalled();
  });

  test('ignores replayed callbacks for an already-confirmed payment', async () => {
    const project = makeProject();
    const notice = makeNotice('ws_CO_DONE', 'Claim/claim-001', 'confirmed');
    const projectRepo = makeProjectRepo(project, notice, makeClaimWithInvoice());

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    const result = await handleKenyaMpesaCallback('project-test', makeMpesaSuccessCallback('ws_CO_DONE'));

    expect(result.status).toBe('ignored');
    expect(mockFetch).not.toHaveBeenCalled();
    expect(projectRepo.updateResource).not.toHaveBeenCalled();
  });

  test('records the requested amount, not the amount in the callback body', async () => {
    const project = makeProject(false);
    const notice = makeNotice('ws_CO_AMOUNT');
    const projectRepo = makeProjectRepo(project, notice, null);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);
    mockDarajaQuery('ws_CO_AMOUNT', 0, 'The service request is processed successfully.');

    const callback = makeMpesaSuccessCallback('ws_CO_AMOUNT');
    callback.Body.stkCallback.CallbackMetadata.Item[0].Value = 999999;

    const result = await handleKenyaMpesaCallback('project-test', callback);

    expect(result.status).toBe('confirmed');
    const noticeUpdate = projectRepo.updateResource.mock.calls.find(
      (args: unknown[]) => (args[0] as { resourceType: string }).resourceType === 'PaymentNotice'
    );
    expect(getKenyaPatientPaymentSnapshot(noticeUpdate?.[0] as PaymentNotice)?.amount).toBe(2000);
  });

  test('returns ignored when no PaymentNotice matches the checkoutRequestId', async () => {
    const project = makeProject(false);
    const projectRepo = makeProjectRepo(project, null, null);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    const result = await handleKenyaMpesaCallback('project-test', makeMpesaSuccessCallback('ws_UNKNOWN_001'));

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ignored');
  });

  test('returns ignored for unparseable callback body', async () => {
    const project = makeProject(false);
    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(makeProjectRepo(project, null, null));

    const result = await handleKenyaMpesaCallback('project-test', { garbage: true });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ignored');
  });

  test('returns error when project is not found', async () => {
    mockGetGlobalRepo.mockReturnValue({
      readResource: jest.fn(async () => { throw new Error('Not found'); }),
    } as any);

    const result = await handleKenyaMpesaCallback('bad-project-id', makeMpesaSuccessCallback('ws_CO_003'));

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
  });
});
