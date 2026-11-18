// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya e-prescribing to the DHA Kenya ePrescription Implementation Guide 0.1.0
// (https://fhir.dha.go.ke/erx/ImplementationGuide/ke.fhir.eprescription; ADR-016).
//
// ke-medication-request requires a unique prescription identifier, a category, intent "order",
// authoredOn, the requester, a structured dose (timing with a period unit, a route from DHA's
// route-of-administration-cs, a dose quantity) and dispenseRequest.quantity. The terminology here
// follows DHA's published code systems and its sample prescriptions on fhir.dha.go.ke (read
// 2026-11-18): medicines are KNHTS generic codes (GE...) under generic-products-cs, routes are RT
// codes, dose units are UCUM, countable units use code "1".

import type { CodeableConcept, Coding, Dosage, Identifier, MedicationRequest, Quantity } from '@medplum/fhirtypes';

/** DHA eRx MedicationRequest profile. */
export const KenyaErxMedicationRequestProfile = 'https://fhir.dha.go.ke/erx/StructureDefinition/ke-medication-request';
/** DHA eRx MedicationDispense profile. */
export const KenyaErxMedicationDispenseProfile = 'https://fhir.dha.go.ke/erx/StructureDefinition/ke-medication-dispense';
/** DHA generic products (the KNHTS HPT generic codes, GE...). */
export const DhaGenericProductSystem = 'https://fhir.dha.go.ke/terminology/CodeSystem/generic-products-cs';
/** DHA routes of administration (RT...). */
export const DhaRouteSystem = 'https://fhir.dha.go.ke/terminology/CodeSystem/route-of-administration-cs';
/** FHIR MedicationRequest categories (inpatient, outpatient, community, discharge). */
export const MedicationRequestCategorySystem = 'http://terminology.hl7.org/CodeSystem/medicationrequest-category';
/** HL7 timing abbreviations (BID, TID, QD...). */
export const TimingAbbreviationSystem = 'http://terminology.hl7.org/CodeSystem/v3-GTSAbbreviation';
/** RFC 3986 URIs, for the prescription's globally unique identifier (urn:uuid:...). */
export const UriIdentifierSystem = 'urn:ietf:rfc:3986';
/** The short prescription code printed on the prescription and shown as a QR. */
export const KenyaPrescriptionCodeSystem = 'https://afiax.africa/kenya/identifier/prescription-code';

const UCUM = 'http://unitsofmeasure.org';

/** How many days a prescription can be filled for, when the prescriber does not say. */
export const KenyaDefaultPrescriptionValidityDays = 30;

export type KenyaErxCategoryCode = 'outpatient' | 'inpatient' | 'discharge' | 'community';

export const KenyaErxCategories: readonly { code: KenyaErxCategoryCode; display: string }[] = [
  { code: 'outpatient', display: 'Outpatient' },
  { code: 'inpatient', display: 'Inpatient' },
  { code: 'discharge', display: 'Discharge' },
  { code: 'community', display: 'Community' },
];

/** DHA routes of administration (route-of-administration-cs, complete, read 2026-11-18). */
export const KenyaRoutes: readonly { code: string; display: string }[] = [
  { code: 'RT10025', display: 'Oral' },
  { code: 'RT10036', display: 'Intravenous' },
  { code: 'RT10013', display: 'Intramuscular' },
  { code: 'RT10029', display: 'Subcutaneous' },
  { code: 'RT10031', display: 'Topical' },
  { code: 'RT10007', display: 'Inhalation' },
  { code: 'RT10028', display: 'Rectal' },
  { code: 'RT10035', display: 'Vaginal' },
  { code: 'RT10030', display: 'Sublingual' },
  { code: 'RT10001', display: 'Buccal' },
  { code: 'RT10024', display: 'Ophthalmic' },
  { code: 'RT10026', display: 'Otic' },
  { code: 'RT10023', display: 'Nasal' },
  { code: 'RT10032', display: 'Transdermal' },
  { code: 'RT10012', display: 'Intradermal' },
  { code: 'RT10008', display: 'Injection' },
  { code: 'RT10002', display: 'Dental' },
  { code: 'RT10003', display: 'Epidural' },
  { code: 'RT10004', display: 'Hemodialysis' },
  { code: 'RT10005', display: 'Implantation' },
  { code: 'RT10006', display: 'In Vitro' },
  { code: 'RT10009', display: 'Intraarterial' },
  { code: 'RT10010', display: 'Intraarticular' },
  { code: 'RT10011', display: 'Intracavernosal' },
  { code: 'RT10014', display: 'Intraocular' },
  { code: 'RT10015', display: 'Intraperitoneal' },
  { code: 'RT10016', display: 'Intrapleural' },
  { code: 'RT10017', display: 'Intrathecal' },
  { code: 'RT10018', display: 'Intrauterine' },
  { code: 'RT10019', display: 'Intravesical' },
  { code: 'RT10020', display: 'Irrigation' },
  { code: 'RT10021', display: 'Miscellaneous' },
  { code: 'RT10022', display: 'Mucous Membrane' },
  { code: 'RT10027', display: 'Perfusion' },
  { code: 'RT10033', display: 'Translingual' },
  { code: 'RT10034', display: 'Urethral' },
  { code: 'RT10037', display: 'Intravitreal' },
  { code: 'RT10038', display: 'Intrapulmonary' },
];

