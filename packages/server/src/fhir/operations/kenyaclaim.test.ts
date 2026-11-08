// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, KenyaIcd11System, KenyaInvestigationSystem } from '@medplum/core';
import type {
  Claim,
  Coverage,
  Encounter,
  Invoice,
  OperationOutcome,
  Organization,
  Parameters,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import {
  DhaIcd11System,
  DhaShaInterventionSystem,
  EclaimsClaimSubmissionProfile,
  EclaimsPatientInvoiceExtension,
  KenyaClaimNumberSystem,
  parseKenyaFacilityLevel,
  shaTariffForLevel,
} from '../../country-pack/kenya/claim-from-invoice';
import { createTestProject } from '../../test.setup';

const app = express();
let accessToken: string;
let patient: Patient;
let facility: Organization;
let sha: Organization;
let doctor: Practitioner;
let coverage: Coverage;

function fhir(method: 'get' | 'post' | 'put', path: string): request.Test {
  const agent = request(app);
  const req = agent[method](`/fhir/R4/${path}`);
  return req.set('Authorization', 'Bearer ' + accessToken).set('Content-Type', ContentType.FHIR_JSON);
}

function out(res: request.Response, name: string): NonNullable<Parameters['parameter']>[number] | undefined {
  return (res.body as Parameters).parameter?.find((p) => p.name === name);
}

/**
 * An issued KES 800 bill for an outpatient encounter with a diagnosis.
 * @param diagnosed - Whether the encounter has an ICD-11 diagnosis.
 * @returns The Invoice.
 */
async function newBill(diagnosed = true): Promise<Invoice> {
  const encounter: Encounter = (
    await fhir('post', 'Encounter').send({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
      subject: createReference(patient),
      serviceProvider: createReference(facility),
      participant: [{ individual: createReference(doctor) }],
      period: { start: '2026-11-07T09:00:00+03:00', end: '2026-11-07T10:30:00+03:00' },
    })
  ).body;
  if (diagnosed) {
    await fhir('post', 'Condition').send({
      resourceType: 'Condition',
      subject: createReference(patient),
      encounter: createReference(encounter),
      code: { coding: [{ system: KenyaIcd11System, code: '1F40', display: 'Malaria due to Plasmodium falciparum' }] },
    });
  }
  const ordered = await fhir('post', `Encounter/${encounter.id}/$kenya-order`).send({
    resourceType: 'Parameters',
    parameter: [
      { name: 'category', valueCode: 'laboratory' },
      { name: 'code', valueCoding: { system: KenyaInvestigationSystem, code: 'INV-00000399' } },
    ],
  });
  expect(ordered.status).toBe(200);
  const billed = await fhir('post', `Encounter/${encounter.id}/$kenya-invoice`).send({ resourceType: 'Parameters' });
  expect(billed.status).toBe(200);
  return (await fhir('get', out(billed, 'invoice')?.valueReference?.reference as string)).body;
}

function claim(invoice: Invoice, interventions: { code: string; unitPrice?: number; quantity?: number }[]): request.Test {
  return fhir('post', `Invoice/${invoice.id}/$kenya-claim`).send({
    resourceType: 'Parameters',
    parameter: [
      { name: 'coverage', valueReference: createReference(coverage) },
      ...interventions.map((i) => ({
        name: 'intervention',
        part: [
          { name: 'code', valueCode: i.code },
          ...(i.quantity ? [{ name: 'quantity', valueDecimal: i.quantity }] : []),
          ...(i.unitPrice ? [{ name: 'unitPrice', valueDecimal: i.unitPrice }] : []),
        ],
      })),
    ],
  });
}

describe('SHA claim from a bill ($kenya-claim, DHA eClaims)', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const result = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: {
        name: 'Kenya claims',
        setting: [
          { name: 'countryPack', valueString: 'kenya' },
          { name: 'kenyaPriceList', valueString: JSON.stringify({ 'INV-00000399': 800 }) },
        ],
      },
    });
    accessToken = result.accessToken;
    patient = (await fhir('post', 'Patient').send({ resourceType: 'Patient', gender: 'female', birthDate: '1992-03-14' })).body;
    facility = (await fhir('post', 'Organization').send({ resourceType: 'Organization', name: 'Afiax Demo Clinic' })).body;
    sha = (await fhir('post', 'Organization').send({ resourceType: 'Organization', name: 'Social Health Authority' })).body;
    doctor = (
      await fhir('post', 'Practitioner').send({ resourceType: 'Practitioner', name: [{ given: ['Amina'], family: 'Otieno' }] })
    ).body;
    coverage = (
      await fhir('post', 'Coverage').send({
        resourceType: 'Coverage',
        status: 'active',
        beneficiary: createReference(patient),
        payor: [createReference(sha)],
      })
    ).body;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('builds a ke-eclaims-claimsubmission Claim with the bill as patient invoice and the share', async () => {
    const bill = await newBill();
    const res = await claim(bill, [{ code: 'SHA-12-001', unitPrice: 500 }]);
    expect(res.status).toBe(200);
    expect(out(res, 'claimed')?.valueMoney).toEqual({ value: 500, currency: 'KES' });
    expect(out(res, 'patientShare')?.valueMoney).toEqual({ value: 300, currency: 'KES' });
    expect(out(res, 'claimNumber')?.valueString).toMatch(/^CLM-\d{8}-[0-9A-F]{6}$/);

    const c: Claim = (await fhir('get', out(res, 'claim')?.valueReference?.reference as string)).body;
    expect(c.meta?.profile).toContain(EclaimsClaimSubmissionProfile);
    expect(c).toMatchObject({
      status: 'active',
      use: 'claim',
      type: { coding: [{ code: 'institutional' }] },
      subType: { coding: [{ code: 'outpatient' }] },
      patient: { reference: `Patient/${patient.id}` },
      insurer: { reference: `Organization/${sha.id}` },
      provider: { reference: `Organization/${facility.id}` },
      billablePeriod: { start: '2026-11-07', end: '2026-11-07' },
      payee: { type: { coding: [{ code: 'provider' }] } },
      careTeam: [{ sequence: 1, provider: { reference: `Practitioner/${doctor.id}` }, role: { coding: [{ code: 'PRIMARY' }] } }],
      insurance: [{ sequence: 1, focal: true, coverage: { reference: `Coverage/${coverage.id}` } }],
      total: { value: 500, currency: 'KES' },
    });
    expect(c.identifier?.find((i) => i.system === KenyaClaimNumberSystem)).toBeDefined();
    expect(c.diagnosis?.[0]?.diagnosisCodeableConcept?.coding?.map((x) => [x.system, x.code])).toEqual([
      [DhaIcd11System, '1F40'],
      [KenyaIcd11System, '1F40'],
    ]);
    expect(c.item?.[0]).toMatchObject({
      sequence: 1,
      careTeamSequence: [1],
      category: { coding: [{ code: '1' }] },
      quantity: { value: 1 },
      unitPrice: { value: 500, currency: 'KES' },
      net: { value: 500, currency: 'KES' },
    });
    expect(c.item?.[0]?.productOrService?.coding?.[0]).toMatchObject({ system: DhaShaInterventionSystem, code: 'SHA-12-001' });

    const invoiceExt = c.extension?.find((e) => e.url === EclaimsPatientInvoiceExtension)?.extension ?? [];
    const v = (url: string): unknown => invoiceExt.find((e) => e.url === url);
    expect(v('invoiceNumber')).toMatchObject({ valueString: bill.identifier?.[0]?.value });
    expect(v('invoiceAmount')).toMatchObject({ valueMoney: { value: 800, currency: 'KES' } });
    expect(v('patientShare')).toMatchObject({ valueMoney: { value: 300, currency: 'KES' } });

    // The existing SHA submission prepares its bundle from this Claim (no SHA credentials in tests)
    const submitted = await fhir('post', `Claim/${c.id}/$submit-national-claim`).send({ resourceType: 'Parameters' });
    expect(submitted.status).toBe(200);
    expect(out(submitted, 'status')?.valueCode ?? out(submitted, 'status')?.valueString).toBe('prepared');
    const bundle = JSON.parse(out(submitted, 'rawBundle')?.valueString as string);
    const sent = bundle.entry.find((e: { resource: { resourceType: string } }) => e.resource.resourceType === 'Claim').resource;
    expect(sent.meta.profile).toContain(EclaimsClaimSubmissionProfile);
    expect(sent.extension.find((e: { url: string }) => e.url === EclaimsPatientInvoiceExtension)).toBeDefined();

    // A bill is claimed once
    const again = await claim(bill, [{ code: 'SHA-12-001', unitPrice: 500 }]);
    expect(again.status).toBe(400);
    expect((again.body as OperationOutcome).issue?.[0]?.details?.text).toContain('already claimed');
  });

  test('refuses unpriced interventions, claims above the bill, and encounters without a diagnosis', async () => {
    const bill = await newBill();
    const unpriced = await claim(bill, [{ code: 'SHA-12-001' }]);
    expect(unpriced.status).toBe(400);
    expect((unpriced.body as OperationOutcome).issue?.[0]?.details?.text).toContain('enter a price: SHA-12-001');

    const over = await claim(bill, [{ code: 'SHA-12-001', unitPrice: 500, quantity: 2 }]);
    expect(over.status).toBe(400);
    expect((over.body as OperationOutcome).issue?.[0]?.details?.text).toContain('more than the bill');

    const undiagnosed = await newBill(false);
    const noDx = await claim(undiagnosed, [{ code: 'SHA-12-001', unitPrice: 100 }]);
    expect(noDx.status).toBe(400);
    expect((noDx.body as OperationOutcome).issue?.[0]?.details?.text).toContain('ICD-11 diagnosis');
  });

  test('with a claim the patient pays only their share, and the bill stays open for SHA', async () => {
    const bill = await newBill();
    expect((await claim(bill, [{ code: 'SHA-12-001', unitPrice: 500 }])).status).toBe(200);

    const pay = (amount: number): request.Test =>
      fhir('post', `Invoice/${bill.id}/$kenya-payment`).send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'method', valueCode: 'cash' },
          { name: 'amount', valueDecimal: amount },
        ],
      });
    const over = await pay(301);
    expect(over.status).toBe(400);
    expect((over.body as OperationOutcome).issue?.[0]?.details?.text).toContain('more than the balance');

    const share = await pay(300);
    expect(share.status).toBe(200);
    expect(out(share, 'claimed')?.valueMoney).toEqual({ value: 500, currency: 'KES' });
    expect(out(share, 'balance')?.valueMoney).toEqual({ value: 0, currency: 'KES' });
    // Settled only when SHA pays its part
    expect(((await fhir('get', `Invoice/${bill.id}`)).body as Invoice).status).toBe('issued');
  });

  test('cannot claim what the patient already paid', async () => {
    const bill = await newBill();
    const paid = await fhir('post', `Invoice/${bill.id}/$kenya-payment`).send({
      resourceType: 'Parameters',
      parameter: [
        { name: 'method', valueCode: 'cash' },
        { name: 'amount', valueDecimal: 600 },
      ],
    });
    expect(paid.status).toBe(200);
    const res = await claim(bill, [{ code: 'SHA-12-001', unitPrice: 500 }]);
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain('unpaid part of the bill (KES 200)');
    expect((await claim(bill, [{ code: 'SHA-12-001', unitPrice: 200 }])).status).toBe(200);
  });

  test('SHA remittance: part payments, then the bill is balanced; duplicates and overpayment refused', async () => {
    const bill = await newBill();
    const made = await claim(bill, [{ code: 'SHA-12-001', unitPrice: 500 }]);
    const claimRef = out(made, 'claim')?.valueReference as { reference: string };
    const payShare = await fhir('post', `Invoice/${bill.id}/$kenya-payment`).send({
      resourceType: 'Parameters',
      parameter: [
        { name: 'method', valueCode: 'cash' },
        { name: 'amount', valueDecimal: 300 },
      ],
    });
    expect(payShare.status).toBe(200);

    const remit = (reference: string, amount: number): request.Test =>
      fhir('post', 'PaymentReconciliation/$kenya-sha-remittance').send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'paymentReference', valueString: reference },
          { name: 'paymentDate', valueDate: '2026-11-30' },
          {
            name: 'line',
            part: [
              { name: 'claim', valueReference: claimRef },
              { name: 'amount', valueDecimal: amount },
            ],
          },
        ],
      });
    const claimOut = (res: request.Response, name: string): unknown =>
      out(res, 'claim')?.part?.find((p) => p.name === name);

    const first = await remit('SHA-PAY-0001', 200);
    expect(first.status).toBe(200);
    expect(out(first, 'total')?.valueMoney).toEqual({ value: 200, currency: 'KES' });
    expect(claimOut(first, 'outstanding')).toMatchObject({ valueMoney: { value: 300, currency: 'KES' } });
    expect(claimOut(first, 'billStatus')).toMatchObject({ valueCode: 'issued' });

    const pr = (await fhir('get', out(first, 'paymentReconciliation')?.valueReference?.reference as string)).body;
    expect(pr).toMatchObject({
      status: 'active',
      paymentDate: '2026-11-30',
      paymentAmount: { value: 200, currency: 'KES' },
      paymentIssuer: { reference: `Organization/${sha.id}` },
      detail: [{ request: claimRef, amount: { value: 200, currency: 'KES' } }],
    });

    const duplicate = await remit('SHA-PAY-0001', 100);
    expect(duplicate.status).toBe(400);
    expect((duplicate.body as OperationOutcome).issue?.[0]?.details?.text).toContain('already recorded');

    const over = await remit('SHA-PAY-0002', 301);
    expect(over.status).toBe(400);
    expect((over.body as OperationOutcome).issue?.[0]?.details?.text).toContain('more than what SHA still owes');

    const rest = await remit('SHA-PAY-0003', 300);
    expect(rest.status).toBe(200);
    expect(claimOut(rest, 'paid')).toMatchObject({ valueMoney: { value: 500, currency: 'KES' } });
    expect(claimOut(rest, 'outstanding')).toMatchObject({ valueMoney: { value: 0, currency: 'KES' } });
    expect(claimOut(rest, 'billStatus')).toMatchObject({ valueCode: 'balanced' });
    expect(((await fhir('get', `Invoice/${bill.id}`)).body as Invoice).status).toBe('balanced');
  });

  test('tariffs come from KNHTS by facility level', () => {
    expect(parseKenyaFacilityLevel('Level 4')).toBe(4);
    expect(parseKenyaFacilityLevel('LEVEL 3B')).toBe(3);
    expect(parseKenyaFacilityLevel(undefined)).toBeUndefined();
    expect(shaTariffForLevel({ level_4_tariff: '2500', level_3_tariff: 0 }, 4)).toBe(2500);
    expect(shaTariffForLevel({ level_3_tariff: 0 }, 3)).toBeUndefined();
    expect(shaTariffForLevel(undefined, 4)).toBeUndefined();
  });
});
