// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient, Project } from '@medplum/fhirtypes';
import { handleResolvePatientIdentity } from './resolve-patient-identity';

jest.mock('../../util/auditevent', () => ({
  ...jest.requireActual('../../util/auditevent'),
  createAuditEvent: jest.fn(() => ({ resourceType: 'AuditEvent', entity: [] })),
  AuditEventOutcome: { Success: '0', MinorFailure: '4', MajorFailure: '12' },
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
  searchAfyaLinkClientRegistry: jest.fn(),
}));

import { getKenyaAfyaLinkCredentials, searchAfyaLinkClientRegistry } from './afyalink';

const mockPatient: Patient & { id: string } = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ family: 'Kamau', given: ['Jane'] }],
};

const mockProject: Project = {
  resourceType: 'Project',
  id: 'project-1',
  name: 'Test Clinic',
  setting: [{ name: 'countryPack', valueString: 'kenya' }],
};

function buildCtx(overrides?: Partial<{ createResource: jest.Mock; updateResource: jest.Mock; readResource: jest.Mock }>): any {
  return {
    project: mockProject,
    profile: { reference: 'Practitioner/prac-1' },
    logger: { warn: jest.fn() },
    repo: {},
    systemRepo: {
      createResource: overrides?.createResource ?? jest.fn(async (r: any) => ({ ...r, id: 'res-1' })),
      updateResource: overrides?.updateResource ?? jest.fn(async (r: any) => r),
      readResource: overrides?.readResource ?? jest.fn(async () => mockProject),
    },
  };
}

describe('handleResolvePatientIdentity', () => {
  beforeEach(() => {
    (searchAfyaLinkClientRegistry as jest.Mock).mockReset();
  });

  test('resolved: sets status, stores clientRegistryId on Patient identifier and extension', async () => {
    (searchAfyaLinkClientRegistry as jest.Mock).mockResolvedValue({
      message: {
        found: 1,
        client_registry_id: 'CR-12345678',
        full_name: 'Jane Kamau',
        date_of_birth: '1990-05-15',
        gender: 'Female',
        identification_type: 'National ID',
        identification_number: '12345678',
      },
    });

    const updateResource = jest.fn(async (r: any) => r);
    const createResource = jest.fn(async (r: any) => ({ ...r, id: 'res-1' }));
    const ctx = buildCtx({ updateResource, createResource });

    const result = await handleResolvePatientIdentity({
      ctx,
      patient: mockPatient,
      identificationType: 'National ID',
      identificationNumber: '12345678',
      correlationId: 'corr-1',
    });

    expect(result.status).toBe('resolved');
    expect(result.clientRegistryId).toBe('CR-12345678');
    expect(result.fullName).toBe('Jane Kamau');
    expect(result.dateOfBirth).toBe('1990-05-15');
    expect(result.gender).toBe('Female');
    expect(result.task?.reference).toMatch(/^Task\//);

    // Extension written to Patient
    const extUpdate = updateResource.mock.calls.find(
      (c) => c[0].resourceType === 'Patient' &&
      c[0].extension?.some((e: any) => e.url === 'https://afiax.africa/fhir/StructureDefinition/kenya-patient-identity')
    );
    expect(extUpdate).toBeDefined();

    // Identifier written for Client Registry ID
    const idUpdate = updateResource.mock.calls.find(
      (c) => c[0].resourceType === 'Patient' &&
      c[0].identifier?.some((id: any) => id.system === 'https://afiax.africa/kenya/identifier/client-registry-id')
    );
    expect(idUpdate).toBeDefined();
    const crIdentifier = idUpdate[0].identifier?.find(
      (id: any) => id.system === 'https://afiax.africa/kenya/identifier/client-registry-id'
    );
    expect(crIdentifier?.value).toBe('CR-12345678');
  });

  test('not-found: returns status not-found, no clientRegistryId written', async () => {
    (searchAfyaLinkClientRegistry as jest.Mock).mockResolvedValue({
      message: { found: 0 },
    });

    const updateResource = jest.fn(async (r: any) => r);
    const ctx = buildCtx({ updateResource });

    const result = await handleResolvePatientIdentity({
      ctx,
      patient: mockPatient,
      identificationType: 'National ID',
      identificationNumber: '00000000',
      correlationId: 'corr-2',
    });

    expect(result.status).toBe('not-found');
    expect(result.clientRegistryId).toBeNull();
    // Should not write a Client Registry identifier
    const idUpdate = updateResource.mock.calls.find(
      (c) => c[0].identifier?.some((id: any) => id.system === 'https://afiax.africa/kenya/identifier/client-registry-id')
    );
    expect(idUpdate).toBeUndefined();
  });

  test('error: returns status error when credentials are unavailable', async () => {
    (getKenyaAfyaLinkCredentials as jest.Mock).mockImplementationOnce(() => {
      throw new Error('Missing HIE credentials');
    });

    const ctx = buildCtx();
    const result = await handleResolvePatientIdentity({
      ctx,
      patient: mockPatient,
      identificationType: 'Passport',
      identificationNumber: 'A1234567',
      correlationId: 'corr-3',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('Missing HIE credentials');
    expect(result.clientRegistryId).toBeNull();
  });

  test('error: returns status error when registry call fails', async () => {
    (searchAfyaLinkClientRegistry as jest.Mock).mockRejectedValue(new Error('Registry timeout'));

    const ctx = buildCtx();
    const result = await handleResolvePatientIdentity({
      ctx,
      patient: mockPatient,
      identificationType: 'National ID',
      identificationNumber: '12345678',
      correlationId: 'corr-4',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('Registry timeout');
  });

  test('resolved: constructs fullName from first_name + last_name when full_name absent', async () => {
    (searchAfyaLinkClientRegistry as jest.Mock).mockResolvedValue({
      message: {
        found: 1,
        client_registry_id: 'CR-999',
        first_name: 'Mary',
        last_name: 'Wanjiku',
      },
    });

    const ctx = buildCtx();
    const result = await handleResolvePatientIdentity({
      ctx,
      patient: mockPatient,
      identificationType: 'National ID',
      identificationNumber: '99999999',
      correlationId: 'corr-5',
    });

    expect(result.status).toBe('resolved');
    expect(result.fullName).toBe('Mary Wanjiku');
  });
});
