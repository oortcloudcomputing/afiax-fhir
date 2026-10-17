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

import { getGlobalSystemRepo, getProjectSystemRepo } from '../../fhir/repo';
const mockGetGlobalRepo = getGlobalSystemRepo as jest.MockedFunction<typeof getGlobalSystemRepo>;
const mockGetProjectRepo = getProjectSystemRepo as jest.MockedFunction<typeof getProjectSystemRepo>;

// ---------------------------------------------------------------------------

function makeProject(erpEnabled = true): Project {
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
        ]
      : [],
  };
}

function makeNotice(checkoutRequestId: string, claimRef = 'Claim/claim-001'): PaymentNotice {
  const ext = buildKenyaPatientPaymentExtension({
    method: 'mpesa-stk',
    paymentStatus: 'pending',
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

    const result = await handleKenyaMpesaCallback('project-test', makeMpesaFailureCallback('ws_CO_002'));

    expect(result.ok).toBe(true);
    expect(result.status).toBe('failed');
    expect(mockFetch).not.toHaveBeenCalled();

    const updateCalls = projectRepo.updateResource.mock.calls;
    const noticeUpdate = updateCalls.find((args: unknown[]) => {
      return (args[0] as { resourceType: string }).resourceType === 'PaymentNotice';
    });
    const updatedNotice = noticeUpdate![0] as PaymentNotice;
    const snap = getKenyaPatientPaymentSnapshot(updatedNotice);
    expect(snap?.paymentStatus).toBe('failed');
    expect(snap?.failureReason).toContain('cancelled');
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
