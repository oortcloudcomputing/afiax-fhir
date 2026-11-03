// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, KenyaPatientIdentifierSystems } from '@medplum/core';
import type { Observation, Patient } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import type { Repository } from '../../fhir/repo';
import { createTestProject, withTestContext } from '../../test.setup';

const johnDoe: Patient = {
  resourceType: 'Patient',
  name: [{ given: ['John'], family: 'Doe' }],
  gender: 'male',
  birthDate: '1990-01-15',
  identifier: [{ system: KenyaPatientIdentifierSystems['National ID'], value: '12345678' }],
};

function weight(patient: Patient & { id: string }, value: number): Observation {
  return {
    resourceType: 'Observation',
    status: 'final',
    category: [
      { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/observation-category', code: 'vital-signs' }] },
    ],
    code: { coding: [{ system: 'http://loinc.org', code: '29463-7', display: 'Body weight' }] },
    subject: createReference(patient),
    valueQuantity: { value, unit: 'kg', system: 'http://unitsofmeasure.org', code: 'kg' },
  };
}

describe('Kenya data validation on write', () => {
  let kenyaRepo: Repository;
  let otherRepo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    ({ repo: kenyaRepo } = await createTestProject({
      withRepo: true,
      project: { setting: [{ name: 'countryPack', valueString: 'kenya' }] },
      membership: { admin: true },
    }));
    ({ repo: otherRepo } = await createTestProject({ withRepo: true, membership: { admin: true } }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('accepts the DHA test patient', () =>
    withTestContext(async () => {
      const patient = await kenyaRepo.createResource(johnDoe);
      expect(patient.id).toBeDefined();
    }));

  test('rejects a date of birth in 2099', () =>
    withTestContext(async () => {
      await expect(kenyaRepo.createResource({ ...johnDoe, birthDate: '2099-01-15' })).rejects.toThrow(
        'Date of birth 2099-01-15 is in the future'
      );
    }));

  test('rejects a National ID with letters', () =>
    withTestContext(async () => {
      await expect(
        kenyaRepo.createResource({
          ...johnDoe,
          identifier: [{ system: KenyaPatientIdentifierSystems['National ID'], value: '1234ABCD' }],
        })
      ).rejects.toThrow('National ID "1234ABCD" is not valid');
    }));

  test('rejects a weight of -5 kg, also on update', () =>
    withTestContext(async () => {
      const patient = await kenyaRepo.createResource(johnDoe);
      await expect(kenyaRepo.createResource(weight(patient, -5))).rejects.toThrow('Body weight cannot be negative');
      const ok = await kenyaRepo.createResource(weight(patient, 70));
      await expect(kenyaRepo.updateResource({ ...ok, valueQuantity: { ...ok.valueQuantity, value: -5 } })).rejects.toThrow(
        'Body weight cannot be negative'
      );
    }));

  test('does not apply outside Kenya projects', () =>
    withTestContext(async () => {
      const patient = await otherRepo.createResource({ ...johnDoe, birthDate: '2099-01-15' });
      expect(patient.birthDate).toBe('2099-01-15');
    }));

  test('a patient with clinical records cannot be deleted', () =>
    withTestContext(async () => {
      const patient = await kenyaRepo.createResource(johnDoe);
      await kenyaRepo.createResource({
        resourceType: 'Encounter',
        status: 'in-progress',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        subject: createReference(patient),
      });
      await expect(kenyaRepo.deleteResource('Patient', patient.id)).rejects.toThrow(
        'Patient cannot be deleted: they have Encounter records'
      );
      const stillThere = await kenyaRepo.readResource<Patient>('Patient', patient.id);
      expect(stillThere.id).toBe(patient.id);
    }));

  test('a patient registered in error, with no records, can be deleted', () =>
    withTestContext(async () => {
      const patient = await kenyaRepo.createResource(johnDoe);
      await kenyaRepo.deleteResource('Patient', patient.id);
      await expect(kenyaRepo.readResource('Patient', patient.id)).rejects.toThrow('Gone');
    }));
});
