// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  createReference,
  DhaGenericProductSystem,
  getKenyaErxConformanceGaps,
  getKenyaPrescriptionCode,
  KenyaAllergyCodeSystem,
  KenyaDepartmentSystem,
  KenyaHealthProductSystem,
  KenyaIchiSystem,
  KenyaErxMedicationRequestProfile,
  KenyaInvestigationSystem,
  KenyaPrescriptionCodeSystem,
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
import { buildKenyaPrescriptionDocument, isPrintableKenyaPrescription } from '../../country-pack/kenya/prescription-pdf';
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

  test('a structured prescription conforms to the DHA eRx profile', async () => {
    const res = await fhir('post', `Encounter/${encounter.id}/$kenya-order`).send(
      orderParams('medication', KenyaHealthProductSystem, 'GE10002', 'Metformin 500 mg Oral Tablet', [
        { name: 'doseValue', valueDecimal: 1 },
        { name: 'doseUnit', valueCode: 'tablet' },
        { name: 'frequency', valueCode: 'BD' },
        { name: 'route', valueCode: 'RT10025' },
        { name: 'quantity', valueDecimal: 60 },
        { name: 'durationDays', valueInteger: 30 },
      ])
    );
    expect(res.status).toBe(200);
    const order: MedicationRequest = (await fhir('get', output(res.body, 'order') as string)).body;
    expect(order.meta?.profile).toEqual([KenyaErxMedicationRequestProfile]);
    expect(getKenyaErxConformanceGaps(order)).toEqual([]);
    expect(order.identifier?.[0]?.value).toMatch(/^urn:uuid:[0-9a-f-]{36}$/);
    expect(getKenyaPrescriptionCode(order)).toMatch(/^RX-/);
    expect(order.category?.map((c) => c.coding?.[0]?.code)).toEqual(['medication', 'outpatient']);
    expect(order.medicationCodeableConcept?.coding?.map((c) => c.system)).toEqual([
      KenyaHealthProductSystem,
      DhaGenericProductSystem,
    ]);
    expect(order.dosageInstruction?.[0]?.text).toBe('1 tablet oral twice daily for 30 days');
    expect(order.dosageInstruction?.[0]?.route?.coding?.[0]?.code).toBe('RT10025');
    expect(order.dispenseRequest?.quantity).toMatchObject({ value: 60, unit: 'tablet', code: '1' });
    expect(order.dispenseRequest?.validityPeriod?.start).toBe(order.authoredOn?.slice(0, 10));

    // Findable by its prescription code, as a pharmacy will look it up
    const found = await fhir(
      'get',
      `MedicationRequest?identifier=${encodeURIComponent(`${KenyaPrescriptionCodeSystem}|${getKenyaPrescriptionCode(order)}`)}`
    );
    expect((found.body as Bundle).entry?.map((e) => e.resource?.id)).toEqual([order.id]);
  });

  test('a free-text-only prescription is accepted but does not claim the profile', async () => {
    const res = await fhir('post', `Encounter/${encounter.id}/$kenya-order`).send(
      orderParams('medication', KenyaHealthProductSystem, 'GE10002', 'Metformin 500 mg Oral Tablet', [
        { name: 'dosageText', valueString: '500 mg twice daily' },
      ])
    );
    expect(res.status).toBe(200);
    const order: MedicationRequest = (await fhir('get', output(res.body, 'order') as string)).body;
    expect(order.meta?.profile).toBeUndefined();
    expect(getKenyaPrescriptionCode(order)).toMatch(/^RX-/);
  });

  test('a structured dose must be complete and use DHA codes', async () => {
    const url = `Encounter/${encounter.id}/$kenya-order`;
    const snomedRoute = await fhir('post', url).send(
      orderParams('medication', KenyaHealthProductSystem, 'GE10002', 'Metformin', [
        { name: 'doseValue', valueDecimal: 500 },
        { name: 'doseUnit', valueCode: 'mg' },
        { name: 'frequency', valueCode: 'BD' },
        { name: 'route', valueCode: '26643006' },
      ])
    );
    expect(snomedRoute.status).toBe(400);
    expect((snomedRoute.body as OperationOutcome).issue?.[0]?.details?.text).toContain('route');

    const noFrequency = await fhir('post', url).send(
      orderParams('medication', KenyaHealthProductSystem, 'GE10002', 'Metformin', [
        { name: 'doseValue', valueDecimal: 500 },
        { name: 'doseUnit', valueCode: 'mg' },
        { name: 'route', valueCode: 'RT10025' },
      ])
    );
    expect(noFrequency.status).toBe(400);
  });

  test('the visit prescription prints as a PDF with a QR code per medicine', async () => {
    const res = await fhir('get', `Encounter/${encounter.id}/$kenya-prescription`).set('Accept', 'application/pdf');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(Buffer.from(res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    // The QR codes hold the prescription codes only
    const prescriptions = (
      (await fhir('get', `MedicationRequest?encounter=Encounter/${encounter.id}&status=active`)).body as Bundle
    ).entry?.map((e) => e.resource as MedicationRequest);
    const printable = (prescriptions ?? []).filter(isPrintableKenyaPrescription);
    expect(printable.length).toBeGreaterThan(0);
    const definition = JSON.stringify(
      buildKenyaPrescriptionDocument({
        encounter,
        patient,
        requests: printable,
        prescribers: {},
        printedAt: '2026-11-19T08:00:00.000Z',
      })
    );
    const qrs = [...definition.matchAll(/"qr":"([^"]+)"/g)].map((m) => m[1]);
    expect(qrs).toEqual(printable.map((p) => getKenyaPrescriptionCode(p)));
    expect(qrs.every((q) => /^RX-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{2}$/.test(q))).toBe(true);
  });

  test('a visit without prescriptions has nothing to print', async () => {
    const empty = (
      await fhir('post', 'Encounter').send({
        resourceType: 'Encounter',
        status: 'in-progress',
        class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
        subject: createReference(patient),
      })
    ).body;
    const res = await fhir('get', `Encounter/${empty.id}/$kenya-prescription`);
    expect(res.status).toBe(400);
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
