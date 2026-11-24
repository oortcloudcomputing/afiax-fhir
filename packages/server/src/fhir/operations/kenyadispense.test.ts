// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  createReference,
  getKenyaPrescriptionCode,
  KenyaDepartmentSystem,
  KenyaErxMedicationDispenseProfile,
  KenyaHealthProductSystem,
} from '@medplum/core';
import type {
  Bundle,
  Encounter,
  Location,
  MedicationDispense,
  MedicationRequest,
  OperationOutcome,
  Parameters,
  Patient,
  Task,
} from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';

const app = express();
let accessToken: string;
let patient: Patient;
let encounter: Encounter;

function fhir(method: 'get' | 'post', path: string): request.Test {
  const req = method === 'get' ? request(app).get(`/fhir/R4/${path}`) : request(app).post(`/fhir/R4/${path}`);
  return req.set('Authorization', 'Bearer ' + accessToken).set('Content-Type', ContentType.FHIR_JSON);
}

function put(resource: MedicationRequest): request.Test {
  return request(app)
    .put(`/fhir/R4/MedicationRequest/${resource.id}`)
    .set('Authorization', 'Bearer ' + accessToken)
    .set('Content-Type', ContentType.FHIR_JSON)
    .send(resource);
}

function param(body: Parameters, name: string): NonNullable<Parameters['parameter']>[number] | undefined {
  return body.parameter?.find((p) => p.name === name);
}

/**
 * Prescribes metformin 1 tablet BD for 30 days, 60 tablets.
 * @returns The MedicationRequest.
 */
async function prescribe(): Promise<MedicationRequest> {
  const res = await fhir('post', `Encounter/${encounter.id}/$kenya-order`).send({
    resourceType: 'Parameters',
    parameter: [
      { name: 'category', valueCode: 'medication' },
      { name: 'code', valueCoding: { system: KenyaHealthProductSystem, code: 'GE10002', display: 'Metformin 500 mg Oral Tablet' } },
      { name: 'doseValue', valueDecimal: 1 },
      { name: 'doseUnit', valueCode: 'tablet' },
      { name: 'frequency', valueCode: 'BD' },
      { name: 'route', valueCode: 'RT10025' },
      { name: 'quantity', valueDecimal: 60 },
      { name: 'durationDays', valueInteger: 30 },
    ],
  });
  expect(res.status).toBe(200);
  return (await fhir('get', param(res.body, 'order')?.valueReference?.reference as string)).body;
}

function dispense(prescription: MedicationRequest, quantity?: number): request.Test {
  return fhir('post', `MedicationRequest/${prescription.id}/$kenya-dispense`).send({
    resourceType: 'Parameters',
    parameter: quantity === undefined ? [] : [{ name: 'quantity', valueDecimal: quantity }],
  });
}

