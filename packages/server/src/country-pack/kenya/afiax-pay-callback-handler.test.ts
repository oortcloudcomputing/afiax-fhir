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
import { handleKenyaAfiaxPayCallback } from './afiax-pay-callback-handler';
import { AfiaxPayRequestSystem } from './post-patient-payment';

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

function makeNotice(paymentRequestId: string, claimRef = 'Claim/claim-001'): PaymentNotice {
  const ext = buildKenyaPatientPaymentExtension({
    method: 'afiax-pay',
    paymentStatus: 'pending',
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

function makeProjectRepo(project: Project, notice: PaymentNotice | null, claim: Claim | null) {
  return {
    readResource: jest.fn(async (type: string) => {
      if (type === 'Claim') return claim;
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

function makeGlobalRepo(project: Project) {
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

    mockFetch.mockResolvedValueOnce({
      ok: true, status: 200,
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
    const snap = getKenyaPatientPaymentSnapshot(noticeUpdate![0] as PaymentNotice);
    expect(snap?.paymentStatus).toBe('confirmed');
    expect(snap?.transactionRef).toBe('AFPAY-TXN-ABC');
  });

  test('marks PaymentNotice as failed for status: failed', async () => {
    const project = makeProject(false);
    const notice = makeNotice('AP-2026-200');
    const projectRepo = makeProjectRepo(project, notice, null);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-200',
      status: 'failed',
      failure_reason: 'Insufficient funds',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('failed');
    expect(mockFetch).not.toHaveBeenCalled();

    const noticeUpdate = projectRepo.updateResource.mock.calls.find(
      (args: unknown[]) => (args[0] as { resourceType: string }).resourceType === 'PaymentNotice'
    );
    const snap = getKenyaPatientPaymentSnapshot(noticeUpdate![0] as PaymentNotice);
    expect(snap?.paymentStatus).toBe('failed');
    expect(snap?.failureReason).toBe('Insufficient funds');
  });

  test('marks cancelled as failed with status: cancelled', async () => {
    const project = makeProject(false);
    const notice = makeNotice('AP-2026-300');
    const projectRepo = makeProjectRepo(project, notice, null);

    mockGetGlobalRepo.mockReturnValue(makeGlobalRepo(project));
    mockGetProjectRepo.mockReturnValue(projectRepo);

    const result = await handleKenyaAfiaxPayCallback('project-test', {
      payment_request_id: 'AP-2026-300',
      status: 'cancelled',
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('cancelled');
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
      readResource: jest.fn(async () => { throw new Error('Not found'); }),
    } as any);

    const result = await handleKenyaAfiaxPayCallback('bad-project', {
      payment_request_id: 'AP-2026-ERR',
      status: 'success',
    });

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
  });
});
