// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AuditEvent, Claim, ClaimResponse, Coverage, Organization, Task } from '@medplum/fhirtypes';
import { handleCapturePreauthorization } from './capture-preauthorization';

jest.mock('../../util/auditevent', () => ({
  createAuditEvent: jest.fn(() => ({ resourceType: 'AuditEvent', entity: [] })),
  logAuditEvent: jest.fn(),
  AuditEventOutcome: { Success: '0', MinorFailure: '4', MajorFailure: '8' },
  OperationInteraction: { code: 'operation' },
  RestfulOperationType: { code: 'rest' },
}));

// ---------------------------------------------------------------------------
// Mock helpers
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
    profile: { reference: 'Practitioner/practitioner-test' },
    systemRepo: repo,
  } as any;
}

const coverage: Coverage & { id: string } = {
  resourceType: 'Coverage',
  id: 'coverage-001',
  status: 'active',
  beneficiary: { reference: 'Patient/patient-001' },
  payor: [{ reference: 'Organization/cic-001' }],
};

const insurer: Organization & { id: string } = {
  resourceType: 'Organization',
  id: 'cic-001',
  name: 'CIC Insurance Group',
};

// ---------------------------------------------------------------------------

describe('handleCapturePreauthorization', () => {
  test('happy path: creates Claim, ClaimResponse, updates Coverage, creates Task and AuditEvent', async () => {
    const repo = makeRepo();
    const result = await handleCapturePreauthorization({
      ctx: makeCtx(repo),
      coverage,
      insurerOrganization: insurer,
      preauthorizationCode: 'PA-2026-001234',
      approvedAmount: 25000,
      currency: 'KES',
      validFrom: '2026-06-18',
      validTo: '2026-07-18',
      approvedProcedures: 'Knee arthroscopy',
      notes: 'Approved for outpatient procedure',
      correlationId: 'corr-001',
    });

    expect(result.status).toBe('captured');
    expect(result.preauthorizationCode).toBe('PA-2026-001234');
    expect(result.approvedAmount).toBe(25000);
    expect(result.insurerName).toBe('CIC Insurance Group');
    expect(result.validFrom).toBe('2026-06-18');
    expect(result.validTo).toBe('2026-07-18');
    expect(result.message).toContain('PA-2026-001234');
    expect(result.claimReference?.reference).toMatch(/^Claim\//);
    expect(result.claimResponseReference?.reference).toMatch(/^ClaimResponse\//);
    expect(result.task?.reference).toMatch(/^Task\//);

    // Claim created with use: preauthorization
    const claims = repo.created['Claim'] as Claim[];
    expect(claims).toHaveLength(1);
    expect(claims[0].use).toBe('preauthorization');
    expect(claims[0].total?.value).toBe(25000);
    expect(claims[0].identifier?.[0]?.value).toBe('PA-2026-001234');

    // ClaimResponse created with use: preauthorization
    const responses = repo.created['ClaimResponse'] as ClaimResponse[];
    expect(responses).toHaveLength(1);
    expect(responses[0].use).toBe('preauthorization');
    expect(responses[0].outcome).toBe('complete');
    expect(responses[0].preAuthRef).toBe('PA-2026-001234');
    expect(responses[0].payment?.amount?.value).toBe(25000);

    // Coverage updated with the preauth extension
    expect(repo.updated).toHaveLength(1);
    const updatedCoverage = repo.updated[0] as Coverage;
    const ext = updatedCoverage.extension?.find(
      (e) => e.url === 'https://afiax.africa/fhir/StructureDefinition/kenya-private-insurance-preauthorization'
    );
    expect(ext).toBeDefined();
    const codeChild = ext?.extension?.find((e) => e.url === 'preauthorizationCode');
    expect(codeChild?.valueString).toBe('PA-2026-001234');

    // Task created
    const tasks = repo.created['Task'] as Task[];
    expect(tasks).toHaveLength(1);
    expect(tasks[0].status).toBe('completed');
    expect(tasks[0].businessStatus?.text).toBe('captured');

    // AuditEvent created
    const audits = repo.created['AuditEvent'] as AuditEvent[];
    expect(audits).toHaveLength(1);
  });

  test('uses organization id as insurer name when organization has no name', async () => {
    const repo = makeRepo();
    const unnamed: Organization & { id: string } = { resourceType: 'Organization', id: 'insurer-no-name' };
    const result = await handleCapturePreauthorization({
      ctx: makeCtx(repo),
      coverage,
      insurerOrganization: unnamed,
      preauthorizationCode: 'PA-UNNAMED-001',
      approvedAmount: 5000,
      currency: 'KES',
      correlationId: 'corr-002',
    });
    expect(result.insurerName).toBe('Organization/insurer-no-name');
  });

  test('returns status: error and creates AuditEvent when createResource throws', async () => {
    const repo = makeRepo();
    let call = 0;
    repo.createResource.mockImplementation(async (resource: { resourceType: string }) => {
      call++;
      if (call === 1) {
        throw new Error('DB write failed');
      }
      const r = { ...resource, id: `${resource.resourceType}-err` };
      (repo.created[resource.resourceType] ??= []).push(r);
      return r;
    });

    const result = await handleCapturePreauthorization({
      ctx: makeCtx(repo),
      coverage,
      insurerOrganization: insurer,
      preauthorizationCode: 'PA-ERR-001',
      approvedAmount: 1000,
      currency: 'KES',
      correlationId: 'corr-003',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('DB write failed');
    // AuditEvent for failure is still written
    const audits = repo.created['AuditEvent'] as AuditEvent[];
    expect(audits?.length).toBeGreaterThanOrEqual(1);
  });

  test('preserves existing coverage extensions when adding preauth extension', async () => {
    const repo = makeRepo();
    const covWithExt: Coverage & { id: string } = {
      ...coverage,
      extension: [{ url: 'https://example.org/other-ext', valueString: 'keep-me' }],
    };
    await handleCapturePreauthorization({
      ctx: makeCtx(repo),
      coverage: covWithExt,
      insurerOrganization: insurer,
      preauthorizationCode: 'PA-EXT-001',
      approvedAmount: 10000,
      currency: 'KES',
      correlationId: 'corr-004',
    });
    const updatedCoverage = repo.updated[0] as Coverage;
    const otherExt = updatedCoverage.extension?.find((e) => e.url === 'https://example.org/other-ext');
    expect(otherExt?.valueString).toBe('keep-me');
  });
});