describe('Kenya dispensing by prescription code (ADR-016 step 2)', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const result = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: { name: 'Kenya dispensing', setting: [{ name: 'countryPack', valueString: 'kenya' }] },
    });
    accessToken = result.accessToken;
    patient = (await fhir('post', 'Patient').send({ resourceType: 'Patient', name: [{ family: 'Kamau' }] })).body;
    const dispensary: Location = (
      await fhir('post', 'Location').send({ resourceType: 'Location', name: 'Dispensary', status: 'active' })
    ).body;
    encounter = (
      await fhir('post', 'Encounter').send({
        resourceType: 'Encounter',
        status: 'in-progress',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        subject: createReference(patient),
        location: [{ location: createReference(dispensary) }],
      })
    ).body;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('a pharmacist finds a prescription by its code, typed loosely', async () => {
    const prescription = await prescribe();
    const code = getKenyaPrescriptionCode(prescription) as string;
    const typed = code.toLowerCase().replace(/-/g, ' ').replace(/0/g, 'o');
    const res = await fhir('get', `MedicationRequest/$kenya-prescription-lookup?code=${encodeURIComponent(typed)}`);
    expect(res.status).toBe(200);
    expect(param(res.body, 'prescription')?.resource?.id).toBe(prescription.id);
    expect(param(res.body, 'patient')?.resource?.id).toBe(patient.id);
    expect(param(res.body, 'state')?.valueCode).toBe('valid');
    expect(param(res.body, 'remaining')?.valueDecimal).toBe(60);

    const missing = await fhir('get', 'MedicationRequest/$kenya-prescription-lookup?code=RX-0000-0000-00');
    expect(missing.status).toBe(404);
    const garbage = await fhir('get', 'MedicationRequest/$kenya-prescription-lookup?code=hello');
    expect(garbage.status).toBe(400);
    expect((garbage.body as OperationOutcome).issue?.[0]?.details?.text).toContain('RX-');
  });

  test('part fill, then the rest; then it cannot be dispensed again', async () => {
    const prescription = await prescribe();

    const part = await dispense(prescription, 20);
    expect(part.status).toBe(200);
    expect(param(part.body, 'remaining')?.valueDecimal).toBe(40);
    const first: MedicationDispense = (
      await fhir('get', param(part.body, 'dispense')?.valueReference?.reference as string)
    ).body;
    expect(first.type?.coding?.[0]?.code).toBe('FFP');
    expect(first.quantity).toMatchObject({ value: 20, unit: 'tablet' });
    expect(first.meta?.profile).toEqual([KenyaErxMedicationDispenseProfile]);
    expect(first.identifier?.[0]?.value).toBe(getKenyaPrescriptionCode(prescription));

    // The pharmacy task stays open while tablets are owed
    const open = await fhir('get', `Task?focus=MedicationRequest/${prescription.id}&performer=${KenyaDepartmentSystem}|pharmacy`);
    expect(((open.body as Bundle).entry?.[0]?.resource as Task).status).toBe('requested');

    const rest = await dispense(prescription);
    expect(rest.status).toBe(200);
    expect(param(rest.body, 'state')?.valueCode).toBe('dispensed');
    const second: MedicationDispense = (
      await fhir('get', param(rest.body, 'dispense')?.valueReference?.reference as string)
    ).body;
    expect(second.type?.coding?.[0]?.code).toBe('FFC');
    expect(second.quantity?.value).toBe(40);

    const done: MedicationRequest = (await fhir('get', `MedicationRequest/${prescription.id}`)).body;
    expect(done.status).toBe('completed');
    const task = (
      (await fhir('get', `Task?focus=MedicationRequest/${prescription.id}`)).body as Bundle
    ).entry?.[0]?.resource as Task;
    expect(task).toMatchObject({ status: 'completed', businessStatus: { text: 'Dispensed' } });

    const again = await dispense(prescription, 1);
    expect(again.status).toBe(400);
    expect((again.body as OperationOutcome).issue?.[0]?.details?.text).toContain('already been dispensed');
  });

  test('cannot dispense more than is left', async () => {
    const prescription = await prescribe();
    const res = await dispense(prescription, 61);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain('Only 60 left');
  });

  test('a network chemist is recorded as the performer, not the caller', async () => {
    const prescription = await prescribe();
    const chemist = {
      type: 'Organization',
      identifier: { system: 'https://afiax.africa/kenya/identifier/ppb-premises', value: 'PPB/P/12345' },
      display: 'Uzima Chemist',
    };
    const res = await fhir('post', `MedicationRequest/${prescription.id}/$kenya-dispense`).send({
      resourceType: 'Parameters',
      parameter: [
        { name: 'performer', valueReference: chemist },
        { name: 'note', valueString: 'Dispensed at Uzima Chemist (Afiax Prescription Network)' },
      ],
    });
    expect(res.status).toBe(200);
    const dispensed: MedicationDispense = (
      await fhir('get', param(res.body, 'dispense')?.valueReference?.reference as string)
    ).body;
    expect(dispensed.performer).toEqual([{ actor: chemist }]);
  });

  test('a performer that is not a named pharmacy is refused', async () => {
    const prescription = await prescribe();
    for (const [performer, message] of [
      [{ reference: 'Practitioner/123', display: 'Someone' }, 'must be the dispensing pharmacy'],
      [{ type: 'Organization', identifier: { system: 'https://afiax.africa/kenya/identifier/ppb-premises', value: 'X' } }, 'Give the dispensing pharmacy a name'],
    ] as const) {
      const res = await fhir('post', `MedicationRequest/${prescription.id}/$kenya-dispense`).send({
        resourceType: 'Parameters',
        parameter: [{ name: 'performer', valueReference: performer }],
      });
      expect(res.status).toBe(400);
      expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain(message);
    }
    // Nothing was dispensed by the refused calls
    const again = await dispense(prescription);
    expect(param(again.body, 'state')?.valueCode).toBe('dispensed');
  });

  test('an expired or cancelled prescription is refused', async () => {
    const prescription = await prescribe();
    const expired = (
      await put({
        ...prescription,
        dispenseRequest: { ...prescription.dispenseRequest, validityPeriod: { start: '2025-01-01', end: '2025-01-31' } },
      })
    ).body as MedicationRequest;
    const res = await dispense(expired, 10);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain('expired on 2025-01-31');

    const cancelled = await prescribe();
    await put({ ...cancelled, status: 'cancelled' });
    const lookup = await fhir(
      'get',
      `MedicationRequest/$kenya-prescription-lookup?code=${getKenyaPrescriptionCode(cancelled)}`
    );
    expect(param(lookup.body, 'state')?.valueCode).toBe('cancelled');
  });

  test('two pharmacists dispensing the same prescription at once: only one succeeds', async () => {
    const prescription = await prescribe();
    const results = await Promise.all([dispense(prescription, 60), dispense(prescription, 60)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const dispenses = await fhir('get', `MedicationDispense?prescription=MedicationRequest/${prescription.id}`);
    expect((dispenses.body as Bundle).entry).toHaveLength(1);
  });
});