export interface KenyaFrequency {
  readonly code: string;
  /** How Kenyan prescribers write it, as shown in order entry. */
  readonly display: string;
  /** Words for the generated dosage text. */
  readonly text: string;
  readonly frequency: number;
  readonly period: number;
  readonly periodUnit: 'h' | 'd' | 'wk';
  /** HL7 timing abbreviation, where one exists. */
  readonly abbreviation?: string;
  /** A single dose (STAT). */
  readonly once?: boolean;
}

/** Dose frequencies offered in order entry. */
export const KenyaFrequencies: readonly KenyaFrequency[] = [
  { code: 'OD', display: 'OD (once daily)', text: 'once daily', frequency: 1, period: 1, periodUnit: 'd', abbreviation: 'QD' },
  { code: 'BD', display: 'BD (twice daily)', text: 'twice daily', frequency: 2, period: 1, periodUnit: 'd', abbreviation: 'BID' },
  { code: 'TDS', display: 'TDS (three times daily)', text: 'three times daily', frequency: 3, period: 1, periodUnit: 'd', abbreviation: 'TID' },
  { code: 'QID', display: 'QID (four times daily)', text: 'four times daily', frequency: 4, period: 1, periodUnit: 'd', abbreviation: 'QID' },
  { code: 'Q4H', display: 'Every 4 hours', text: 'every 4 hours', frequency: 1, period: 4, periodUnit: 'h', abbreviation: 'Q4H' },
  { code: 'Q6H', display: 'Every 6 hours', text: 'every 6 hours', frequency: 1, period: 6, periodUnit: 'h', abbreviation: 'Q6H' },
  { code: 'Q8H', display: 'Every 8 hours', text: 'every 8 hours', frequency: 1, period: 8, periodUnit: 'h', abbreviation: 'Q8H' },
  { code: 'Q12H', display: 'Every 12 hours', text: 'every 12 hours', frequency: 1, period: 12, periodUnit: 'h' },
  { code: 'NOCTE', display: 'Nocte (at night)', text: 'at night', frequency: 1, period: 1, periodUnit: 'd', abbreviation: 'BED' },
  { code: 'WEEKLY', display: 'Once weekly', text: 'once weekly', frequency: 1, period: 1, periodUnit: 'wk', abbreviation: 'WK' },
  { code: 'STAT', display: 'STAT (single dose now)', text: 'immediately, as a single dose', frequency: 1, period: 1, periodUnit: 'd', once: true },
];

export interface KenyaDoseUnit {
  readonly code: string;
  readonly display: string;
  /** Plural, for the generated dosage text. */
  readonly plural: string;
  /** UCUM code; countable units use "1", as in DHA's samples. */
  readonly ucum: string;
  /** Tablets, drops and the like (as opposed to amounts such as mg or mL). */
  readonly countable: boolean;
}

/** Dose units offered in order entry. */
export const KenyaDoseUnits: readonly KenyaDoseUnit[] = [
  { code: 'mg', display: 'mg', plural: 'mg', ucum: 'mg', countable: false },
  { code: 'g', display: 'g', plural: 'g', ucum: 'g', countable: false },
  { code: 'mcg', display: 'mcg', plural: 'mcg', ucum: 'ug', countable: false },
  { code: 'mL', display: 'mL', plural: 'mL', ucum: 'mL', countable: false },
  { code: 'IU', display: 'IU', plural: 'IU', ucum: '[iU]', countable: false },
  { code: 'tablet', display: 'tablet', plural: 'tablets', ucum: '1', countable: true },
  { code: 'capsule', display: 'capsule', plural: 'capsules', ucum: '1', countable: true },
  { code: 'drop', display: 'drop', plural: 'drops', ucum: '[drp]', countable: true },
  { code: 'puff', display: 'puff', plural: 'puffs', ucum: '1', countable: true },
  { code: 'sachet', display: 'sachet', plural: 'sachets', ucum: '1', countable: true },
  { code: 'suppository', display: 'suppository', plural: 'suppositories', ucum: '1', countable: true },
  { code: 'application', display: 'application', plural: 'applications', ucum: '1', countable: true },
];

