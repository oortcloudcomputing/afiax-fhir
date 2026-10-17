// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { jest } from '@jest/globals';
import type { KenyaErpNextSubmissionSnapshot } from '@medplum/core';
import { buildKenyaErpNextSubmissionExtension } from '@medplum/core';
import type { Claim, ClaimResponse, Organization, Project, Task } from '@medplum/fhirtypes';
import type { Response as NodeFetchResponse } from 'node-fetch';
import fetch from 'node-fetch';
import { handleRecordInsurancePayment } from './record-insurance-payment';

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

function makeRepo(): any {
  const created: Record<string, object[]> = {};
  const updated: object[] = [];
  let idSeq = 0;

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
    systemSecret: [
      { name: 'erpnextBaseUrl', valueString: 'https://erp.afiax.africa' },
      { name: 'erpnextApiKey', valueString: 'key' },
      { name: 'erpnextApiSecret', valueString: 'secret' },
      { name: 'erpnextCompany', valueString: 'Afiax Healthcare Ltd' },
    ],
  };
}

function makeClaimWithInvoice(): Claim & { id: string } {
  const snapshot: KenyaErpNextSubmissionSnapshot = {
    invoiceName: 'ACC-SINV-2026-00001',
    invoiceTotal: 5000,
    currency: 'KES',
    status: 'invoice-created',
    totalConfirmed: 0,
    patientDue: 5000,
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
    insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/coverage-001' } }],
    total: { value: 5000, currency: 'KES' },
    extension: [buildKenyaErpNextSubmissionExtension(snapshot)],
  };
}

const jubileeInsurer: Organization & { id: string } = {
  resourceType: 'Organization',
  id: 'jubilee-001',
  name: 'Jubilee Health Insurance',
  identifier: [
    {
      system: 'https://afiax.africa/kenya/identifier/insurance-type',
      value: 'jubilee',
    },
  ],
};

// ---------------------------------------------------------------------------

describe('handleRecordInsurancePayment', () => {
  afterEach(() => jest.clearAllMocks());

  test('creates ClaimResponse and ERPNext payment entry when credentials are configured', async () => {
    mockOkResponse({ data: { name: 'ACC-PAY-2026-00001' } });

    const repo = makeRepo();
    const result = await handleRecordInsurancePayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      insurerOrganization: jubileeInsurer,
      approvalCode: 'JUB-APPR-9876',
      approvedAmount: 4000,
      currency: 'KES',
      notes: 'Approved minus copay',
      correlationId: 'corr-001',
      project: makeProject(),
    });

    expect(result.status).toBe('recorded');
    expect(result.approvedAmount).toBe(4000);
    expect(result.insurerName).toBe('Jubilee Health Insurance');
    expect(result.erpNextPaymentEntry).toBe('ACC-PAY-2026-00001');
    expect(result.patientDue).toBe(1000); // 5000 - 4000

    // ClaimResponse created
    const responses = repo.created['ClaimResponse'] as ClaimResponse[];
    expect(responses).toHaveLength(1);
    expect(responses[0].preAuthRef).toBe('JUB-APPR-9876');
    expect(responses[0].payment?.amount?.value).toBe(4000);

    // Claim updated (ERPNext snapshot)
    expect(repo.updated).toHaveLength(1);

    // Task created
    const tasks = repo.created['Task'] as Task[];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].businessStatus?.text).toBe('recorded');

    // AuditEvent created
    expect(repo.created['AuditEvent']).toHaveLength(1);
  });

  test('returns recorded-erpnext-failed when ERPNext payment entry creation fails', async () => {
    mockErrorResponse(500, 'ERPNext unavailable');

    const repo = makeRepo();
    const result = await handleRecordInsurancePayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      insurerOrganization: jubileeInsurer,
      approvalCode: 'JUB-FAIL-001',
      approvedAmount: 3000,
      currency: 'KES',
      correlationId: 'corr-002',
      project: makeProject(),
    });

    expect(result.status).toBe('recorded-erpnext-failed');
    expect(result.erpNextPaymentEntry).toBeUndefined();
    expect(result.message).toContain('$push-to-erpnext');
    // ClaimResponse still created — FHIR is always authoritative
    expect(repo.created['ClaimResponse']).toHaveLength(1);
  });

  test('records payment with status: recorded when ERPNext is not configured', async () => {
    const repo = makeRepo();
    const result = await handleRecordInsurancePayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      insurerOrganization: jubileeInsurer,
      approvalCode: 'JUB-NO-ERP-001',
      approvedAmount: 5000,
      currency: 'KES',
      correlationId: 'corr-003',
      project: makeProject(false), // ERPNext disabled
    });

    expect(result.status).toBe('recorded');
    expect(mockFetch).not.toHaveBeenCalled();
    // patientDue reflects the existing claim snapshot since no ERPNext recalculation occurred
    expect(result.patientDue).toBe(5000);
  });

  test('returns status: error when ClaimResponse creation fails', async () => {
    const repo = makeRepo();
    repo.createResource.mockRejectedValueOnce(new Error('DB write error'));

    const result = await handleRecordInsurancePayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      insurerOrganization: jubileeInsurer,
      approvalCode: 'ERR-001',
      approvedAmount: 1000,
      currency: 'KES',
      correlationId: 'corr-004',
      project: makeProject(false),
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('DB write error');
    expect(repo.created['AuditEvent']).toHaveLength(1);
  });

  test('uses payer type "other" for insurer without matching KenyaInsuranceType identifier', async () => {
    mockOkResponse({ data: { name: 'ACC-PAY-2026-OTHER' } });

    const repo = makeRepo();
    const genericInsurer: Organization & { id: string } = {
      resourceType: 'Organization',
      id: 'generic-insurer',
      name: 'Generic Insurer Ltd',
    };

    const result = await handleRecordInsurancePayment({
      ctx: makeCtx(repo),
      claim: makeClaimWithInvoice(),
      insurerOrganization: genericInsurer,
      approvalCode: 'GEN-001',
      approvedAmount: 2000,
      currency: 'KES',
      correlationId: 'corr-005',
      project: makeProject(),
    });

    expect(result.status).toBe('recorded');
    expect(result.insurerName).toBe('Generic Insurer Ltd');
  });
});
