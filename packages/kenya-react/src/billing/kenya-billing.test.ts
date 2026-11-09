// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaIcd11System, KenyaShaInterventionSystem } from '@medplum/core';
import type { ChargeItem, Claim, Condition, Coverage, Encounter, Invoice, Patient } from '@medplum/fhirtypes';
import { buildKenyaShaClaim, buildKenyaShaCoverage, getVisitClaims, getVisitInvoices } from './kenya-billing';

const patient: Patient = { resourceType: 'Patient', id: 'p1', name: [{ given: ['Akinyi'], family: 'Odhiambo' }] };
const encounter: Encounter = {
  resourceType: 'Encounter',
  id: 'e1',
  status: 'finished',
  class: { code: 'AMB' },
  period: { start: '2026-11-08T08:00:00Z', end: '2026-11-08T09:00:00Z' },
};

describe('Kenya billing builders', () => {
  test('SHA cover: SHA is the payor, the patient is beneficiary and subscriber', () => {
    const coverage = buildKenyaShaCoverage(
      patient,
      { resourceType: 'Organization', id: 'sha', name: 'Social Health Authority' },
      'National ID',
      ' 12345678 '
    );
    expect(coverage).toMatchObject({
      status: 'active',
      payor: [{ reference: 'Organization/sha', display: 'Social Health Authority' }],
      beneficiary: { reference: 'Patient/p1', display: 'Akinyi Odhiambo' },
      subscriber: { reference: 'Patient/p1' },
      relationship: { coding: [{ code: 'self' }] },
    });
    expect(coverage.identifier?.[0].value).toBe('12345678');
  });

  test('SHA claim: one line per charge under its SHA code, ICD-11 diagnoses, facility as provider', () => {
    const charge = (id: string, text: string, value: number, quantity = 1): ChargeItem => ({
      resourceType: 'ChargeItem',
      id,
      status: 'billed',
      code: { text },
      subject: { reference: 'Patient/p1' },
      quantity: { value: quantity },
      priceOverride: { value, currency: 'KES' },
    });
    const coverage: Coverage = {
      resourceType: 'Coverage',
      id: 'c1',
      status: 'active',
      beneficiary: { reference: 'Patient/p1' },
      payor: [{ reference: 'Organization/sha' }],
    };
    const malaria: Condition = {
      resourceType: 'Condition',
      subject: { reference: 'Patient/p1' },
      code: { coding: [{ system: KenyaIcd11System, code: '1F40.Z', display: 'Malaria, unspecified' }] },
    };
    const consult = { system: KenyaShaInterventionSystem, code: 'SHA-01-001', display: 'Outpatient consultation' };
    const claim = buildKenyaShaClaim({
      patient,
      encounter,
      facility: { reference: 'Organization/facility' },
      practitioner: { reference: 'Practitioner/dr1' },
      coverage,
      diagnoses: [malaria],
      lines: [
        { charge: charge('ch1', 'Consultation', 500), shaCode: consult },
        { charge: charge('ch2', 'Artemether-lumefantrine', 600, 24), shaCode: consult },
      ],
    });
    expect(claim).toMatchObject({
      use: 'claim',
      status: 'active',
      provider: { reference: 'Organization/facility' },
      insurer: { reference: 'Organization/sha' },
      careTeam: [{ sequence: 1, provider: { reference: 'Practitioner/dr1' } }],
      insurance: [{ focal: true, coverage: { reference: 'Coverage/c1' } }],
      billablePeriod: { start: '2026-11-08T08:00:00Z', end: '2026-11-08T09:00:00Z' },
      diagnosis: [{ sequence: 1, diagnosisCodeableConcept: { coding: [{ code: '1F40.Z' }] } }],
      total: { value: 1100, currency: 'KES' },
    });
    expect(claim.item?.[1]).toMatchObject({
      sequence: 2,
      productOrService: { coding: [consult] },
      category: { text: 'Artemether-lumefantrine' },
      quantity: { value: 24 },
      unitPrice: { value: 25 },
      net: { value: 600 },
      encounter: [{ reference: 'Encounter/e1' }],
    });
  });

  test('visit invoices and claims', () => {
    const invoices = [
      { resourceType: 'Invoice', id: 'i1', lineItem: [{ chargeItemReference: { reference: 'ChargeItem/ch1' } }] },
      { resourceType: 'Invoice', id: 'i2', note: [{ text: 'Bill for Encounter/e1' }] },
      { resourceType: 'Invoice', id: 'i3', lineItem: [{ chargeItemReference: { reference: 'ChargeItem/x' } }] },
    ] as Invoice[];
    expect(
      getVisitInvoices(invoices, [{ resourceType: 'ChargeItem', id: 'ch1' } as ChargeItem], 'Encounter/e1')
        .map((i) => i.id)
        .sort()
    ).toEqual(['i1', 'i2']);
    const claims = [
      { resourceType: 'Claim', id: 'a', use: 'preauthorization', created: '2026-11-08' },
      { resourceType: 'Claim', id: 'b', use: 'claim', created: '2026-11-07' },
      { resourceType: 'Claim', id: 'c', use: 'claim', created: '2026-11-08' },
      { resourceType: 'Claim', id: 'd', use: 'claim', status: 'entered-in-error', created: '2026-11-09' },
    ] as Claim[];
    expect(getVisitClaims(claims).map((c) => c.id)).toEqual(['c', 'b']);
  });
});