export interface KenyaStructuredDose {
  /** Amount per dose, e.g. 500. */
  readonly doseValue: number;
  /** A KenyaDoseUnits code, e.g. "mg" or "tablet". */
  readonly doseUnit: string;
  /** A KenyaFrequencies code, e.g. "TDS". */
  readonly frequency: string;
  /** A DHA route code, e.g. "RT10025" (oral). */
  readonly route: string;
  /** Course length in days (ignored for STAT). */
  readonly durationDays?: number;
  /** The prescriber's own wording; generated when absent. */
  readonly text?: string;
}

export function getKenyaFrequency(code: string | undefined): KenyaFrequency | undefined {
  return KenyaFrequencies.find((f) => f.code === code);
}

export function getKenyaDoseUnit(code: string | undefined): KenyaDoseUnit | undefined {
  return KenyaDoseUnits.find((u) => u.code === code);
}

export function getKenyaRoute(code: string | undefined): { code: string; display: string } | undefined {
  return KenyaRoutes.find((r) => r.code === code);
}

/**
 * Returns why a structured dose is invalid, or undefined when it is valid.
 * @param dose - The structured dose.
 * @returns The error message, if any.
 */
export function getKenyaStructuredDoseError(dose: Partial<KenyaStructuredDose>): string | undefined {
  if (!(typeof dose.doseValue === 'number' && dose.doseValue > 0)) {
    return 'The dose must be greater than zero';
  }
  if (!getKenyaDoseUnit(dose.doseUnit)) {
    return `Unknown dose unit "${dose.doseUnit ?? ''}"`;
  }
  if (!getKenyaFrequency(dose.frequency)) {
    return `Unknown frequency "${dose.frequency ?? ''}"`;
  }
  if (!getKenyaRoute(dose.route)) {
    return `Unknown route "${dose.route ?? ''}"; use a DHA route-of-administration code (RT...)`;
  }
  if (dose.durationDays !== undefined && !(Number.isInteger(dose.durationDays) && dose.durationDays > 0)) {
    return 'The duration must be a whole number of days';
  }
  return undefined;
}

/**
 * Writes a structured dose in words, e.g. "500 mg oral three times daily for 5 days".
 * @param dose - A valid structured dose.
 * @returns The dosage text.
 */
export function formatKenyaDose(dose: KenyaStructuredDose): string {
  const unit = getKenyaDoseUnit(dose.doseUnit) as KenyaDoseUnit;
  const frequency = getKenyaFrequency(dose.frequency) as KenyaFrequency;
  const route = getKenyaRoute(dose.route) as { display: string };
  const amount = `${dose.doseValue} ${unit.countable && dose.doseValue !== 1 ? unit.plural : unit.display}`;
  const days = !frequency.once && dose.durationDays ? ` for ${dose.durationDays} day${dose.durationDays === 1 ? '' : 's'}` : '';
  return `${amount} ${route.display.toLowerCase()} ${frequency.text}${days}`;
}

/**
 * Builds a DHA eRx dosage instruction from a structured dose.
 * @param dose - A valid structured dose (check it with getKenyaStructuredDoseError first).
 * @returns The Dosage.
 */
export function buildKenyaDosage(dose: KenyaStructuredDose): Dosage {
  const unit = getKenyaDoseUnit(dose.doseUnit) as KenyaDoseUnit;
  const frequency = getKenyaFrequency(dose.frequency) as KenyaFrequency;
  const route = getKenyaRoute(dose.route) as { code: string; display: string };
  const doseQuantity: Quantity = { value: dose.doseValue, unit: unit.display, system: UCUM, code: unit.ucum };
  const days = frequency.once ? undefined : dose.durationDays;
  return {
    sequence: 1,
    text: dose.text?.trim() || formatKenyaDose(dose),
    timing: {
      repeat: {
        frequency: frequency.frequency,
        period: frequency.period,
        periodUnit: frequency.periodUnit,
        count: frequency.once ? 1 : undefined,
        duration: days,
        durationUnit: days ? 'd' : undefined,
      },
      code: frequency.abbreviation
        ? { coding: [{ system: TimingAbbreviationSystem, code: frequency.abbreviation }], text: frequency.display }
        : { text: frequency.display },
    },
    route: { coding: [{ system: DhaRouteSystem, code: route.code, display: route.display }], text: route.display },
    doseAndRate: [{ doseQuantity }],
  };
}

/**
 * Returns the eRx category concept.
 * @param code - The category code.
 * @returns The concept.
 */
export function getKenyaErxCategoryConcept(code: KenyaErxCategoryCode): CodeableConcept {
  const category = KenyaErxCategories.find((c) => c.code === code) ?? KenyaErxCategories[0];
  return { coding: [{ system: MedicationRequestCategorySystem, code: category.code, display: category.display }] };
}

/**
 * Picks the eRx category from the encounter class: inpatient for admissions, otherwise outpatient.
 * @param encounterClass - The encounter's class coding.
 * @returns The category code.
 */
