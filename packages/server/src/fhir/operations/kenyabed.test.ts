// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildKenyaBed, buildKenyaWard, ContentType, createReference, getKenyaBedState } from '@medplum/core';
import type { Encounter, Location, OperationOutcome, Parameters, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';

const app = express();
let accessToken: string;
let icu: Location;
let ward: Location;

function fhir(method: 'get' | 'post', path: string): request.Test {
  const req = method === 'get' ? request(app).get(`/fhir/R4/${path}`) : request(app).post(`/fhir/R4/${path}`);
  return req.set('Authorization', 'Bearer ' + accessToken).set('Content-Type', ContentType.FHIR_JSON);
}

async function create<T extends { resourceType: string }>(resource: T): Promise<T & { id: string }> {
  const res = await fhir('post', resource.resourceType).send(resource);
  expect(res.status).toBe(201);
  return res.body;
}

function bedAction(bed: Location, action: string, extra: NonNullable<Parameters['parameter']> = []): request.Test {
  return fhir('post', `Location/${bed.id}/$kenya-bed`).send({
    resourceType: 'Parameters',
    parameter: [{ name: 'action', valueCode: action }, ...extra],
  });
}

async function read(bed: Location): Promise<Location> {
  return (await fhir('get', `Location/${bed.id}`)).body;
}

const errorText = (res: request.Response): string => (res.body as OperationOutcome).issue?.[0]?.details?.text ?? '';
const out = (res: request.Response, name: string): string | undefined =>
  (res.body as Parameters).parameter?.find((p) => p.name === name)?.valueReference?.reference;

describe('Bed board: $kenya-bed (ADR-018 §C)', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const result = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: { name: 'Kenya beds', setting: [{ name: 'countryPack', valueString: 'kenya' }] },
    });
    accessToken = result.accessToken;
    icu = await create(buildKenyaWard('ICU', 'icu'));
    ward = await create(buildKenyaWard('Female medical', 'general'));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const patient = (name: string): Promise<Patient & { id: string }> =>
    create<Patient>({ resourceType: 'Patient', name: [{ given: [name], family: 'Test' }] });

  test('admit, transfer, discharge, clean: the beds and the inpatient Encounter follow', async () => {
    const bed1 = await create(buildKenyaBed('ICU bed 1', icu as Location & { id: string }));
    const bed2 = await create(buildKenyaBed('Bed 4', ward as Location & { id: string }));
    expect(getKenyaBedState(bed1)).toBe('U');
    const p = await patient('Achieng');

    const admitted = await bedAction(bed1, 'admit', [{ name: 'patient', valueReference: createReference(p) }]);
    expect(admitted.status).toBe(200);
    expect(getKenyaBedState(await read(bed1))).toBe('O');
    const encounterRef = out(admitted, 'encounter') as string;
    let encounter: Encounter = (await fhir('get', encounterRef)).body;
    expect(encounter).toMatchObject({ status: 'in-progress', class: { code: 'IMP' }, subject: { reference: `Patient/${p.id}` } });
    expect(encounter.location).toEqual([expect.objectContaining({ location: expect.objectContaining({ reference: `Location/${bed1.id}` }), status: 'active' })]);

    const moved = await bedAction(bed1, 'transfer', [{ name: 'toBed', valueReference: createReference(bed2) }]);
    expect(moved.status).toBe(200);
    expect(getKenyaBedState(await read(bed1))).toBe('H');
    expect(getKenyaBedState(await read(bed2))).toBe('O');
    encounter = (await fhir('get', encounterRef)).body;
    expect(encounter.location?.map((l) => [l.location.reference, l.status])).toEqual([
      [`Location/${bed1.id}`, 'completed'],
      [`Location/${bed2.id}`, 'active'],
    ]);

    const out1 = await bedAction(bed2, 'discharge');
    expect(out1.status).toBe(200);
    encounter = (await fhir('get', encounterRef)).body;
    expect(encounter.status).toBe('finished');
    expect(encounter.period?.end).toBeDefined();
    expect(getKenyaBedState(await read(bed2))).toBe('H');

    expect((await bedAction(bed2, 'cleaned')).status).toBe(200);
    expect(getKenyaBedState(await read(bed2))).toBe('U');
  });

  test('refuses what does not fit the bed’s state', async () => {
    const bed = await create(buildKenyaBed('ICU bed 2', icu as Location & { id: string }));
    const p = await patient('Otieno');
    expect(errorText(await bedAction(bed, 'discharge'))).toContain('has no patient');
    expect(errorText(await bedAction(bed, 'cleaned'))).toContain('not waiting to be cleaned');
    expect(errorText(await bedAction(bed, 'admit'))).toContain('Choose the patient');
    await bedAction(bed, 'admit', [{ name: 'patient', valueReference: createReference(p) }]);
    const other = await patient('Wanjiku');
    expect(errorText(await bedAction(bed, 'admit', [{ name: 'patient', valueReference: createReference(other) }]))).toContain('is not free');
    expect(errorText(await bedAction(bed, 'close'))).toContain('has a patient');
    // The same patient cannot be admitted to a second bed
    const bed3 = await create(buildKenyaBed('ICU bed 3', icu as Location & { id: string }));
    expect(errorText(await bedAction(bed3, 'admit', [{ name: 'patient', valueReference: createReference(p) }]))).toContain(
      'already admitted'
    );
    // Not a bed
    expect(errorText(await bedAction(icu, 'cleaned'))).toContain('not a bed');
  });

  test('close with a reason, then reopen', async () => {
    const bed = await create(buildKenyaBed('Bed 9', ward as Location & { id: string }));
    expect((await bedAction(bed, 'close', [{ name: 'reason', valueString: 'Broken oxygen point' }])).status).toBe(200);
    expect(await read(bed)).toMatchObject({ operationalStatus: { code: 'C' }, description: 'Broken oxygen point' });
    const p = await patient('Kiprop');
    expect(errorText(await bedAction(bed, 'admit', [{ name: 'patient', valueReference: createReference(p) }]))).toContain('is not free');
    expect((await bedAction(bed, 'reopen')).status).toBe(200);
    const reopened = await read(bed);
    expect(getKenyaBedState(reopened)).toBe('U');
    expect(reopened.description).toBeUndefined();
  });

  test('two nurses admitting to the same bed at once: only one succeeds', async () => {
    const bed = await create(buildKenyaBed('ICU bed 4', icu as Location & { id: string }));
    const [a, b] = await Promise.all([patient('Njeri'), patient('Mutua')]);
    const results = await Promise.all([
      bedAction(bed, 'admit', [{ name: 'patient', valueReference: createReference(a) }]),
      bedAction(bed, 'admit', [{ name: 'patient', valueReference: createReference(b) }]),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, expect.any(Number)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    const inBed = await fhir('get', `Encounter?location=Location/${bed.id}&status=in-progress`);
    expect(inBed.body.entry).toHaveLength(1);
  });
});
