// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ContactPoint, Identifier, Observation, Quantity, Resource } from '@medplum/fhirtypes';
import type { KenyaPatientIdentificationType } from './kenya';

/**
 * Data validation rules for Kenya projects (DHA certification FUNC-DEMO-001 and SEC-INT-001).
 *
 * These checks catch values that cannot be right: a date of birth in the future, a National ID
 * with letters in it, a negative body weight. They run on the server for every write in a Kenya
 * project, and the web app runs the same checks before it submits, so the user sees the problem
 * on the form.
 */

export interface KenyaValidationIssue {
  readonly expression: string;
  readonly message: string;
}

/** Identifier systems for the Kenyan patient identification types. */
export const KenyaPatientIdentifierSystems: Record<KenyaPatientIdentificationType, string> = {
  'National ID': 'https://afiax.africa/kenya/identifier/national-id',
  'Alien ID': 'https://afiax.africa/kenya/identifier/alien-id',
  Passport: 'https://afiax.africa/kenya/identifier/passport',
  'Birth Certificate': 'https://afiax.africa/kenya/identifier/birth-certificate',
  'Refugee ID': 'https://afiax.africa/kenya/identifier/refugee-id',
};

interface IdentifierRule {
  readonly label: string;
  readonly pattern: RegExp;
  readonly hint: string;
}

const NATIONAL_ID_RULE: IdentifierRule = {
  label: 'National ID',
  pattern: /^\d{5,10}$/,
  hint: 'digits only (5 to 10 digits)',
};

const PASSPORT_RULE: IdentifierRule = {
  label: 'Passport number',
  pattern: /^[A-Z0-9]{6,12}$/i,
  hint: 'letters and digits only, 6 to 12 characters',
};

const identifierRules: Record<string, IdentifierRule> = {
  [KenyaPatientIdentifierSystems['National ID']]: NATIONAL_ID_RULE,
  [KenyaPatientIdentifierSystems['Alien ID']]: { label: 'Alien ID', pattern: /^\d{5,10}$/, hint: 'digits only' },
  [KenyaPatientIdentifierSystems.Passport]: PASSPORT_RULE,
  // Practitioner records use this system for passports
  'https://afiax.africa/kenya/identifier/passport-number': PASSPORT_RULE,
  [KenyaPatientIdentifierSystems['Birth Certificate']]: {
    label: 'Birth certificate number',
    pattern: /^[A-Z0-9/-]{4,20}$/i,
    hint: 'letters, digits, "/" and "-" only',
  },
  [KenyaPatientIdentifierSystems['Refugee ID']]: {
    label: 'Refugee ID',
    pattern: /^[A-Z0-9/-]{4,20}$/i,
    hint: 'letters, digits, "/" and "-" only',
  },
};

/**
 * Returns the problem with an identifier value for a Kenyan identifier system, if any.
 * @param system - The identifier system.
 * @param value - The identifier value.
 * @returns An error message, or undefined if the value is valid or the system has no rule.
 */
export function getKenyaIdentifierError(system: string | undefined, value: string | undefined): string | undefined {
  const rule = system ? identifierRules[system] : undefined;
  if (!rule) {
    return undefined;
  }
  if (!value?.trim()) {
    return `${rule.label} is empty`;
  }
  if (!rule.pattern.test(value)) {
    return `${rule.label} "${value}" is not valid: ${rule.hint}`;
  }
  return undefined;
}

/**
 * Returns today's date in Kenya (East Africa Time, UTC+3) as YYYY-MM-DD.
 * @param now - The current time (for tests).
 * @returns Today's date in Kenya.
 */
