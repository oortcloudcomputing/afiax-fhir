// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaIcd11System } from '@medplum/core';
import type { Encounter, Patient } from '@medplum/fhirtypes';
import { buildKenyaDiagnosis } from './kenya-diagnosis';

const patient: Patient = { resourceType: 'Patient', id: 'p1' };
const encounter: Encounter = { resourceType: 'Encounter', id: 'e1', status: 'in-progress', class: { code: 'AMB' } };

describe('buildKenyaDiagnosis', () => {
  test('an encounter diagnosis with ICD-11 and the DHA required elements', () => {
    const condition = buildKenyaDiagnosis({
      patient,
      encounter,
      code: { code: '1F40.Z', display: 'Malaria, unspecified' },
      verification: 'confirmed',
      onset: '2026-11-07',
      recorder: { reference: 'Practitioner/dr1' },
    });
    expect(condition).toMatchObject({
      subject: { reference: 'Patient/p1' },
      encounter: { reference: 'Encounter/e1' },
      code: { coding: [{ system: KenyaIcd11System, code: '1F40.Z' }], text: 'Malaria, unspecified' },
      category: [{ coding: [{ code: 'encounter-diagnosis' }] }],
      clinicalStatus: { coding: [{ code: 'active' }] },
      verificationStatus: { coding: [{ code: 'confirmed' }] },
      onsetDateTime: '2026-11-07',
      recorder: { reference: 'Practitioner/dr1' },
    });
    expect(condition.meta?.profile).toBeUndefined();
  });

  test('without an encounter it is a problem-list item', () => {
    const condition = buildKenyaDiagnosis({ patient, code: { code: '5A11' }, verification: 'provisional' });
    expect(condition.category?.[0].coding?.[0].code).toBe('problem-list-item');
    expect(condition.onsetDateTime).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
