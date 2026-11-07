// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ContentType, createReference, KenyaInvestigationSystem } from '@medplum/core';
import type { Encounter, Invoice, OperationOutcome, Organization, Parameters, Patient, PaymentNotice } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import {
  DhaPaymentMethodSystem,
  KenyaInvoicePaymentExtension,
  KenyaReceiptNumberSystem,
} from '../../country-pack/kenya/invoice-payment';
import { createTestProject } from '../../test.setup';

const app = express();
let accessToken: string;
let patient: Patient;
let facility: Organization;

function fhir(method: 'get' | 'post', path: string): request.Test {
  const agent = request(app);
  const req = agent[method](`/fhir/R4/${path}`);
  return req.set('Authorization', 'Bearer ' + accessToken).set('Content-Type', ContentType.FHIR_JSON);
}

function out(res: request.Response, name: string): NonNullable<Parameters['parameter']>[number] | undefined {
  return (res.body as Parameters).parameter?.find((p) => p.name === name);
}

/**
 * An issued bill of KES 800 (one lab test).
 * @returns The Invoice.
 */
async function newBill(): Promise<Invoice> {
  const encounter: Encounter = (
    await fhir('post', 'Encounter').send({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
      subject: createReference(patient),
      serviceProvider: createReference(facility),
    })
  ).body;
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

function pay(invoice: Invoice, method: string, amount: number, transactionRef?: string): request.Test {
  const parameter: Parameters['parameter'] = [
    { name: 'method', valueCode: method },
    { name: 'amount', valueDecimal: amount },
  ];
  if (transactionRef) {
    parameter.push({ name: 'transactionRef', valueString: transactionRef });
  }
  return fhir('post', `Invoice/${invoice.id}/$kenya-payment`).send({ resourceType: 'Parameters', parameter });
}

describe('Kenya patient payments against a bill ($kenya-payment)', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const result = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: {
        name: 'Kenya payments',
        setting: [
          { name: 'countryPack', valueString: 'kenya' },
          { name: 'kenyaPriceList', valueString: JSON.stringify({ 'INV-00000399': 800 }) },
        ],
      },
    });
    accessToken = result.accessToken;
    patient = (await fhir('post', 'Patient').send({ resourceType: 'Patient', gender: 'male', birthDate: '1985-02-11' })).body;
    facility = (await fhir('post', 'Organization').send({ resourceType: 'Organization', name: 'Afiax Demo Clinic' })).body;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('a part payment then the rest: receipts, balance, and the bill becomes balanced', async () => {
    const bill = await newBill();

    const first = await pay(bill, 'cash', 300);
    expect(first.status).toBe(200);
    expect(out(first, 'receiptNumber')?.valueString).toMatch(/^RCT-\d{8}-[0-9A-F]{6}$/);
    expect(out(first, 'paid')?.valueMoney).toEqual({ value: 300, currency: 'KES' });
    expect(out(first, 'balance')?.valueMoney).toEqual({ value: 500, currency: 'KES' });
    expect(((await fhir('get', `Invoice/${bill.id}`)).body as Invoice).status).toBe('issued');

    const notice: PaymentNotice = (await fhir('get', out(first, 'paymentNotice')?.valueReference?.reference as string)).body;
    // The elements DHA's ke-eclaims-paymentnotice requires
    expect(notice).toMatchObject({
      status: 'active',
      request: { reference: `Invoice/${bill.id}` },
      provider: { reference: `Organization/${facility.id}` },
      payee: { reference: `Organization/${facility.id}` },
      amount: { value: 300, currency: 'KES' },
      paymentStatus: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/paymentstatus', code: 'paid', display: 'Paid' }] },
    });
    expect(notice.identifier?.[0]?.system).toBe(KenyaReceiptNumberSystem);
    expect(notice.paymentDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const method = notice.extension?.find((e) => e.url === KenyaInvoicePaymentExtension)?.extension?.find((e) => e.url === 'method');
    expect(method?.valueCoding).toMatchObject({ system: DhaPaymentMethodSystem, code: 'CASH' });

    const second = await pay(bill, 'mpesa-manual', 500, 'TK8H2XYZ9Q');
    expect(second.status).toBe(200);
    expect(out(second, 'balance')?.valueMoney).toEqual({ value: 0, currency: 'KES' });
    expect(((await fhir('get', `Invoice/${bill.id}`)).body as Invoice).status).toBe('balanced');

    const again = await pay(bill, 'cash', 1);
    expect(again.status).toBe(400);
    expect((again.body as OperationOutcome).issue?.[0]?.details?.text).toContain('already paid in full');
  });

  test('refuses overpayment, zero amounts, and M-Pesa or card without a reference', async () => {
    const bill = await newBill();

    const over = await pay(bill, 'cash', 800.01);
    expect(over.status).toBe(400);
    expect((over.body as OperationOutcome).issue?.[0]?.details?.text).toContain('more than the balance');

    expect((await pay(bill, 'cash', 0)).status).toBe(400);

    const mpesa = await pay(bill, 'mpesa-manual', 100);
    expect(mpesa.status).toBe(400);
    expect((mpesa.body as OperationOutcome).issue?.[0]?.details?.text).toContain('M-Pesa confirmation');

    const card = await pay(bill, 'card', 100);
    expect(card.status).toBe(400);
    expect((card.body as OperationOutcome).issue?.[0]?.details?.text).toContain('card authorisation');

    expect((await pay(bill, 'cheque', 100)).status).toBe(400);
    expect(((await fhir('get', `Invoice/${bill.id}`)).body as Invoice).status).toBe('issued');
  });
});
