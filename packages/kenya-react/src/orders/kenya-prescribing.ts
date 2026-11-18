// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Order entry helpers for DHA eRx prescriptions (ADR-016): suggested route, dose unit and quantity.
import { getKenyaDoseUnit, getKenyaFrequency } from '@medplum/core';

// Words in a KNHTS product name ("Amoxicillin 500 mg Oral Capsule") that give its route and dose unit
const routeWords: [RegExp, string][] = [
  [/\boral\b/i, 'RT10025'],
  [/\b(intravenous|i\.?v\.?)\b/i, 'RT10036'],
  [/\bintramuscular\b/i, 'RT10013'],
  [/\bsubcutaneous\b/i, 'RT10029'],
  [/\b(injection|injectable)\b/i, 'RT10008'],
  [/\b(topical|cream|ointment|gel)\b/i, 'RT10031'],
  [/\b(inhalation|inhaler)\b/i, 'RT10007'],
  [/\b(rectal|suppositor(y|ies))\b/i, 'RT10028'],
  [/\bvaginal\b/i, 'RT10035'],
  [/\b(ophthalmic|eye)\b/i, 'RT10024'],
  [/\b(otic|ear)\b/i, 'RT10026'],
  [/\bnasal\b/i, 'RT10023'],
  [/\bsublingual\b/i, 'RT10030'],
];
const unitWords: [RegExp, string][] = [
  [/\btablets?\b/i, 'tablet'],
  [/\bcapsules?\b/i, 'capsule'],
  [/\bsuppositor(y|ies)\b/i, 'suppository'],
  [/\bsachets?\b/i, 'sachet'],
  [/\bdrops?\b/i, 'drop'],
  [/\binhaler\b/i, 'puff'],
  [/\b(cream|ointment|gel)\b/i, 'application'],
  [/\b(syrup|suspension|solution|injection)\b/i, 'mL'],
];

/**
 * Suggests a route and dose unit from a KNHTS product name. The prescriber can change both.
 * @param display - The product name.
 * @returns The suggested route and unit codes.
 */
export function suggestKenyaDoseDefaults(display: string | undefined): { route?: string; unit?: string } {
  const text = display ?? '';
  return {
    route: routeWords.find(([re]) => re.test(text))?.[1],
    unit: unitWords.find(([re]) => re.test(text))?.[1],
  };
}

/**
 * Suggests the quantity to dispense for a countable unit: dose x doses per day x days, rounded up.
 * @param doseValue - Amount per dose.
 * @param unitCode - Dose unit.
 * @param frequencyCode - Frequency.
 * @param days - Course length.
 * @returns The quantity, or undefined when it cannot be worked out.
 */
export function suggestKenyaDispenseQuantity(
  doseValue: number | undefined,
  unitCode: string,
  frequencyCode: string,
  days: number | undefined
): number | undefined {
  const unit = getKenyaDoseUnit(unitCode);
  const frequency = getKenyaFrequency(frequencyCode);
  if (!unit?.countable || !frequency || !doseValue) {
    return undefined;
  }
  if (frequency.once) {
    return Math.ceil(doseValue);
  }
  if (!days) {
    return undefined;
  }
  const hours = { h: 1, d: 24, wk: 168 }[frequency.periodUnit] * frequency.period;
  return Math.ceil(doseValue * frequency.frequency * ((days * 24) / hours));
}
