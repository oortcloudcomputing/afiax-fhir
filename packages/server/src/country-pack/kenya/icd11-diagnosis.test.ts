// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaIcd10System, KenyaIcd11System, OperationOutcomeError } from '@medplum/core';
import type { Claim, Condition, Project } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { Repository } from '../../fhir/repo';
import { getGlobalSystemRepo } from '../../fhir/repo';
import { createTestProject, withTestContext } from '../../test.setup';
import { enforceKenyaIcd11Diagnosis } from './icd11-diagnosis';

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

describe('enforceKenyaIcd11Diagnosis', () => {
  test('rejects an ICD-10-only diagnosis in a Kenya project', () => {
    expect(() => enforceKenyaIcd11Diagnosis(kenyaProject(), icd10OnlyCondition, undefined, false)).toThrow(
      OperationOutcomeError
    );
  });

  test('accepts an ICD-11 diagnosis with an additional ICD-10 coding', () => {
    expect(() => enforceKenyaIcd11Diagnosis(kenyaProject(), icd11Condition, undefined, false)).not.toThrow();
  });

  test('does not apply outside Kenya projects', () => {
    const coreProject: Project = { resourceType: 'Project' };
    expect(() => enforceKenyaIcd11Diagnosis(coreProject, icd10OnlyCondition, undefined, false)).not.toThrow();
  });

  test('skips system writes', () => {
    expect(() => enforceKenyaIcd11Diagnosis(kenyaProject(), icd10OnlyCondition, undefined, true)).not.toThrow();
  });

  test('only logs in warn mode', () => {
    expect(() => enforceKenyaIcd11Diagnosis(kenyaProject('warn'), icd10OnlyCondition, undefined, false)).not.toThrow();
  });

  test('can be switched off', () => {
    expect(() => enforceKenyaIcd11Diagnosis(kenyaProject('off'), icd10OnlyCondition, undefined, false)).not.toThrow();
  });

  test('allows updates to a legacy record that do not change its diagnosis', () => {
    const updated: Condition = { ...icd10OnlyCondition, id: 'c1', clinicalStatus: { text: 'resolved' } };
    expect(() =>
      enforceKenyaIcd11Diagnosis(kenyaProject(), updated, { ...icd10OnlyCondition, id: 'c1' }, false)
    ).not.toThrow();
  });

  test('rejects an update that changes the diagnosis to a non-ICD-11 code', () => {
    const updated: Condition = {
      ...icd10OnlyCondition,
      id: 'c1',
      code: { coding: [{ system: KenyaIcd10System, code: 'B54' }] },
    };
    expect(() =>
      enforceKenyaIcd11Diagnosis(kenyaProject(), updated, { ...icd10OnlyCondition, id: 'c1' }, false)
    ).toThrow(OperationOutcomeError);
  });

  test('reports the failing Claim diagnosis location', () => {
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
      enforceKenyaIcd11Diagnosis(kenyaProject(), claim, undefined, false);
      throw new Error('Expected ICD-11 rule to reject the claim');
    } catch (err) {
      expect(err).toBeInstanceOf(OperationOutcomeError);
      const issue = (err as OperationOutcomeError).outcome.issue?.[0];
      expect(issue?.expression).toEqual(['Claim.diagnosis[0].diagnosisCodeableConcept']);
    }
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
