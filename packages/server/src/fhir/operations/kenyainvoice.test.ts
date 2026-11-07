// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, KenyaHealthProductSystem, KenyaInvestigationSystem } from '@medplum/core';
import type { ChargeItem, Encounter, Invoice, OperationOutcome, Organization, Parameters, Patient } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { KenyaInvoiceNumberSystem } from '../../country-pack/kenya/invoice';
import { createTestProject } from '../../test.setup';

const app = express();
let accessToken: string;
let patient: Patient;
let facility: Organization;

function fhir(method: 'get' | 'post' | 'put', path: string): request.Test {
  const agent = request(app);
  const req = agent[method](`/fhir/R4/${path}`);
  return req.set('Authorization', 'Bearer ' + accessToken).set('Content-Type', ContentType.FHIR_JSON);
}

async function newEncounter(status: Encounter['status'] = 'in-progress'): Promise<Encounter> {
  return (
    await fhir('post', 'Encounter').send({
      resourceType: 'Encounter',
      status,
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
      subject: createReference(patient),
      serviceProvider: createReference(facility),
    })
  ).body;
}

async function order(encounter: Encounter, category: string, system: string, code: string, quantity?: number): Promise<string> {
  const parameter: Parameters['parameter'] = [
    { name: 'category', valueCode: category },
    { name: 'code', valueCoding: { system, code } },
  ];
  if (category === 'medication') {
    parameter.push({ name: 'dosageText', valueString: '500 mg three times daily for 5 days' });
  }
  if (quantity) {
    parameter.push({ name: 'quantity', valueDecimal: quantity });
  }
  const res = await fhir('post', `Encounter/${encounter.id}/$kenya-order`).send({ resourceType: 'Parameters', parameter });
  expect(res.status).toBe(200);
  return (res.body as Parameters).parameter?.find((p) => p.name === 'chargeItem')?.valueReference?.reference as string;
}

async function bill(encounter: Encounter): Promise<request.Response> {
  return fhir('post', `Encounter/${encounter.id}/$kenya-invoice`).send({ resourceType: 'Parameters' });
}

function invoiceRef(res: request.Response): string {
  return (res.body as Parameters).parameter?.find((p) => p.name === 'invoice')?.valueReference?.reference as string;
}

describe('Kenya encounter billing ($kenya-invoice)', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const result = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: {
        name: 'Kenya billing',
        setting: [
          { name: 'countryPack', valueString: 'kenya' },
          { name: 'kenyaPriceList', valueString: JSON.stringify({ 'INV-00000399': 800, PH12907: 15 }) },
        ],
      },
    });
    accessToken = result.accessToken;
    patient = (await fhir('post', 'Patient').send({ resourceType: 'Patient', gender: 'female', birthDate: '1990-05-01' }))
      .body;
    facility = (await fhir('post', 'Organization').send({ resourceType: 'Organization', name: 'Afiax Demo Clinic' })).body;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test("issues one Invoice for the encounter's charges and marks them billed", async () => {
    const encounter = await newEncounter();
    const lab = await order(encounter, 'laboratory', KenyaInvestigationSystem, 'INV-00000399');
    const drug = await order(encounter, 'medication', KenyaHealthProductSystem, 'PH12907', 21);

    const res = await bill(encounter);
    expect(res.status).toBe(200);
    const total = (res.body as Parameters).parameter?.find((p) => p.name === 'total')?.valueMoney;
    expect(total).toEqual({ value: 1115, currency: 'KES' }); // 800 + 21 × 15

    const invoice: Invoice = (await fhir('get', invoiceRef(res))).body;
    expect(invoice).toMatchObject({
      status: 'issued',
      subject: { reference: `Patient/${patient.id}` },
      recipient: { reference: `Patient/${patient.id}` },
      issuer: { reference: `Organization/${facility.id}` },
      totalNet: { value: 1115, currency: 'KES' },
      totalGross: { value: 1115, currency: 'KES' },
    });
    expect(invoice.identifier?.[0]).toMatchObject({ system: KenyaInvoiceNumberSystem });
    expect(invoice.identifier?.[0]?.value).toMatch(/^INV-\d{8}-[0-9A-F]{6}$/);
    expect(invoice.lineItem?.map((l) => [l.sequence, l.chargeItemReference?.reference, l.priceComponent?.[0]?.amount?.value])).toEqual([
      [1, lab, 800],
      [2, drug, 315],
    ]);

    for (const ref of [lab, drug]) {
      expect(((await fhir('get', ref)).body as ChargeItem).status).toBe('billed');
    }
  });

  test('bills only charges added since the last bill, and refuses when nothing is left', async () => {
    const encounter = await newEncounter();
    await order(encounter, 'laboratory', KenyaInvestigationSystem, 'INV-00000399');
    const first = await bill(encounter);
    expect(first.status).toBe(200);

    const again = await bill(encounter);
    expect(again.status).toBe(400);
    expect((again.body as OperationOutcome).issue?.[0]?.details?.text).toContain('no unbilled charges');

    const later = await order(encounter, 'medication', KenyaHealthProductSystem, 'PH12907', 10);
    const second = await bill(encounter);
    expect(second.status).toBe(200);
    expect(invoiceRef(second)).not.toBe(invoiceRef(first));
    const invoice: Invoice = (await fhir('get', invoiceRef(second))).body;
    expect(invoice.lineItem?.map((l) => l.chargeItemReference?.reference)).toEqual([later]);
    expect(invoice.totalGross?.value).toBe(150);
  });

  test('refuses unpriced charges, naming them, and bills once a price is set', async () => {
    const encounter = await newEncounter();
    const xray = await order(encounter, 'radiology', KenyaInvestigationSystem, 'INV-00001296');

    const res = await bill(encounter);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain('INV-00001296');
    expect(((await fhir('get', xray)).body as ChargeItem).status).toBe('billable');

    // The cashier sets the price; then the bill goes through
    const charge: ChargeItem = (await fhir('get', xray)).body;
    await fhir('put', xray).send({ ...charge, priceOverride: { value: 2500, currency: 'KES' } });
    const ok = await bill(encounter);
    expect(ok.status).toBe(200);
    expect(((await fhir('get', invoiceRef(ok))).body as Invoice).totalGross?.value).toBe(2500);
  });

  test('a planned or cancelled encounter cannot be billed', async () => {
    const encounter = await newEncounter('cancelled');
    const res = await bill(encounter);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain('cancelled encounter cannot be billed');
  });
});
