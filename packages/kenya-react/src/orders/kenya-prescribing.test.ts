// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { suggestKenyaDispenseQuantity, suggestKenyaDoseDefaults } from './kenya-prescribing';

describe('Kenya prescribing helpers', () => {
  test('route and unit come from the KNHTS product name', () => {
    expect(suggestKenyaDoseDefaults('Amoxicillin 500 mg Oral Capsule')).toEqual({ route: 'RT10025', unit: 'capsule' });
    expect(suggestKenyaDoseDefaults('Metformin 500 mg Oral Tablet')).toEqual({ route: 'RT10025', unit: 'tablet' });
    expect(suggestKenyaDoseDefaults('Paracetamol 120 mg/5 mL Oral Suspension')).toEqual({ route: 'RT10025', unit: 'mL' });
    expect(suggestKenyaDoseDefaults('Hydrocortisone 1% Topical Cream')).toEqual({ route: 'RT10031', unit: 'application' });
    expect(suggestKenyaDoseDefaults('Salbutamol 100 mcg Inhaler')).toEqual({ route: 'RT10007', unit: 'puff' });
    expect(suggestKenyaDoseDefaults(undefined)).toEqual({ route: undefined, unit: undefined });
  });

  test('quantity to dispense for countable units', () => {
    expect(suggestKenyaDispenseQuantity(1, 'capsule', 'TDS', 5)).toBe(15);
    expect(suggestKenyaDispenseQuantity(2, 'tablet', 'BD', 30)).toBe(120);
    expect(suggestKenyaDispenseQuantity(1, 'tablet', 'Q8H', 7)).toBe(21);
    expect(suggestKenyaDispenseQuantity(1, 'tablet', 'WEEKLY', 28)).toBe(4);
    expect(suggestKenyaDispenseQuantity(2, 'tablet', 'STAT', undefined)).toBe(2);
    expect(suggestKenyaDispenseQuantity(1.5, 'tablet', 'OD', 3)).toBe(5);
    // Not countable, or not enough to go on: the prescriber types it
    expect(suggestKenyaDispenseQuantity(500, 'mg', 'TDS', 5)).toBeUndefined();
    expect(suggestKenyaDispenseQuantity(1, 'tablet', 'TDS', undefined)).toBeUndefined();
    expect(suggestKenyaDispenseQuantity(undefined, 'tablet', 'TDS', 5)).toBeUndefined();
  });
});
