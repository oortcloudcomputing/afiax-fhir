// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaIcd10System, KenyaIcd11System, OperationOutcomeError } from '@medplum/core';
import type { Claim, Condition, Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../../app';
import { getConfig, loadTestConfig } from '../../config/loader';
import type { Repository } from '../../fhir/repo';
import { getGlobalSystemRepo } from '../../fhir/repo';
import { createTestProject, withTestContext } from '../../test.setup';
import { enforceKenyaIcd11Diagnosis } from './icd11-diagnosis';
import type { KnhtsLookupResult } from './knhts';

const kenyaProject = (enforcement?: string): Project => ({
  resourceType: 'Project',
  setting: [
    { name: 'countryPack', valueString: 'kenya' },
    ...(enforcement ? [{ name: 'kenyaIcd11DiagnosisEnforcement', valueString: enforcement }] : []),
  ],
});

const icd10OnlyCondition: Condition = {
  resourceType: 'Condition',
  subject: { reference: 'Patient/p1' },
  code: { coding: [{ system: KenyaIcd10System, code: 'B50' }] },
};

const icd11Condition: Condition = {
  resourceType: 'Condition',
  subject: { reference: 'Patient/p1' },
  code: {
    coding: [
      { system: KenyaIcd11System, code: '1F40', display: 'Malaria due to Plasmodium falciparum' },
      { system: KenyaIcd10System, code: 'B50' },
    ],
  },
};

beforeAll(async () => {
  await loadTestConfig();
});

describe('enforceKenyaIcd11Diagnosis', () => {
  test('rejects an ICD-10-only diagnosis in a Kenya project', async () => {
    await expect(enforceKenyaIcd11Diagnosis(kenyaProject(), icd10OnlyCondition, undefined, false)).rejects.toThrow(OperationOutcomeError);
  });

  test('accepts an ICD-11 diagnosis with an additional ICD-10 coding', async () => {
    await expect(enforceKenyaIcd11Diagnosis(kenyaProject(), icd11Condition, undefined, false)).resolves.toBeUndefined();
  });

  test('does not apply outside Kenya projects', async () => {
    const coreProject: Project = { resourceType: 'Project' };
    await expect(enforceKenyaIcd11Diagnosis(coreProject, icd10OnlyCondition, undefined, false)).resolves.toBeUndefined();
  });

  test('skips system writes', async () => {
    await expect(enforceKenyaIcd11Diagnosis(kenyaProject(), icd10OnlyCondition, undefined, true)).resolves.toBeUndefined();
  });

  test('only logs in warn mode', async () => {
    await expect(enforceKenyaIcd11Diagnosis(kenyaProject('warn'), icd10OnlyCondition, undefined, false)).resolves.toBeUndefined();
  });

  test('can be switched off', async () => {
    await expect(enforceKenyaIcd11Diagnosis(kenyaProject('off'), icd10OnlyCondition, undefined, false)).resolves.toBeUndefined();
  });

  test('allows updates to a legacy record that do not change its diagnosis', async () => {
    const updated: Condition = { ...icd10OnlyCondition, id: 'c1', clinicalStatus: { text: 'resolved' } };
    await expect(enforceKenyaIcd11Diagnosis(kenyaProject(), updated, { ...icd10OnlyCondition, id: 'c1' }, false)).resolves.toBeUndefined();
  });

  test('rejects an update that changes the diagnosis to a non-ICD-11 code', async () => {
    const updated: Condition = {
      ...icd10OnlyCondition,
      id: 'c1',
      code: { coding: [{ system: KenyaIcd10System, code: 'B54' }] },
    };
    await expect(enforceKenyaIcd11Diagnosis(kenyaProject(), updated, { ...icd10OnlyCondition, id: 'c1' }, false)).rejects.toThrow(OperationOutcomeError);
  });

  test('reports the failing Claim diagnosis location', async () => {
    const claim: Claim = {
      resourceType: 'Claim',
      status: 'active',
      type: { text: 'Institutional' },
      use: 'claim',
      patient: { reference: 'Patient/p1' },
      created: '2026-10-17',
      provider: { reference: 'Organization/o1' },
      priority: { text: 'normal' },
      insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/c1' } }],
      diagnosis: [{ sequence: 1, diagnosisCodeableConcept: { coding: [{ system: KenyaIcd10System, code: 'J18' }] } }],
    };
    try {
      await enforceKenyaIcd11Diagnosis(kenyaProject(), claim, undefined, false);
      throw new Error('Expected ICD-11 rule to reject the claim');
    } catch (err) {
      expect(err).toBeInstanceOf(OperationOutcomeError);
      const issue = (err as OperationOutcomeError).outcome.issue?.[0];
      expect(issue?.expression).toEqual(['Claim.diagnosis[0].diagnosisCodeableConcept']);
    }
  });

  describe('KNHTS code check', () => {
    const lookupOf =
      (known: Record<string, boolean>): ((code: string) => Promise<KnhtsLookupResult>) =>
      async (code) => {
        if (!(code in known)) {
          return { status: 'not-found' };
        }
        return { status: 'found', display: code, retired: !known[code] };
      };

    beforeEach(() => {
      getConfig().knhtsValidation = true;
    });
    afterEach(() => {
      getConfig().knhtsValidation = false;
    });

    test('accepts a code that exists in KNHTS', async () => {
      await expect(
        enforceKenyaIcd11Diagnosis(kenyaProject(), icd11Condition, undefined, false, lookupOf({ '1F40': true }))
      ).resolves.toBeUndefined();
    });

    test('rejects a well-formed code that KNHTS does not know', async () => {
      const condition: Condition = { ...icd11Condition, code: { coding: [{ system: KenyaIcd11System, code: '1F4Q' }] } };
      await expect(
        enforceKenyaIcd11Diagnosis(kenyaProject(), condition, undefined, false, lookupOf({}))
      ).rejects.toThrow('ICD-11 code 1F4Q is not in the national terminology service (KNHTS)');
    });

    test('checks every part of a postcoordinated code', async () => {
      const condition: Condition = {
        ...icd11Condition,
        code: { coding: [{ system: KenyaIcd11System, code: '1A00&XN6S0' }] },
      };
      const lookup = jest.fn(lookupOf({ '1A00': true }));
      await expect(enforceKenyaIcd11Diagnosis(kenyaProject(), condition, undefined, false, lookup)).rejects.toThrow(
        'XN6S0'
      );
      expect(lookup).toHaveBeenCalledWith('1A00');
      expect(lookup).toHaveBeenCalledWith('XN6S0');
    });

    test('rejects a retired code', async () => {
      await expect(
        enforceKenyaIcd11Diagnosis(kenyaProject(), icd11Condition, undefined, false, lookupOf({ '1F40': false }))
      ).rejects.toThrow('retired');
    });

    test('accepts on the format check when KNHTS is unreachable', async () => {
      const unavailable = async (): Promise<KnhtsLookupResult> => ({ status: 'unavailable', reason: 'timeout' });
      await expect(
        enforceKenyaIcd11Diagnosis(kenyaProject(), icd11Condition, undefined, false, unavailable)
      ).resolves.toBeUndefined();
    });

    test('is not consulted when validation is disabled', async () => {
      getConfig().knhtsValidation = false;
      const lookup = jest.fn(lookupOf({}));
      await expect(
        enforceKenyaIcd11Diagnosis(kenyaProject(), icd11Condition, undefined, false, lookup)
      ).resolves.toBeUndefined();
      expect(lookup).not.toHaveBeenCalled();
    });
  });
});

describe('Kenya ICD-11 diagnosis rule in the repository write path', () => {
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    repo = (
      await createTestProject({
        withRepo: true,
        project: { setting: [{ name: 'countryPack', valueString: 'kenya' }] },
      })
    ).repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('rejects creating an ICD-10-only Condition', () =>
    withTestContext(async () => {
      await expect(repo.createResource(icd10OnlyCondition)).rejects.toThrow('ICD-11 MMS');
    }));

  test('creates an ICD-11 coded Condition', () =>
    withTestContext(async () => {
      const created = await repo.createResource(icd11Condition);
      expect(created.id).toBeDefined();
    }));

  test('rejects a PATCH that replaces the diagnosis with ICD-10 only', () =>
    withTestContext(async () => {
      const created = await repo.createResource(icd11Condition);
      await expect(
        repo.patchResource('Condition', created.id, [
          { op: 'replace', path: '/code', value: { coding: [{ system: KenyaIcd10System, code: 'B54' }] } },
        ])
      ).rejects.toThrow('ICD-11 MMS');
    }));

  test('allows status updates to a legacy ICD-10-only Condition', () =>
    withTestContext(async () => {
      const legacy = await getGlobalSystemRepo().createResource<Condition>({
        ...icd10OnlyCondition,
        meta: { project: repo.currentProject()?.id },
      });
      const updated = await repo.updateResource<Condition>({ ...legacy, clinicalStatus: { text: 'resolved' } });
      expect(updated.clinicalStatus?.text).toBe('resolved');
    }));
});
