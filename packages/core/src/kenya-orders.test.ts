// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaHealthProductSystem, KenyaInvestigationSystem } from './kenya';
import {
  buildKenyaVitalSignObservations,
  calculateKenyaBmi,
  findKenyaOrderCategory,
  getKenyaBmiCategory,
  getKenyaOrderCategory,
  getKenyaOrderCategoryConcept,
  getKenyaOrderCodeError,
  getKenyaOrderPrice,
  KenyaOrderCategories,
} from './kenya-orders';

describe('Kenya orders', () => {
  test('all attested CPOE order categories have a department', () => {
    expect(KenyaOrderCategories.map((c) => c.code)).toEqual([
      'medication',
      'laboratory',
      'radiology',
      'physiotherapy',
      'nutrition',
      'social-work',
      'counselling',
    ]);
    expect(getKenyaOrderCategory('medication')?.department).toBe('pharmacy');
    const lab = getKenyaOrderCategory('laboratory');
    expect(findKenyaOrderCategory([getKenyaOrderCategoryConcept(lab as never)])?.code).toBe('laboratory');
  });

  test('order codes must come from the category KNHTS source', () => {
    const lab = getKenyaOrderCategory('laboratory');
    expect(
      lab && getKenyaOrderCodeError(lab, { system: KenyaInvestigationSystem, code: 'INV-00000399' })
    ).toBeUndefined();
    expect(lab && getKenyaOrderCodeError(lab, { system: 'http://loinc.org', code: '718-7' })).toContain('KNHTS');
    expect(lab && getKenyaOrderCodeError(lab, undefined)).toContain('needs a code');
  });

  test('price list lookup', () => {
    const settings = [
      {
        name: 'kenyaPriceList',
        valueString: JSON.stringify({ PH12907: 15, [`${KenyaInvestigationSystem}|INV-1`]: 800 }),
      },
    ];
    expect(getKenyaOrderPrice(settings, { system: KenyaHealthProductSystem, code: 'PH12907' })).toBe(15);
    expect(getKenyaOrderPrice(settings, { system: KenyaInvestigationSystem, code: 'INV-1' })).toBe(800);
    expect(getKenyaOrderPrice(settings, { code: 'nope' })).toBeUndefined();
    expect(
      getKenyaOrderPrice([{ name: 'kenyaPriceList', valueString: 'not json' }], { code: 'PH12907' })
    ).toBeUndefined();
  });

  test('BMI', () => {
    expect(calculateKenyaBmi(70, 175)).toBe(22.9);
    expect(calculateKenyaBmi(70, undefined)).toBeUndefined();
    expect(getKenyaBmiCategory(17)).toBe('Underweight');
    expect(getKenyaBmiCategory(31)).toBe('Obese');
  });

  test('vital-sign observations: BP panel, single readings and BMI', () => {
    const base = { subject: { reference: 'Patient/p' }, effectiveDateTime: '2026-11-04T08:00:00Z' };
    const obs = buildKenyaVitalSignObservations(
      { systolic: 120, diastolic: 80, weight: 70, height: 175, pulse: 72 },
      base
    );
    expect(obs.map((o) => o.code?.coding?.[0]?.code)).toEqual(['85354-9', '8867-4', '29463-7', '8302-2', '39156-5']);
    expect(obs[0].component?.map((c) => c.valueQuantity?.value)).toEqual([120, 80]);
    expect(obs.at(-1)?.interpretation?.[0]?.text).toBe('Normal weight');
    expect(
      buildKenyaVitalSignObservations({ weight: 20, height: 110 }, base, false).at(-1)?.interpretation
    ).toBeUndefined();
  });
});
