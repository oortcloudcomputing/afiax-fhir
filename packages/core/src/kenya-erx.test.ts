// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationRequest } from '@medplum/fhirtypes';
import {
  buildKenyaDosage,
  buildKenyaPrescriptionIdentifiers,
  DhaGenericProductSystem,
  DhaRouteSystem,
  formatKenyaDose,
  generateKenyaPrescriptionCode,
  getDhaGenericProductCoding,
  getKenyaErxCategoryConcept,
  getKenyaErxCategoryForEncounter,
  getKenyaErxConformanceGaps,
  getKenyaPrescriptionCode,
  getKenyaStructuredDoseError,
  KenyaPrescriptionCodeSystem,
  KenyaRoutes,
  normalizeKenyaPrescriptionCode,
} from './kenya-erx';

describe('Kenya e-prescribing (DHA eRx IG)', () => {
  test('structured dose is validated', () => {
    const ok = { doseValue: 500, doseUnit: 'mg', frequency: 'TDS', route: 'RT10025', durationDays: 5 };
    expect(getKenyaStructuredDoseError(ok)).toBeUndefined();
    expect(getKenyaStructuredDoseError({ ...ok, doseValue: 0 })).toContain('greater than zero');
    expect(getKenyaStructuredDoseError({ ...ok, doseUnit: 'spoon' })).toContain('dose unit');
    expect(getKenyaStructuredDoseError({ ...ok, frequency: 'XYZ' })).toContain('frequency');
    expect(getKenyaStructuredDoseError({ ...ok, route: '26643006' })).toContain('RT');
    expect(getKenyaStructuredDoseError({ ...ok, durationDays: 2.5 })).toContain('whole number');
  });

  test('dose in words', () => {
    expect(formatKenyaDose({ doseValue: 500, doseUnit: 'mg', frequency: 'TDS', route: 'RT10025', durationDays: 5 })).toBe(
      '500 mg oral three times daily for 5 days'
    );
    expect(formatKenyaDose({ doseValue: 2, doseUnit: 'tablet', frequency: 'BD', route: 'RT10025', durationDays: 1 })).toBe(
      '2 tablets oral twice daily for 1 day'
    );
    expect(formatKenyaDose({ doseValue: 1, doseUnit: 'g', frequency: 'STAT', route: 'RT10036', durationDays: 5 })).toBe(
      '1 g intravenous immediately, as a single dose'
    );
  });

  test('dosage matches the shape of DHA sample prescriptions', () => {
    const dosage = buildKenyaDosage({ doseValue: 500, doseUnit: 'mg', frequency: 'OD', route: 'RT10025', durationDays: 3 });
    expect(dosage.timing?.repeat).toMatchObject({ frequency: 1, period: 1, periodUnit: 'd', duration: 3, durationUnit: 'd' });
    expect(dosage.timing?.code?.coding?.[0]?.code).toBe('QD');
    expect(dosage.route?.coding?.[0]).toEqual({ system: DhaRouteSystem, code: 'RT10025', display: 'Oral' });
    expect(dosage.doseAndRate?.[0]?.doseQuantity).toEqual({
      value: 500,
      unit: 'mg',
      system: 'http://unitsofmeasure.org',
      code: 'mg',
    });

    const tablets = buildKenyaDosage({
      doseValue: 1,
      doseUnit: 'tablet',
      frequency: 'STAT',
      route: 'RT10025',
      text: 'Take one now',
    });
    expect(tablets.text).toBe('Take one now');
    expect(tablets.timing?.repeat).toMatchObject({ count: 1, periodUnit: 'd' });
    expect(tablets.timing?.repeat?.duration).toBeUndefined();
    expect(tablets.doseAndRate?.[0]?.doseQuantity?.code).toBe('1');
  });

  test('every DHA route has an RT code', () => {
    expect(KenyaRoutes).toHaveLength(38);
    expect(KenyaRoutes.every((r) => /^RT\d{5}$/.test(r.code))).toBe(true);
    expect(new Set(KenyaRoutes.map((r) => r.code)).size).toBe(38);
  });

  test('category from the encounter', () => {
    expect(getKenyaErxCategoryForEncounter({ code: 'IMP' })).toBe('inpatient');
    expect(getKenyaErxCategoryForEncounter({ code: 'AMB' })).toBe('outpatient');
    expect(getKenyaErxCategoryForEncounter(undefined)).toBe('outpatient');
    expect(getKenyaErxCategoryConcept('discharge').coding?.[0]?.code).toBe('discharge');
  });

  test('DHA generic coding only for generics', () => {
    expect(getDhaGenericProductCoding({ code: 'GE10002', display: 'Metformin 500 mg Oral Tablet' })).toEqual({
      system: DhaGenericProductSystem,
      code: 'GE10002',
      display: 'Metformin 500 mg Oral Tablet',
    });
    expect(getDhaGenericProductCoding({ code: 'PH12907' })).toBeUndefined();
    expect(getDhaGenericProductCoding({ code: 'AC10001' })).toBeUndefined();
  });

  test('prescription codes are readable and survive retyping', () => {
    const code = generateKenyaPrescriptionCode(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 31]));
    expect(code).toBe('RX-0123-4567-8Z');
    expect(generateKenyaPrescriptionCode()).toMatch(/^RX-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{2}$/);
    expect(normalizeKenyaPrescriptionCode('rx 0123 4567 8z')).toBe('RX-0123-4567-8Z');
    expect(normalizeKenyaPrescriptionCode('RX-O123-4567-8Z')).toBe('RX-0123-4567-8Z');
    expect(normalizeKenyaPrescriptionCode('RX-L123-4567-8Z')).toBe('RX-1123-4567-8Z');
    expect(normalizeKenyaPrescriptionCode('RX-0123')).toBeUndefined();
    expect(normalizeKenyaPrescriptionCode('RX-0123-4567-8U')).toBeUndefined();
  });

  test('conformance gaps', () => {
    const conformant: MedicationRequest = {
      resourceType: 'MedicationRequest',
      identifier: buildKenyaPrescriptionIdentifiers('8f14e45f-ceea-467f-a0e6-2f3b4c5d6e7f', 'RX-0123-4567-8Z'),
      status: 'active',
      intent: 'order',
      category: [getKenyaErxCategoryConcept('outpatient')],
      medicationCodeableConcept: { coding: [{ system: DhaGenericProductSystem, code: 'GE10002' }] },
      subject: { reference: 'Patient/1' },
      authoredOn: '2026-11-18T08:00:00Z',
      requester: { reference: 'Practitioner/1' },
      dosageInstruction: [
        buildKenyaDosage({ doseValue: 500, doseUnit: 'mg', frequency: 'BD', route: 'RT10025', durationDays: 30 }),
      ],
      dispenseRequest: { quantity: { value: 60 } },
    };
    expect(getKenyaErxConformanceGaps(conformant)).toEqual([]);
    expect(getKenyaPrescriptionCode(conformant)).toBe('RX-0123-4567-8Z');
    expect(conformant.identifier?.[0]?.value).toBe('urn:uuid:8f14e45f-ceea-467f-a0e6-2f3b4c5d6e7f');
    expect(conformant.identifier?.[1]?.system).toBe(KenyaPrescriptionCodeSystem);

    const textOnly: MedicationRequest = {
      ...conformant,
      identifier: undefined,
      dosageInstruction: [{ text: '500 mg twice daily' }],
      dispenseRequest: undefined,
    };
    expect(getKenyaErxConformanceGaps(textOnly)).toEqual([
      'identifier',
      'dosageInstruction.timing.repeat.periodUnit',
      'dosageInstruction.route (DHA route-of-administration)',
      'dosageInstruction.doseAndRate.doseQuantity',
      'dispenseRequest.quantity',
    ]);
  });
});
