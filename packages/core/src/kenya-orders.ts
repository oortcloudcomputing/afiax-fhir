// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya computerised provider order entry (CPOE, DHA certification FUNC-CPOE-001).
//
// Each order category is coded from its KNHTS source and routed to a department queue:
//   medication            -> MedicationRequest, KNHTS MOH-PPB HPT          -> pharmacy
//   laboratory, radiology -> ServiceRequest, KNHTS MOH-PPB Investigations  -> laboratory / radiology
//   physiotherapy, nutrition, social work, counselling
//                         -> ServiceRequest, KNHTS WHO ICHI (interventions) -> the matching department
// Routing is a FHIR Task (code "fulfill") whose performerType is the department; billing is a
// ChargeItem priced from the facility price list (project setting kenyaPriceList).

import type { CodeableConcept, Coding, Observation, ProjectSetting } from '@medplum/fhirtypes';
import { KenyaHealthProductSystem, KenyaIchiSystem, KenyaInvestigationSystem } from './kenya';

/** CodeSystem for order categories (ServiceRequest.category, MedicationRequest.category). */
export const KenyaOrderCategorySystem = 'https://afiax.africa/CodeSystem/kenya-order-category';

/** CodeSystem for the departments that receive orders (Task.performerType). */
export const KenyaDepartmentSystem = 'https://afiax.africa/CodeSystem/kenya-department';

/** FHIR task code for "fulfil the focal request". */
export const FhirTaskCodeSystem = 'http://hl7.org/fhir/CodeSystem/task-code';

export type KenyaOrderCategoryCode =
  | 'medication'
  | 'laboratory'
  | 'radiology'
  | 'physiotherapy'
  | 'nutrition'
  | 'social-work'
  | 'counselling';

export type KenyaDepartmentCode =
  | 'pharmacy'
  | 'laboratory'
  | 'radiology'
  | 'physiotherapy'
  | 'nutrition'
  | 'social-work'
  | 'counselling';

export interface KenyaOrderCategory {
  readonly code: KenyaOrderCategoryCode;
  readonly display: string;
  readonly resourceType: 'MedicationRequest' | 'ServiceRequest';
  /** KNHTS code system the order is coded from. */
  readonly codeSystem: string;
  /** KNHTS Investigations domain, for laboratory and imaging. */
  readonly investigationDomain?: 'Laboratory' | 'Imaging';
  readonly department: KenyaDepartmentCode;
}

export const KenyaOrderCategories: readonly KenyaOrderCategory[] = [
  {
    code: 'medication',
    display: 'Medication',
    resourceType: 'MedicationRequest',
    codeSystem: KenyaHealthProductSystem,
    department: 'pharmacy',
  },
  {
    code: 'laboratory',
    display: 'Laboratory',
    resourceType: 'ServiceRequest',
    codeSystem: KenyaInvestigationSystem,
    investigationDomain: 'Laboratory',
    department: 'laboratory',
  },
  {
    code: 'radiology',
    display: 'Radiology',
    resourceType: 'ServiceRequest',
    codeSystem: KenyaInvestigationSystem,
    investigationDomain: 'Imaging',
    department: 'radiology',
  },
  {
    code: 'physiotherapy',
    display: 'Physiotherapy',
    resourceType: 'ServiceRequest',
    codeSystem: KenyaIchiSystem,
    department: 'physiotherapy',
  },
  {
    code: 'nutrition',
    display: 'Nutrition',
    resourceType: 'ServiceRequest',
    codeSystem: KenyaIchiSystem,
    department: 'nutrition',
  },
  {
    code: 'social-work',
    display: 'Social work',
    resourceType: 'ServiceRequest',
    codeSystem: KenyaIchiSystem,
    department: 'social-work',
  },
  {
    code: 'counselling',
    display: 'Counselling',
    resourceType: 'ServiceRequest',
    codeSystem: KenyaIchiSystem,
    department: 'counselling',
  },
];

export const KenyaDepartments: Record<KenyaDepartmentCode, string> = {
  pharmacy: 'Pharmacy',
  laboratory: 'Laboratory',
  radiology: 'Radiology',
  physiotherapy: 'Physiotherapy',
  nutrition: 'Nutrition',
  'social-work': 'Social work',
  counselling: 'Counselling',
};

/**
 * Returns an order category by code.
 * @param code - The category code.
 * @returns The category.
 */
export function getKenyaOrderCategory(code: string | undefined): KenyaOrderCategory | undefined {
  return KenyaOrderCategories.find((c) => c.code === code);
}

/**
 * Returns the order category of an order resource, from its category coding.
 * @param concepts - The order's category concepts.
 * @returns The category.
 */
export function findKenyaOrderCategory(
  concepts: readonly CodeableConcept[] | undefined
): KenyaOrderCategory | undefined {
  for (const concept of concepts ?? []) {
    const coding = concept.coding?.find((c) => c.system === KenyaOrderCategorySystem);
    const category = getKenyaOrderCategory(coding?.code);
    if (category) {
      return category;
    }
  }
  return undefined;
}

