// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  createReference,
  KenyaAllergyCodeSystem,
  KenyaDepartmentSystem,
  KenyaHealthProductSystem,
  KenyaIchiSystem,
  KenyaInvestigationSystem,
} from '@medplum/core';
import type {
  Bundle,
  ChargeItem,
  Encounter,
  MedicationRequest,
  OperationOutcome,
  Parameters,
  Patient,
  ServiceRequest,
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

function orderParams(
  category: string,
  system: string,
  code: string,
  display: string,
  extra: Parameters['parameter'] = []
): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      { name: 'category', valueCode: category },
      { name: 'code', valueCoding: { system, code, display } },
      ...(extra ?? []),
    ],
  };
}

function output(body: Parameters, name: string): string | undefined {
  return body.parameter?.find((p) => p.name === name)?.valueReference?.reference;
}

describe('Kenya CPOE (DHA FUNC-CPOE-001)', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const result = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: {
        name: 'Kenya CPOE',
        setting: [
          { name: 'countryPack', valueString: 'kenya' },
          { name: 'kenyaPriceList', valueString: JSON.stringify({ 'INV-00000399': 800, PH12907: 15 }) },
        ],
      },
    });
    accessToken = result.accessToken;
    patient = (await fhir('post', 'Patient').send({ resourceType: 'Patient', gender: 'male', birthDate: '1980-01-01' }))
      .body;
    encounter = (
      await fhir('post', 'Encounter').send({
        resourceType: 'Encounter',
        status: 'in-progress',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        subject: createReference(patient),
      })
    ).body;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('laboratory order is routed to the lab queue and billed from the price list', async () => {
    const res = await fhir('post', `Encounter/${encounter.id}/$kenya-order`).send(
      orderParams('laboratory', KenyaInvestigationSystem, 'INV-00000399', 'Complete blood count (CBC)', [
        { name: 'priority', valueCode: 'urgent' },
      ])
    );
    expect(res.status).toBe(200);

    const order: ServiceRequest = (await fhir('get', output(res.body, 'order') as string)).body;
    expect(order).toMatchObject({
      status: 'active',
      priority: 'urgent',
      encounter: { reference: `Encounter/${encounter.id}` },
    });
    expect(order.performerType?.coding?.[0]).toMatchObject({ system: KenyaDepartmentSystem, code: 'laboratory' });

    const task: Task = (await fhir('get', output(res.body, 'task') as string)).body;
    expect(task).toMatchObject({ status: 'requested', focus: { reference: `ServiceRequest/${order.id}` } });

    const charge: ChargeItem = (await fhir('get', output(res.body, 'chargeItem') as string)).body;
    expect(charge).toMatchObject({ status: 'billable', priceOverride: { value: 800, currency: 'KES' } });

    // The lab sees it in its queue
    const queue = await fhir('get', `Task?performer=${KenyaDepartmentSystem}|laboratory&status=requested`);
    expect((queue.body as Bundle).entry?.map((e) => e.resource?.id)).toContain(task.id);
  });

  test('every attested order category can be placed', async () => {
    const orders: [string, string, string, string][] = [
      ['radiology', KenyaInvestigationSystem, 'INV-00001296', 'X Ray Chest'],
      [
        'physiotherapy',
        KenyaIchiSystem,
        'MVD.PG.ZZ',
        'Assisting and leading exercise for control of voluntary movement functions',
      ],
      ['nutrition', KenyaIchiSystem, 'VEA.PM.ZZ', 'Education to influence eating behaviours'],
      ['social-work', KenyaIchiSystem, 'VEK.AA.ZZ', 'Assessment of social behaviours'],
      ['counselling', KenyaIchiSystem, 'AUD.PP.ZZ', 'Counselling for emotional functions'],
    ];
    for (const [category, system, code, display] of orders) {
      const res = await fhir('post', `Encounter/${encounter.id}/$kenya-order`).send(
        orderParams(category, system, code, display)
      );
      expect(res.status).toBe(200);
    }
    const history = await fhir('get', `ServiceRequest?encounter=Encounter/${encounter.id}`);
    expect((history.body as Bundle).entry).toHaveLength(6);
  });

  test('medication order goes to the pharmacy with quantity-based billing', async () => {
    const res = await fhir('post', `Encounter/${encounter.id}/$kenya-order`).send(
      orderParams('medication', KenyaHealthProductSystem, 'PH12907', 'Amoxicillin 500 mg Oral Capsule', [
        { name: 'dosageText', valueString: '500 mg three times daily for 5 days' },
        { name: 'quantity', valueDecimal: 15 },
        { name: 'durationDays', valueInteger: 5 },
      ])
    );
    expect(res.status).toBe(200);
    const order: MedicationRequest = (await fhir('get', output(res.body, 'order') as string)).body;
    expect(order.dosageInstruction?.[0]?.text).toBe('500 mg three times daily for 5 days');
    const task: Task = (await fhir('get', output(res.body, 'task') as string)).body;
    expect(task.performerType?.[0]?.coding?.[0]?.code).toBe('pharmacy');
    const charge: ChargeItem = (await fhir('get', output(res.body, 'chargeItem') as string)).body;
    expect(charge.priceOverride).toEqual({ value: 225, currency: 'KES' });
  });

  test('orders are validated', async () => {
    const url = `Encounter/${encounter.id}/$kenya-order`;
    const wrongSystem = await fhir('post', url).send(orderParams('laboratory', 'http://loinc.org', '718-7', 'Hb'));
    expect(wrongSystem.status).toBe(400);
    expect((wrongSystem.body as OperationOutcome).issue?.[0]?.details?.text).toContain('KNHTS');

    const noDose = await fhir('post', url).send(
      orderParams('medication', KenyaHealthProductSystem, 'AC10001', 'Metformin')
    );
    expect(noDose.status).toBe(400);

    const unknown = await fhir('post', url).send(orderParams('surgery', KenyaIchiSystem, 'X', 'X'));
    expect(unknown.status).toBe(400);
  });

  test('a medication that conflicts with an allergy is blocked by CDS, and nothing is billed', async () => {
    await fhir('post', 'AllergyIntolerance').send({
      resourceType: 'AllergyIntolerance',
      patient: createReference(patient),
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
      },
      code: {
        coding: [{ system: KenyaAllergyCodeSystem, code: 'ORG-00001-CPT-0002015', display: 'Allergy to penicillin' }],
      },
    });
    const before = await fhir('get', `ChargeItem?context=Encounter/${encounter.id}&_total=accurate`);
    const res = await fhir('post', `Encounter/${encounter.id}/$kenya-order`).send(
      orderParams('medication', KenyaHealthProductSystem, 'AC10676', 'Ampicillin', [
        { name: 'dosageText', valueString: '1 g IV every 6 hours' },
      ])
    );
    expect(res.status).toBe(400);
    const after = await fhir('get', `ChargeItem?context=Encounter/${encounter.id}&_total=accurate`);
    expect((after.body as Bundle).total).toBe((before.body as Bundle).total);
  });

  test('orders cannot be placed in a finished encounter', async () => {
    const finished = (
      await fhir('post', 'Encounter').send({
        resourceType: 'Encounter',
        status: 'finished',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        subject: createReference(patient),
      })
    ).body;
    const res = await fhir('post', `Encounter/${finished.id}/$kenya-order`).send(
      orderParams('laboratory', KenyaInvestigationSystem, 'INV-00000399', 'CBC')
    );
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain('active encounter');
  });
});
