// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Patient, Project } from '@medplum/fhirtypes';
import { handlePublishNationalRecord } from './publish-national-record';

jest.mock('../../util/auditevent', () => ({
  ...jest.requireActual('../../util/auditevent'),
  createAuditEvent: jest.fn(() => ({ resourceType: 'AuditEvent', entity: [] })),
  AuditEventOutcome: { Success: '0', MajorFailure: '12' },
  RestfulOperationType: { code: 'rest', system: 'http://terminology.hl7.org/CodeSystem/audit-event-type' },
  OperationInteraction: { code: 'operation', system: 'http://hl7.org/fhir/restful-interaction' },
}));

jest.mock('./afyalink', () => ({
  ...jest.requireActual('./afyalink'),
  getKenyaAfyaLinkCredentials: jest.fn(() => ({
    baseUrl: 'https://uat.dha.go.ke',
    consumerKey: 'test-key',
    username: 'test-user',
    password: 'test-pass',
  })),
  publishToAfyaLinkShr: jest.fn(),
}));

import { getKenyaAfyaLinkCredentials, publishToAfyaLinkShr } from './afyalink';

const mockPatient: Patient & { id: string } = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ family: 'Otieno', given: ['Kevin'] }],
};

const mockProject: Project = {
  resourceType: 'Project',
  id: 'project-1',
  name: 'Test Clinic',
  setting: [{ name: 'countryPack', valueString: 'kenya' }],
};

function buildCtx(overrides?: Partial<{ createResource: jest.Mock; updateResource: jest.Mock; readResource: jest.Mock; search: jest.Mock }>): any {
  return {
    project: mockProject,
    profile: { reference: 'Practitioner/prac-1' },
    logger: { warn: jest.fn() },
    repo: {
      search: overrides?.search ?? jest.fn(async () => ({ resourceType: 'Bundle', entry: [] })),
    },
    systemRepo: {
      createResource: overrides?.createResource ?? jest.fn(async (r: any) => ({ ...r, id: 'res-1' })),
      updateResource: overrides?.updateResource ?? jest.fn(async (r: any) => r),
      readResource: overrides?.readResource ?? jest.fn(async () => mockProject),
    },
  };
}

describe('handlePublishNationalRecord', () => {
  beforeEach(() => {
    (publishToAfyaLinkShr as jest.Mock).mockReset();
  });

  test('publishes patient bundle and returns publication ID', async () => {
    (publishToAfyaLinkShr as jest.Mock).mockResolvedValue({
      message: { record_id: 'SHR-ABC123', status: 'received', timestamp: '2026-06-15T10:00:00Z' },
    });

    const updateResource = jest.fn(async (r: any) => r);
    const createResource = jest.fn(async (r: any) => ({ ...r, id: 'res-1' }));
    const ctx = buildCtx({ updateResource, createResource });

    const result = await handlePublishNationalRecord({
      ctx,
      patient: mockPatient,
      correlationId: 'corr-1',
    });

    expect(result.status).toBe('published');
    expect(result.publicationId).toBe('SHR-ABC123');
    expect(result.bundleEntryCount).toBe(1); // Patient only (no extra resources requested)
    expect(result.endpoint).toContain('/v1/shr/patient-record');
    expect(result.task?.reference).toMatch(/^Task\//);

    // SHR endpoint called with a Bundle
    const shrCall = (publishToAfyaLinkShr as jest.Mock).mock.calls[0];
    expect(shrCall[1]).toMatchObject({ resourceType: 'Bundle', type: 'document' });
    expect(shrCall[1].entry).toHaveLength(1);
    expect(shrCall[1].entry[0].resource.resourceType).toBe('Patient');

    // Extension written to Patient
    const extUpdate = updateResource.mock.calls.find(
      (c) => c[0].extension?.some((e: any) => e.url === 'https://afiax.africa/fhir/StructureDefinition/kenya-national-record-publication')
    );
    expect(extUpdate).toBeDefined();
  });

  test('includes active conditions when requested', async () => {
    (publishToAfyaLinkShr as jest.Mock).mockResolvedValue({ message: { record_id: 'SHR-B2', status: 'received' } });

    const mockCondition = { resourceType: 'Condition', id: 'cond-1', subject: { reference: 'Patient/patient-1' } };
    const search = jest.fn(async () => ({
      resourceType: 'Bundle',
      entry: [{ resource: mockCondition }],
    }));

    const ctx = buildCtx({ search });

    const result = await handlePublishNationalRecord({
      ctx,
      patient: mockPatient,
      correlationId: 'corr-2',
      includeActiveConditions: true,
    });

    expect(result.status).toBe('published');
    expect(result.bundleEntryCount).toBe(2); // Patient + Condition

    const shrCall = (publishToAfyaLinkShr as jest.Mock).mock.calls[0];
    expect(shrCall[1].entry).toHaveLength(2);
    expect(shrCall[1].entry.some((e: any) => e.resource?.resourceType === 'Condition')).toBe(true);
  });

  test('returns error when credentials unavailable', async () => {
    (getKenyaAfyaLinkCredentials as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Missing SHR credentials');
    });

    const ctx = buildCtx();
    const result = await handlePublishNationalRecord({
      ctx,
      patient: mockPatient,
      correlationId: 'corr-3',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('Missing SHR credentials');
    expect(result.publicationId).toBeNull();
  });

  test('returns error when SHR endpoint fails', async () => {
    (publishToAfyaLinkShr as jest.Mock).mockRejectedValue(new Error('SHR 503 Service Unavailable'));

    const ctx = buildCtx();
    const result = await handlePublishNationalRecord({
      ctx,
      patient: mockPatient,
      correlationId: 'corr-4',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('SHR 503 Service Unavailable');
  });

  test('succeeds even when condition search fails (non-fatal)', async () => {
    (publishToAfyaLinkShr as jest.Mock).mockResolvedValue({ message: { record_id: 'SHR-C3', status: 'received' } });

    const search = jest.fn(async () => { throw new Error('Search error'); });
    const ctx = buildCtx({ search });

    const result = await handlePublishNationalRecord({
      ctx,
      patient: mockPatient,
      correlationId: 'corr-5',
      includeActiveConditions: true,
    });

    // Falls back to Patient-only bundle
    expect(result.status).toBe('published');
    expect(result.bundleEntryCount).toBe(1);
  });

  test('bundle identifier carries correlationId', async () => {
    (publishToAfyaLinkShr as jest.Mock).mockResolvedValue({ message: { status: 'received' } });

    const ctx = buildCtx();
    await handlePublishNationalRecord({ ctx, patient: mockPatient, correlationId: 'corr-6' });

    const shrCall = (publishToAfyaLinkShr as jest.Mock).mock.calls[0];
    const bundle = shrCall[1] as Bundle;
    expect(bundle.identifier?.value).toBe('corr-6');
  });
});
