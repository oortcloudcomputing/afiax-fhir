// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim, Coverage, Organization, Patient, Practitioner, Project } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import type { ShaPreAuthItem } from './request-sha-preauthorization';
import * as knhts from './knhts';
import { requestKenyaShaPreauthorization } from './request-sha-preauthorization';

jest.mock('node-fetch');

const patient: Patient = {
  resourceType: 'Patient',
  id: 'patient-preauth-001',
  name: [{ text: 'Afiax SHA Patient' }],
};

const providerOrganization: Organization = {
  resourceType: 'Organization',
  id: 'org-provider-001',
  name: 'Afiax Nairobi Facility',
};

const insurerOrganization: Organization = {
  resourceType: 'Organization',
  id: 'sha-insurer-001',
  name: 'SHA Kenya',
};

const coverage: Coverage = {
  resourceType: 'Coverage',
  id: 'coverage-sha-001',
  status: 'active',
  beneficiary: { reference: 'Patient/patient-preauth-001' },
  payor: [{ reference: 'Organization/sha-insurer-001' }],
};

const practitioner: Practitioner = {
  resourceType: 'Practitioner',
  id: 'practitioner-sha-001',
  name: [{ text: 'Dr SHA Clinician' }],
};

const requestedItems: ShaPreAuthItem[] = [
  { sequence: 1, interventionCode: 'SHA-KE-001', description: 'Knee Arthroscopy', quantity: 1, unitPrice: 50000 },
  { sequence: 2, interventionCode: 'SHA-KE-002', description: 'General Anaesthesia', quantity: 1, unitPrice: 15000 },
];

const baseProject: Project = {
  resourceType: 'Project',
  id: 'project-preauth-001',
  setting: [
    { name: 'countryPack', valueString: 'kenya' },
    { name: 'kenyaShaClaimsEnvironment', valueString: 'uat' },
  ],
};

const projectWithCredentials: Project = {
  ...baseProject,
  secret: [
    { name: 'kenyaShaClaimsAccessKey', valueString: 'sha-access-key' },
    { name: 'kenyaShaClaimsSecretKey', valueString: 'sha-secret-key' },
  ],
};

function makeSystemRepo(
  overrides: Partial<{
    createResource: jest.Mock;
    readResource: jest.Mock;
    updateResource: jest.Mock;
  }> = {}
): Record<'createResource' | 'readResource' | 'updateResource', jest.Mock> {
  let idSeq = 0;
  return {
    createResource: jest.fn(async (resource: { resourceType: string }) => ({
      ...resource,
      id: `${resource.resourceType}-${++idSeq}`,
    })),
    readResource: jest.fn(async (resourceType: string, id: string) => ({ resourceType, id })),
    updateResource: jest.fn(async (resource: object) => resource),
    ...overrides,
  };
}