export function getKenyaToday(now: Date = new Date()): string {
  return new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * Returns the problem with a date of birth, if any.
 * Partial dates ("1990", "1990-01") are compared on the parts they have.
 * @param birthDate - The FHIR date of birth.
 * @param now - The current time (for tests).
 * @returns An error message, or undefined if the date is plausible.
 */
export function getKenyaBirthDateError(birthDate: string | undefined, now: Date = new Date()): string | undefined {
  if (!birthDate) {
    return undefined;
  }
  const today = getKenyaToday(now);
  if (birthDate.slice(0, 10) > today.slice(0, birthDate.length)) {
    return `Date of birth ${birthDate} is in the future`;
  }
  if (birthDate < '1900') {
    return `Date of birth ${birthDate} is before 1900`;
  }
  return undefined;
}

/**
 * Returns the problem with a phone number, if any. Accepts international (+254...) and local
 * (07..., 01...) formats with optional spaces, dashes and brackets.
 * @param value - The phone number.
 * @returns An error message, or undefined if the number is valid.
 */
export function getKenyaPhoneError(value: string | undefined): string | undefined {
  if (!value?.trim()) {
    return 'Phone number is empty';
  }
  const digits = value.replace(/\D/g, '');
  if (!/^\+?[\d\s()-]+$/.test(value.trim()) || digits.length < 9 || digits.length > 15) {
    return `Phone number "${value}" is not valid: use a format like +254712345678 or 0712345678`;
  }
  return undefined;
}

interface VitalSignRule {
  readonly display: string;
  /** Plausible range per UCUM unit code. Values outside it are rejected. */
  readonly ranges: Record<string, readonly [number, number]>;
}

/** LOINC vital signs (FHIR vital signs profile) and their physiologically plausible ranges. */
const vitalSignRules: Record<string, VitalSignRule> = {
  '8867-4': { display: 'Heart rate', ranges: { '/min': [20, 300] } },
  '9279-1': { display: 'Respiratory rate', ranges: { '/min': [2, 100] } },
  '8310-5': { display: 'Body temperature', ranges: { Cel: [25, 45], '[degF]': [77, 113] } },
  '8480-6': { display: 'Systolic blood pressure', ranges: { 'mm[Hg]': [40, 300] } },
  '8462-4': { display: 'Diastolic blood pressure', ranges: { 'mm[Hg]': [10, 200] } },
  '29463-7': { display: 'Body weight', ranges: { kg: [0.2, 500], g: [200, 500000], '[lb_av]': [0.5, 1100] } },
  '8302-2': { display: 'Body height', ranges: { cm: [20, 275], m: [0.2, 2.75], '[in_i]': [8, 108] } },
  '9843-4': { display: 'Head circumference', ranges: { cm: [15, 80] } },
  '2708-6': { display: 'Oxygen saturation', ranges: { '%': [1, 100] } },
  '59408-5': { display: 'Oxygen saturation (pulse oximetry)', ranges: { '%': [1, 100] } },
  '39156-5': { display: 'Body mass index', ranges: { 'kg/m2': [5, 150] } },
};

const LOINC = 'http://loinc.org';

function getVitalSignRule(code: Observation['code'] | undefined): [string, VitalSignRule] | undefined {
  for (const coding of code?.coding ?? []) {
    if (coding.system === LOINC && coding.code && vitalSignRules[coding.code]) {
      return [coding.code, vitalSignRules[coding.code]];
    }
  }
  return undefined;
}

function getQuantityError(rule: VitalSignRule, quantity: Quantity): string | undefined {
  const value = quantity.value;
  if (value === undefined) {
    return undefined;
  }
  if (value < 0) {
    return `${rule.display} cannot be negative (${value})`;
  }
  const range = quantity.code ? rule.ranges[quantity.code] : undefined;
  if (range && (value < range[0] || value > range[1])) {
    return `${rule.display} ${value} ${quantity.unit ?? quantity.code} is outside the plausible range ${range[0]}–${range[1]}`;
  }
  if (value === 0) {
    return `${rule.display} cannot be zero`;
  }
  return undefined;
}

function getObservationIssues(observation: Observation): KenyaValidationIssue[] {
  const issues: KenyaValidationIssue[] = [];
  const rule = getVitalSignRule(observation.code)?.[1];
  if (rule && observation.valueQuantity) {
    const message = getQuantityError(rule, observation.valueQuantity);
    if (message) {
      issues.push({ expression: 'Observation.valueQuantity', message });
    }
  }
  observation.component?.forEach((component, i) => {
    const componentRule = getVitalSignRule(component.code)?.[1];
    if (componentRule && component.valueQuantity) {
      const message = getQuantityError(componentRule, component.valueQuantity);
      if (message) {
        issues.push({ expression: `Observation.component[${i}].valueQuantity`, message });
      }
    }
  });
  return issues;
}

function getIdentifierIssues(resourceType: string, identifiers: Identifier[] | undefined): KenyaValidationIssue[] {
  const issues: KenyaValidationIssue[] = [];
  identifiers?.forEach((identifier, i) => {
    const message = getKenyaIdentifierError(identifier.system, identifier.value);
    if (message) {
      issues.push({ expression: `${resourceType}.identifier[${i}].value`, message });
    }
  });
  return issues;
}

function getTelecomIssues(path: string, telecom: ContactPoint[] | undefined): KenyaValidationIssue[] {
  const issues: KenyaValidationIssue[] = [];
  telecom?.forEach((contact, i) => {
    if (contact.system === 'phone' || contact.system === 'sms') {
      const message = getKenyaPhoneError(contact.value);
      if (message) {
        issues.push({ expression: `${path}[${i}].value`, message });
      }
    }
  });
  return issues;
}

/**
 * Returns every data validation problem on a resource written in a Kenya project.
 * @param resource - The resource being written.
 * @param now - The current time (for tests).
 * @returns The issues found; empty if the resource is valid.
 */
export function getKenyaValidationIssues(resource: Resource, now: Date = new Date()): KenyaValidationIssue[] {
  switch (resource.resourceType) {
    case 'Patient': {
      const issues: KenyaValidationIssue[] = [];
      const birthDateError = getKenyaBirthDateError(resource.birthDate, now);
      if (birthDateError) {
        issues.push({ expression: 'Patient.birthDate', message: birthDateError });
      }
      if (resource.birthDate && resource.deceasedDateTime && resource.deceasedDateTime.slice(0, 10) < resource.birthDate) {
        issues.push({ expression: 'Patient.deceasedDateTime', message: 'Date of death is before the date of birth' });
      }
      issues.push(...getIdentifierIssues('Patient', resource.identifier));
      issues.push(...getTelecomIssues('Patient.telecom', resource.telecom));
      resource.contact?.forEach((contact, i) => {
        issues.push(...getTelecomIssues(`Patient.contact[${i}].telecom`, contact.telecom));
      });
      return issues;
    }
    case 'Practitioner': {
      const issues: KenyaValidationIssue[] = [];
      const birthDateError = getKenyaBirthDateError(resource.birthDate, now);
      if (birthDateError) {
        issues.push({ expression: 'Practitioner.birthDate', message: birthDateError });
      }
      issues.push(...getIdentifierIssues('Practitioner', resource.identifier));
      issues.push(...getTelecomIssues('Practitioner.telecom', resource.telecom));
      return issues;
    }
    case 'RelatedPerson':
      return getTelecomIssues('RelatedPerson.telecom', resource.telecom);
    case 'Observation':
      return getObservationIssues(resource);
    default:
      return [];
  }
}

/** The 47 counties of Kenya, with their official county codes (Constitution of Kenya 2010, First Schedule). */
export const KenyaCounties: readonly { readonly code: string; readonly name: string }[] = [
  'Mombasa',
  'Kwale',
  'Kilifi',
  'Tana River',
  'Lamu',
  'Taita-Taveta',
  'Garissa',
  'Wajir',
  'Mandera',
  'Marsabit',
  'Isiolo',
  'Meru',
  'Tharaka-Nithi',
  'Embu',
  'Kitui',
  'Machakos',
  'Makueni',
  'Nyandarua',
  'Nyeri',
  'Kirinyaga',
  "Murang'a",
  'Kiambu',
  'Turkana',
  'West Pokot',
  'Samburu',
  'Trans Nzoia',
  'Uasin Gishu',
  'Elgeyo-Marakwet',
  'Nandi',
  'Baringo',
  'Laikipia',
  'Nakuru',
  'Narok',
  'Kajiado',
  'Kericho',
  'Bomet',
  'Kakamega',
  'Vihiga',
  'Bungoma',
  'Busia',
  'Siaya',
  'Kisumu',
  'Homa Bay',
  'Migori',
  'Kisii',
  'Nyamira',
  'Nairobi',
].map((name, i) => ({ code: String(i + 1).padStart(3, '0'), name }));

/** Next-of-kin relationships, as HL7 v3 RoleCode codes. */
export const KenyaNextOfKinRelationships: readonly { readonly code: string; readonly display: string }[] = [
  { code: 'SPS', display: 'Spouse' },
  { code: 'PRN', display: 'Parent' },
  { code: 'CHILD', display: 'Child' },
  { code: 'SIB', display: 'Sibling' },
  { code: 'GUARD', display: 'Guardian' },
  { code: 'FAMMEMB', display: 'Other family member' },
  { code: 'FRND', display: 'Friend' },
];
