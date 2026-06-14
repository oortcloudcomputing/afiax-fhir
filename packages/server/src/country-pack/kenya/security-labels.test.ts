// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle, Flag, Patient, Project } from '@medplum/fhirtypes';
import { allOk } from '@medplum/core';
import { enforceKenyaSecurityLabels } from './security-labels';
import type { FhirResponse } from '@medplum/fhir-router';

const ConfidentialitySystem = 'http://terminology.hl7.org/CodeSystem/v3-Confidentiality';
const BreakGlassFlagSystem = 'https://afiax.africa/CodeSystem/kenya-security-flag';

function makeCtx(overrides: Partial<{
  countryPack: string;
  superAdmin: boolean;
  authorRef: string;
  flags: Flag[];
}>): any {
  const { countryPack = 'kenya', superAdmin = false, authorRef = 'Practitioner/dr-1', flags = [] } = overrides;
  return {
    project: {
      resourceType: 'Project',
      setting: countryPack ? [{ name: 'countryPack', valueString: countryPack }] : [],
    } as Project,
    profile: { reference: authorRef },
    repo: {
      isSuperAdmin: () => superAdmin,
    },
    systemRepo: {
      search: jest.fn(async (): Promise<Bundle<Flag>> => ({
        resourceType: 'Bundle',
        type: 'searchset',
        entry: flags.map((r) => ({ resource: r })),
      })),
    },
  };
}

function restrictedPatient(id = 'patient-1'): Patient & { id: string } {
  return {
    resourceType: 'Patient',
    id,
    meta: {
      security: [{ system: ConfidentialitySystem, code: 'R', display: 'Restricted' }],
    },
  };
}

function activeBreakGlassFlag(patientId: string, authorRef: string, expired = false): Flag {
  const now = new Date();
  return {
    resourceType: 'Flag',
    status: 'active',
    code: {
      coding: [{ system: BreakGlassFlagSystem, code: 'break-glass-access' }],
    },
    subject: { reference: `Patient/${patientId}` },
    author: { reference: authorRef },
    period: {
      start: new Date(now.getTime() - 3600_000).toISOString(),
      end: expired ? new Date(now.getTime() - 1000).toISOString() : new Date(now.getTime() + 3600_000).toISOString(),
    },
  };
}

describe('enforceKenyaSecurityLabels', () => {
  test('passes through for non-Kenya projects', async () => {
    const ctx = makeCtx({ countryPack: 'na' });
    const patient = restrictedPatient();
    const result: FhirResponse = [allOk, patient];
    await expect(enforceKenyaSecurityLabels(ctx, result)).resolves.toBe(result);
  });

  test('passes through for super-admins', async () => {
    const ctx = makeCtx({ superAdmin: true });
    const patient = restrictedPatient();
    const result: FhirResponse = [allOk, patient];
    await expect(enforceKenyaSecurityLabels(ctx, result)).resolves.toBe(result);
  });

  test('passes through for resources without restricted label', async () => {
    const ctx = makeCtx({});
    const patient: Patient = { resourceType: 'Patient', id: 'p1', meta: { security: [{ system: ConfidentialitySystem, code: 'N' }] } };
    const result: FhirResponse = [allOk, patient];
    await expect(enforceKenyaSecurityLabels(ctx, result)).resolves.toBe(result);
  });

  test('passes through for Bundles (search results not individually enforced at route level)', async () => {
    const ctx = makeCtx({});
    const bundle: Bundle = { resourceType: 'Bundle', type: 'searchset', entry: [{ resource: restrictedPatient() }] };
    const result: FhirResponse = [allOk, bundle];
    await expect(enforceKenyaSecurityLabels(ctx, result)).resolves.toBe(result);
  });

  test('denies access when patient is restricted and no break-glass flag exists', async () => {
    const ctx = makeCtx({ flags: [] });
    const result: FhirResponse = [allOk, restrictedPatient()];
    await expect(enforceKenyaSecurityLabels(ctx, result)).rejects.toThrow();
  });

  test('allows access when a valid active break-glass flag exists for the correct author', async () => {
    const flag = activeBreakGlassFlag('patient-1', 'Practitioner/dr-1');
    const ctx = makeCtx({ authorRef: 'Practitioner/dr-1', flags: [flag] });
    const result: FhirResponse = [allOk, restrictedPatient('patient-1')];
    const returned = await enforceKenyaSecurityLabels(ctx, result);
    expect(returned).toBe(result);
  });

  test('denies when break-glass flag belongs to a different practitioner', async () => {
    const flag = activeBreakGlassFlag('patient-1', 'Practitioner/dr-OTHER');
    const ctx = makeCtx({ authorRef: 'Practitioner/dr-1', flags: [flag] });
    const result: FhirResponse = [allOk, restrictedPatient('patient-1')];
    await expect(enforceKenyaSecurityLabels(ctx, result)).rejects.toThrow();
  });

  test('denies when the break-glass flag has expired', async () => {
    const flag = activeBreakGlassFlag('patient-1', 'Practitioner/dr-1', /* expired */ true);
    const ctx = makeCtx({ authorRef: 'Practitioner/dr-1', flags: [flag] });
    const result: FhirResponse = [allOk, restrictedPatient('patient-1')];
    await expect(enforceKenyaSecurityLabels(ctx, result)).rejects.toThrow();
  });

  test('denies non-Patient resources with restricted label (no break-glass path)', async () => {
    const ctx = makeCtx({});
    const org = {
      resourceType: 'Organization',
      id: 'org-1',
      meta: { security: [{ system: ConfidentialitySystem, code: 'V' }] },
    };
    const result: FhirResponse = [allOk, org as any];
    await expect(enforceKenyaSecurityLabels(ctx, result)).rejects.toThrow();
  });
});