describe('requestKenyaShaPreauthorization', () => {
  beforeEach(() => {
    (fetch as unknown as jest.Mock).mockReset();
  });

  test('builds pre-auth bundle with Claim.use === preauthorization and correct item structure', async () => {
    const systemRepo = makeSystemRepo();

    const result = await requestKenyaShaPreauthorization({
      ctx: { project: baseProject, systemRepo } as any,
      coverage: coverage as Coverage & { id: string },
      patient: patient as Patient & { id: string },
      providerOrganization: providerOrganization as Organization & { id: string },
      insurerOrganization: insurerOrganization as Organization & { id: string },
      practitioners: [practitioner as Practitioner & { id: string }],
      requestedItems,
      estimatedTotal: 65000,
      currency: 'KES',
      correlationId: 'corr-preauth-001',
    });

    expect(result.status).toBe('prepared');
    expect(result.preAuthClaimId).toBeDefined();

    const createdClaim = systemRepo.createResource.mock.calls[0][0] as Claim;
    expect(createdClaim.use).toBe('preauthorization');
    expect(createdClaim.status).toBe('active');
    expect(createdClaim.identifier?.[0]?.system).toBe('https://afiax.africa/kenya/identifier/private-preauth-code');
    expect(createdClaim.identifier?.[0]?.value).toBe('corr-preauth-001');
    expect(createdClaim.type?.coding?.[0]?.code).toBe('institutional');
    expect(createdClaim.total?.value).toBe(65000);
    expect(createdClaim.total?.currency).toBe('KES');
    expect(createdClaim.item).toHaveLength(2);
    expect(createdClaim.item?.[0]?.productOrService?.coding?.[0]?.code).toBe('SHA-KE-001');
    expect(createdClaim.item?.[0]?.productOrService?.coding?.[0]?.system).toBe(
      'https://ilm-hie.dha.go.ke/ocl/orgs/MOH-KENYA/sources/BenefitsAndInterventions'
    );
    expect(createdClaim.item?.[0]?.productOrService?.text).toBe('Knee Arthroscopy');
    expect(createdClaim.item?.[0]?.quantity?.value).toBe(1);
    expect(createdClaim.item?.[0]?.unitPrice?.value).toBe(50000);
    expect(createdClaim.careTeam).toHaveLength(1);
    expect(createdClaim.careTeam?.[0]?.sequence).toBe(1);
    expect(createdClaim.insurance?.[0]?.focal).toBe(true);
  });

  test('returns status prepared and includes rawBundle when no SHA credentials', async () => {
    const systemRepo = makeSystemRepo();

    const result = await requestKenyaShaPreauthorization({
      ctx: { project: baseProject, systemRepo } as any,
      coverage: coverage as Coverage & { id: string },
      patient: patient as Patient & { id: string },
      providerOrganization: providerOrganization as Organization & { id: string },
      insurerOrganization: insurerOrganization as Organization & { id: string },
      practitioners: [practitioner as Practitioner & { id: string }],
      requestedItems,
      estimatedTotal: 65000,
      currency: 'KES',
      correlationId: 'corr-preauth-no-creds',
    });

    expect(result.status).toBe('prepared');
    expect(result.nextState).toBe('ready-for-sha-transport');
    expect(result.rawBundle).toBeDefined();
    expect(result.submissionEndpoint).toContain('/v1/shr-med/bundle');
    expect(result.statusTrackingEndpoint).toContain('/v1/shr-med/claim-status');
    expect(fetch).not.toHaveBeenCalled();

    const bundle = JSON.parse(result.rawBundle ?? '');
    expect(bundle.type).toBe('message');
    const claimEntry = bundle.entry?.find(
      (e: { resource?: { resourceType: string } }) => e.resource?.resourceType === 'Claim'
    );
    expect(claimEntry).toBeDefined();
    const bundledClaim = claimEntry.resource as Claim;
    expect(bundledClaim.use).toBe('preauthorization');
    expect(bundledClaim.patient?.reference).toContain('https://qa-mis.apeiro-digital.com/fhir/Patient/');
  });

  test('submits to /v1/shr-med/bundle when SHA credentials are configured', async () => {
    const systemRepo = makeSystemRepo();

    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: jest.fn(async () => JSON.stringify({ status: 'accepted', preAuthId: 'sha-preauth-remote-001' })),
    });

    const result = await requestKenyaShaPreauthorization({
      ctx: { project: projectWithCredentials, systemRepo } as any,
      coverage: coverage as Coverage & { id: string },
      patient: patient as Patient & { id: string },
      providerOrganization: providerOrganization as Organization & { id: string },
      insurerOrganization: insurerOrganization as Organization & { id: string },
      practitioners: [practitioner as Practitioner & { id: string }],
      requestedItems,
      estimatedTotal: 65000,
      currency: 'KES',
      correlationId: 'corr-preauth-submit-001',
    });

    expect(result.status).toBe('submitted');
    expect(result.nextState).toBe('awaiting-sha-preauth-decision');
    expect(result.submissionEndpoint).toBe('https://qa-mis.apeiro-digital.com/v1/shr-med/bundle');
    expect(result.statusTrackingEndpoint).toContain('/v1/shr-med/claim-status?claim_id=');
    expect(result.responseStatusCode).toBe(202);
    expect(result.rawResponse).toContain('"status":"accepted"');
    expect(result.preAuthClaimId).toBeDefined();
    expect(result.preAuthBundleId).toBeDefined();

    expect(fetch).toHaveBeenCalledWith(
      'https://qa-mis.apeiro-digital.com/v1/shr-med/bundle',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          'Content-Type': 'application/fhir+json',
        }),
      })
    );
  });

  test('stamps bundleId identifier on the Medplum Claim after successful submission', async () => {
    const claimWithId: Claim & { id: string } = {
      resourceType: 'Claim',
      id: 'Claim-1',
      status: 'active',
      use: 'preauthorization',
      type: {},
      patient: { reference: 'Patient/patient-preauth-001' },
      created: new Date().toISOString(),
      insurer: { reference: 'Organization/sha-insurer-001' },
      provider: { reference: 'Organization/org-provider-001' },
      priority: {},
      insurance: [],
    };

    const systemRepo = makeSystemRepo({
      createResource: jest.fn(async () => claimWithId),
      readResource: jest.fn(async () => ({ ...claimWithId, identifier: [] })),
      updateResource: jest.fn(async (resource: object) => resource),
    });

    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: jest.fn(async () => '{"status":"accepted"}'),
    });

    const result = await requestKenyaShaPreauthorization({
      ctx: { project: projectWithCredentials, systemRepo } as any,
      coverage: coverage as Coverage & { id: string },
      patient: patient as Patient & { id: string },
      providerOrganization: providerOrganization as Organization & { id: string },
      insurerOrganization: insurerOrganization as Organization & { id: string },
      practitioners: [practitioner as Practitioner & { id: string }],
      requestedItems,
      estimatedTotal: 65000,
      currency: 'KES',
      correlationId: 'corr-stamp-001',
    });

    expect(result.status).toBe('submitted');
    expect(systemRepo.updateResource).toHaveBeenCalledWith(
      expect.objectContaining({
        identifier: expect.arrayContaining([
          expect.objectContaining({
            system: 'https://afiax.africa/kenya/identifier/sha-bundle-id',
            value: result.preAuthBundleId,
          }),
        ]),
      })
    );
  });

  test('returns status error when SHA submission fails', async () => {
    const systemRepo = makeSystemRepo();

    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: jest.fn(async () => 'Internal Server Error'),
    });

    const result = await requestKenyaShaPreauthorization({
      ctx: { project: projectWithCredentials, systemRepo } as any,
      coverage: coverage as Coverage & { id: string },
      patient: patient as Patient & { id: string },
      providerOrganization: providerOrganization as Organization & { id: string },
      insurerOrganization: insurerOrganization as Organization & { id: string },
      practitioners: [practitioner as Practitioner & { id: string }],
      requestedItems,
      estimatedTotal: 65000,
      currency: 'KES',
      correlationId: 'corr-preauth-error-001',
    });

    expect(result.status).toBe('error');
    expect(result.nextState).toBe('retry-or-review-sha-credentials');
    expect(result.message).toContain('Kenya SHA pre-authorization submission failed');
    expect(result.preAuthClaimId).toBeDefined();
    expect(result.rawBundle).toBeDefined();
  });

  test('rejects intervention codes that KNHTS does not know, before contacting SHA', async () => {
    jest.spyOn(knhts, 'isKnhtsValidationEnabled').mockReturnValue(true);
    const lookup = jest
      .spyOn(knhts, 'lookupKnhtsConcept')
      .mockImplementation(async (_source, code) =>
        code === 'SHA-KE-001' ? { status: 'found', display: 'Knee Arthroscopy', retired: false } : { status: 'not-found' }
      );
    try {
      const systemRepo = makeSystemRepo();
      const result = await requestKenyaShaPreauthorization({
        ctx: { project: projectWithCredentials, systemRepo } as any,
        coverage: coverage as Coverage & { id: string },
        patient: patient as Patient & { id: string },
        providerOrganization: providerOrganization as Organization & { id: string },
        insurerOrganization: insurerOrganization as Organization & { id: string },
        practitioners: [practitioner as Practitioner & { id: string }],
        requestedItems,
        estimatedTotal: 65000,
        currency: 'KES',
        correlationId: 'corr-preauth-knhts',
      });
      expect(systemRepo.createResource).not.toHaveBeenCalled();
      expect(result.status).toBe('error');
      expect(result.message).toBe('Unknown SHA intervention code(s) in KNHTS: SHA-KE-002');
      expect(lookup).toHaveBeenCalledWith(knhts.KnhtsSources.shaInterventions, 'SHA-KE-001');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      jest.restoreAllMocks();
    }
  });

  test('uses quantity 1 as default when item quantity is not specified', async () => {
    const systemRepo = makeSystemRepo();

    await requestKenyaShaPreauthorization({
      ctx: { project: baseProject, systemRepo } as any,
      coverage: coverage as Coverage & { id: string },
      patient: patient as Patient & { id: string },
      providerOrganization: providerOrganization as Organization & { id: string },
      insurerOrganization: insurerOrganization as Organization & { id: string },
      practitioners: [],
      requestedItems: [{ sequence: 1, interventionCode: 'SHA-KE-003', description: 'Lab Test' }],
      estimatedTotal: 1000,
      currency: 'KES',
      correlationId: 'corr-default-qty',
    });

    const createdClaim = systemRepo.createResource.mock.calls[0][0] as Claim;
    expect(createdClaim.item?.[0]?.quantity?.value).toBe(1);
    expect(createdClaim.item?.[0]?.unitPrice).toBeUndefined();
  });

  test('bundle includes all practitioners as careTeam entries with sequential sequences', async () => {
    const systemRepo = makeSystemRepo();

    const practitioner2: Practitioner = {
      resourceType: 'Practitioner',
      id: 'practitioner-sha-002',
      name: [{ text: 'Dr Second Clinician' }],
    };

    await requestKenyaShaPreauthorization({
      ctx: { project: baseProject, systemRepo } as any,
      coverage: coverage as Coverage & { id: string },
      patient: patient as Patient & { id: string },
      providerOrganization: providerOrganization as Organization & { id: string },
      insurerOrganization: insurerOrganization as Organization & { id: string },
      practitioners: [practitioner as Practitioner & { id: string }, practitioner2 as Practitioner & { id: string }],
      requestedItems,
      estimatedTotal: 65000,
      currency: 'KES',
      correlationId: 'corr-multi-prac',
    });

    const createdClaim = systemRepo.createResource.mock.calls[0][0] as Claim;
    expect(createdClaim.careTeam).toHaveLength(2);
    expect(createdClaim.careTeam?.[0]?.sequence).toBe(1);
    expect(createdClaim.careTeam?.[1]?.sequence).toBe(2);

    const result = await requestKenyaShaPreauthorization({
      ctx: { project: baseProject, systemRepo: makeSystemRepo() } as any,
      coverage: coverage as Coverage & { id: string },
      patient: patient as Patient & { id: string },
      providerOrganization: providerOrganization as Organization & { id: string },
      insurerOrganization: insurerOrganization as Organization & { id: string },
      practitioners: [practitioner as Practitioner & { id: string }, practitioner2 as Practitioner & { id: string }],
      requestedItems,
      estimatedTotal: 65000,
      currency: 'KES',
      correlationId: 'corr-multi-prac-bundle',
    });

    const bundle = JSON.parse(result.rawBundle ?? '');
    const practEntries = bundle.entry?.filter(
      (e: { resource?: { resourceType: string } }) => e.resource?.resourceType === 'Practitioner'
    );
    expect(practEntries).toHaveLength(2);
  });
});