/**
 * Returns the category CodeableConcept for an order.
 * @param category - The category.
 * @returns The concept.
 */
export function getKenyaOrderCategoryConcept(category: KenyaOrderCategory): CodeableConcept {
  return {
    coding: [{ system: KenyaOrderCategorySystem, code: category.code, display: category.display }],
    text: category.display,
  };
}

/**
 * Returns the department CodeableConcept (Task.performerType).
 * @param department - The department code.
 * @returns The concept.
 */
export function getKenyaDepartmentConcept(department: KenyaDepartmentCode): CodeableConcept {
  return {
    coding: [{ system: KenyaDepartmentSystem, code: department, display: KenyaDepartments[department] }],
    text: KenyaDepartments[department],
  };
}

/**
 * Checks that an order code comes from the KNHTS source of its category.
 * @param category - The order category.
 * @param coding - The order code.
 * @returns An error message, or undefined when valid.
 */
export function getKenyaOrderCodeError(category: KenyaOrderCategory, coding: Coding | undefined): string | undefined {
  if (!coding?.code) {
    return `A ${category.display.toLowerCase()} order needs a code`;
  }
  if (coding.system !== category.codeSystem) {
    return `${category.display} orders must be coded from KNHTS (${category.codeSystem}), not ${coding.system ?? 'no system'}`;
  }
  return undefined;
}

// ─── Billing ─────────────────────────────────────────────────────────────────

/** Project setting: JSON object of order code (or "system|code") to price in KES. */
export const KenyaPriceListSettingName = 'kenyaPriceList';

/**
 * Returns the facility price for an order code, in KES.
 * @param settings - The project settings.
 * @param coding - The order code.
 * @returns The price, or undefined when the code is not on the price list.
 */
export function getKenyaOrderPrice(
  settings: readonly ProjectSetting[] | undefined,
  coding: Coding | undefined
): number | undefined {
  const raw = settings?.find((s) => s.name === KenyaPriceListSettingName)?.valueString;
  if (!raw || !coding?.code) {
    return undefined;
  }
  try {
    const list = JSON.parse(raw) as Record<string, unknown>;
    const price = list[`${coding.system}|${coding.code}`] ?? list[coding.code];
    return typeof price === 'number' && price >= 0 ? price : undefined;
  } catch {
    return undefined;
  }
}

// ─── Vital signs and growth ──────────────────────────────────────────────────

const LOINC = 'http://loinc.org';
const UCUM = 'http://unitsofmeasure.org';

export interface KenyaVitalSign {
  readonly key:
    | 'systolic'
    | 'diastolic'
    | 'temperature'
    | 'pulse'
    | 'respiratoryRate'
    | 'oxygenSaturation'
    | 'weight'
    | 'height'
    | 'muac';
  readonly loinc: string;
  readonly display: string;
  readonly unit: string;
  readonly ucum: string;
}

/** Vital signs captured at triage (LOINC codes from the FHIR vital signs profile; MUAC for nutrition). */
export const KenyaVitalSigns: readonly KenyaVitalSign[] = [
  { key: 'systolic', loinc: '8480-6', display: 'Systolic blood pressure', unit: 'mmHg', ucum: 'mm[Hg]' },
  { key: 'diastolic', loinc: '8462-4', display: 'Diastolic blood pressure', unit: 'mmHg', ucum: 'mm[Hg]' },
  { key: 'temperature', loinc: '8310-5', display: 'Body temperature', unit: '°C', ucum: 'Cel' },
  { key: 'pulse', loinc: '8867-4', display: 'Heart rate', unit: 'beats/min', ucum: '/min' },
  { key: 'respiratoryRate', loinc: '9279-1', display: 'Respiratory rate', unit: 'breaths/min', ucum: '/min' },
  { key: 'oxygenSaturation', loinc: '59408-5', display: 'Oxygen saturation (pulse oximetry)', unit: '%', ucum: '%' },
  { key: 'weight', loinc: '29463-7', display: 'Body weight', unit: 'kg', ucum: 'kg' },
  { key: 'height', loinc: '8302-2', display: 'Body height', unit: 'cm', ucum: 'cm' },
  { key: 'muac', loinc: '56072-2', display: 'Mid-upper arm circumference', unit: 'cm', ucum: 'cm' },
];

export const KenyaBmiLoinc = '39156-5';
export const KenyaBloodPressurePanelLoinc = '85354-9';

/**
 * Calculates body mass index.
 * @param weightKg - Weight in kilograms.
 * @param heightCm - Height in centimetres.
 * @returns The BMI in kg/m², to one decimal place, or undefined when either value is missing.
 */
export function calculateKenyaBmi(weightKg: number | undefined, heightCm: number | undefined): number | undefined {
  if (!weightKg || !heightCm || weightKg <= 0 || heightCm <= 0) {
    return undefined;
  }
  const metres = heightCm / 100;
  return Math.round((weightKg / (metres * metres)) * 10) / 10;
}

/**
 * Returns the WHO adult BMI category.
 * @param bmi - Body mass index in kg/m².
 * @returns The category.
 */