export function getKenyaErxCategoryForEncounter(encounterClass: Coding | undefined): KenyaErxCategoryCode {
  return encounterClass?.code === 'IMP' || encounterClass?.code === 'ACUTE' || encounterClass?.code === 'NONAC'
    ? 'inpatient'
    : 'outpatient';
}

/**
 * Returns the DHA generic-product coding for a KNHTS generic (GE...) code, sent alongside the
 * KNHTS coding; other HPT codes (products, ingredients) have no DHA generic coding.
 * @param coding - The KNHTS HPT coding.
 * @returns The DHA coding, if the code is a generic.
 */
export function getDhaGenericProductCoding(coding: Coding): Coding | undefined {
  return coding.code && /^GE\d+$/.test(coding.code)
    ? { system: DhaGenericProductSystem, code: coding.code, display: coding.display }
    : undefined;
}

// Crockford base 32 without I, L, O, U: easy to read aloud and type at a pharmacy counter
const PRESCRIPTION_CODE_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Makes a short prescription code, e.g. "RX-7KQ2-M9XD-3T": 10 random characters (50 bits), shown on
 * the printed prescription and as a QR code, and used to redeem the prescription at a pharmacy.
 * @param random - Random bytes (for tests).
 * @returns The prescription code.
 */
export function generateKenyaPrescriptionCode(random: Uint8Array = randomBytes(10)): string {
  const chars = Array.from(random.slice(0, 10), (b) => PRESCRIPTION_CODE_ALPHABET[b % 32]).join('');
  return `RX-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 10)}`;
}

/**
 * Normalises a prescription code typed at a counter: upper case, no spaces, O read as 0, I and L
 * read as 1.
 * @param input - What was typed or scanned.
 * @returns The code in its printed form, or undefined if it cannot be one.
 */
export function normalizeKenyaPrescriptionCode(input: string): string | undefined {
  const chars = input
    .toUpperCase()
    .replace(/^RX/, '')
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1');
  if (chars.length !== 10 || [...chars].some((c) => !PRESCRIPTION_CODE_ALPHABET.includes(c))) {
    return undefined;
  }
  return `RX-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 10)}`;
}

/**
 * Returns the prescription identifiers: a globally unique urn:uuid and the short prescription code.
 * @param uuid - The UUID.
 * @param code - The prescription code.
 * @returns The identifiers.
 */
export function buildKenyaPrescriptionIdentifiers(uuid: string, code: string): Identifier[] {
  return [
    { use: 'official', system: UriIdentifierSystem, value: `urn:uuid:${uuid}` },
    { use: 'usual', system: KenyaPrescriptionCodeSystem, value: code },
  ];
}

/**
 * Returns the prescription code of a MedicationRequest.
 * @param request - The MedicationRequest.
 * @returns The code, if it has one.
 */
export function getKenyaPrescriptionCode(request: MedicationRequest): string | undefined {
  return request.identifier?.find((i) => i.system === KenyaPrescriptionCodeSystem)?.value;
}

/**
 * Lists what a MedicationRequest lacks for the DHA eRx ke-medication-request profile. Checks the
 * required elements only, not terminology bindings.
 * @param request - The MedicationRequest.
 * @returns The missing elements; empty when it conforms.
 */
export function getKenyaErxConformanceGaps(request: MedicationRequest): string[] {
  const gaps: string[] = [];
  if (!request.identifier?.length) {
    gaps.push('identifier');
  }
  if (!request.category?.some((c) => c.coding?.some((x) => x.system === MedicationRequestCategorySystem))) {
    gaps.push('category (medicationrequest-category)');
  }
  if (request.intent !== 'order') {
    gaps.push('intent = order');
  }
  if (!request.medicationCodeableConcept && !request.medicationReference) {
    gaps.push('medication[x]');
  }
  if (!request.authoredOn) {
    gaps.push('authoredOn');
  }
  if (!request.requester) {
    gaps.push('requester');
  }
  const dosage = request.dosageInstruction?.[0];
  if (!dosage) {
    gaps.push('dosageInstruction');
  } else {
    if (!dosage.timing?.repeat?.periodUnit) {
      gaps.push('dosageInstruction.timing.repeat.periodUnit');
    }
    if (!dosage.route?.coding?.some((c) => c.system === DhaRouteSystem)) {
      gaps.push('dosageInstruction.route (DHA route-of-administration)');
    }
    if (!dosage.doseAndRate?.some((d) => d.doseQuantity?.value !== undefined)) {
      gaps.push('dosageInstruction.doseAndRate.doseQuantity');
    }
  }
  if (!request.dispenseRequest?.quantity?.value) {
    gaps.push('dispenseRequest.quantity');
  }
  return gaps;
}

function randomBytes(n: number): Uint8Array {
  const bytes = new Uint8Array(n);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
}