export function getKenyaBmiCategory(bmi: number): string {
  if (bmi < 18.5) {
    return 'Underweight';
  }
  if (bmi < 25) {
    return 'Normal weight';
  }
  if (bmi < 30) {
    return 'Overweight';
  }
  return 'Obese';
}

/**
 * Builds the vital-sign Observations for a set of readings: blood pressure as one panel with
 * systolic and diastolic components, the others as single Observations, and BMI when weight and
 * height are both given.
 * @param readings - The readings, by vital sign key.
 * @param base - Fields every Observation shares (subject, encounter, effectiveDateTime, performer).
 * @param isAdult - Whether to add the WHO adult BMI category (not valid for children).
 * @returns The Observations to create.
 */
export function buildKenyaVitalSignObservations(
  readings: Partial<Record<KenyaVitalSign['key'], number>>,
  base: Pick<Observation, 'subject' | 'encounter' | 'effectiveDateTime' | 'performer'>,
  isAdult = true
): Observation[] {
  const vitalCategory = [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
          display: 'Vital Signs',
        },
      ],
    },
  ];
  const sign = (key: KenyaVitalSign['key']): KenyaVitalSign =>
    KenyaVitalSigns.find((v) => v.key === key) as KenyaVitalSign;
  const code = (loinc: string, display: string): CodeableConcept => ({
    coding: [{ system: LOINC, code: loinc, display }],
    text: display,
  });
  const quantity = (v: KenyaVitalSign, value: number): Observation['valueQuantity'] => ({
    value,
    unit: v.unit,
    system: UCUM,
    code: v.ucum,
  });

  const observations: Observation[] = [];
  const { systolic, diastolic } = readings;
  if (systolic !== undefined || diastolic !== undefined) {
    observations.push({
      resourceType: 'Observation',
      status: 'final',
      category: vitalCategory,
      code: code(KenyaBloodPressurePanelLoinc, 'Blood pressure panel'),
      ...base,
      component: (['systolic', 'diastolic'] as const)
        .filter((key) => readings[key] !== undefined)
        .map((key) => ({
          code: code(sign(key).loinc, sign(key).display),
          valueQuantity: quantity(sign(key), readings[key] as number),
        })),
    });
  }
  for (const v of KenyaVitalSigns) {
    const value = readings[v.key];
    if (value === undefined || v.key === 'systolic' || v.key === 'diastolic') {
      continue;
    }
    observations.push({
      resourceType: 'Observation',
      status: 'final',
      category: vitalCategory,
      code: code(v.loinc, v.display),
      ...base,
      valueQuantity: quantity(v, value),
    });
  }
  const bmi = calculateKenyaBmi(readings.weight, readings.height);
  if (bmi !== undefined) {
    observations.push({
      resourceType: 'Observation',
      status: 'final',
      category: vitalCategory,
      code: code(KenyaBmiLoinc, 'Body mass index'),
      ...base,
      valueQuantity: { value: bmi, unit: 'kg/m2', system: UCUM, code: 'kg/m2' },
      interpretation: isAdult ? [{ text: getKenyaBmiCategory(bmi) }] : undefined,
    });
  }
  return observations;
}

// ─── Visit types ─────────────────────────────────────────────────────────────

/** Healthcare facility encounter types (KNHTS MOH-KENYA ORG-00001-SRC-027), including MCH visits. */
export const KenyaEncounterTypes: readonly { readonly code: string; readonly display: string }[] = [
  { code: 'OPD-VISIT', display: 'Outpatient Visit' },
  { code: 'EMERGENCY-VISIT', display: 'Emergency Encounter' },
  { code: 'MCH-VISIT', display: 'Maternal and Child Health Visit' },
  { code: 'ANC-VISIT', display: 'Antenatal Visit' },
  { code: 'PNC-VISIT', display: 'Postnatal Visit' },
  { code: 'CWC-VISIT', display: 'Child Welfare Clinic' },
  { code: 'HIV-CLINIC-VISIT', display: 'HIV Clinic Visit' },
  { code: 'TB-VISIT', display: 'TB Clinic Visit' },
  { code: 'NCD-VISIT', display: 'Chronic Disease Clinic Visit' },
  { code: 'LAB-VISIT', display: 'Laboratory Encounter' },
  { code: 'PHARM-VISIT', display: 'Pharmacy Encounter' },
];

/** Family relationships for family history (HL7 v3 RoleCode). */
export const KenyaFamilyRelationships: readonly { readonly code: string; readonly display: string }[] = [
  { code: 'MTH', display: 'Mother' },
  { code: 'FTH', display: 'Father' },
  { code: 'SIS', display: 'Sister' },
  { code: 'BRO', display: 'Brother' },
  { code: 'DAU', display: 'Daughter' },
  { code: 'SON', display: 'Son' },
  { code: 'GRMTH', display: 'Grandmother' },
  { code: 'GRFTH', display: 'Grandfather' },
  { code: 'AUNT', display: 'Aunt' },
  { code: 'UNCLE', display: 'Uncle' },
];
