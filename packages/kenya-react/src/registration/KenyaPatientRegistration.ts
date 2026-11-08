// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { KenyaPatientIdentificationType } from '@medplum/core';
import {
  getKenyaBirthDateError,
  getKenyaIdentifierError,
  getKenyaPhoneError,
  KenyaNextOfKinRelationships,
  KenyaPatientIdentifierSystems,
} from '@medplum/core';
import type { HumanName, Identifier, Patient, PatientContact } from '@medplum/fhirtypes';

export type Gender = 'male' | 'female' | 'other' | 'unknown';

const ID_SYSTEM_MAP = KenyaPatientIdentifierSystems;
const CLIENT_REGISTRY_ID_URL = 'https://afiax.africa/fhir/StructureDefinition/client-registry-id';
const ROLE_CODE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v3-RoleCode';
const CONTACT_ROLE_SYSTEM = 'http://terminology.hl7.org/CodeSystem/v2-0131';

/** Everything the registration step collects, as entered by the user. */
export interface KenyaPatientRegistration {
  readonly idType: KenyaPatientIdentificationType;
  readonly idNumber: string;
  readonly clientRegistryId?: string;
  readonly givenName: string;
  readonly familyName: string;
  readonly birthDate: string;
  readonly gender: Gender;
  readonly phone: string;
  readonly county: string;
  readonly subCounty: string;
  readonly ward: string;
  readonly village: string;
  readonly passportNumber: string;
  readonly birthCertificateNumber: string;
  readonly nokName: string;
  readonly nokRelationship: string;
  readonly nokPhone: string;
}

/**
 * Returns field-level validation errors for the registration form, keyed by field name.
 * Uses the same Kenya rules the server enforces, so problems show before saving.
 * @param r - The registration form values.
 * @param now - The current time (for tests).
 * @returns Errors by field; empty when the form can be submitted.
 */
export function getRegistrationErrors(
  r: KenyaPatientRegistration,
  now: Date = new Date()
): Partial<Record<keyof KenyaPatientRegistration, string>> {
  const errors: Partial<Record<keyof KenyaPatientRegistration, string>> = {};
  if (!r.familyName.trim()) {
    errors.familyName = 'Family name is required';
  }
  const dobError = getKenyaBirthDateError(r.birthDate || undefined, now);
  if (dobError) {
    errors.birthDate = dobError;
  }
  if (r.phone.trim()) {
    errors.phone = getKenyaPhoneError(r.phone);
  }
  if (r.passportNumber.trim()) {
    errors.passportNumber = getKenyaIdentifierError(ID_SYSTEM_MAP.Passport, r.passportNumber.trim());
  }
  if (r.birthCertificateNumber.trim()) {
    errors.birthCertificateNumber = getKenyaIdentifierError(
      ID_SYSTEM_MAP['Birth Certificate'],
      r.birthCertificateNumber.trim()
    );
  }
  const hasNok = r.nokName.trim() || r.nokPhone.trim() || r.nokRelationship;
  if (hasNok) {
    if (!r.nokName.trim()) {
      errors.nokName = 'Next of kin name is required';
    }
    if (!r.nokRelationship) {
      errors.nokRelationship = 'Choose the relationship';
    }
    errors.nokPhone = getKenyaPhoneError(r.nokPhone);
  }
  for (const key of Object.keys(errors) as (keyof KenyaPatientRegistration)[]) {
    if (!errors[key]) {
      delete errors[key];
    }
  }
  return errors;
}

/**
 * Builds the FHIR Patient for a completed registration form.
 * @param r - The registration form values.
 * @returns The Patient resource to create.
 */
export function buildKenyaPatient(r: KenyaPatientRegistration): Patient {
  const family = r.familyName.trim();
  const given = r.givenName.trim();
  const name: HumanName = { family, ...(given ? { given: [given] } : {}) };

  const identifier: Identifier[] = [
    {
      system: ID_SYSTEM_MAP[r.idType],
      value: r.idNumber.trim(),
      type: { text: r.idType },
      ...(r.clientRegistryId ? { extension: [{ url: CLIENT_REGISTRY_ID_URL, valueString: r.clientRegistryId }] } : {}),
    },
  ];
  const extraIds: [KenyaPatientIdentificationType, string][] = [
    ['Passport', r.passportNumber],
    ['Birth Certificate', r.birthCertificateNumber],
  ];
  for (const [type, value] of extraIds) {
    if (value.trim() && type !== r.idType) {
      identifier.push({ system: ID_SYSTEM_MAP[type], value: value.trim(), type: { text: type } });
    }
  }

  const line = [r.village.trim()].filter(Boolean);
  const hasAddress = r.county || r.subCounty.trim() || r.ward.trim() || line.length > 0;

  let contact: PatientContact[] | undefined;
  if (r.nokName.trim()) {
    const relationship = KenyaNextOfKinRelationships.find((rel) => rel.code === r.nokRelationship);
    contact = [
      {
        relationship: [
          { coding: [{ system: CONTACT_ROLE_SYSTEM, code: 'N', display: 'Next-of-Kin' }] },
          ...(relationship
            ? [{ coding: [{ system: ROLE_CODE_SYSTEM, code: relationship.code, display: relationship.display }] }]
            : []),
        ],
        name: { text: r.nokName.trim() },
        ...(r.nokPhone.trim() ? { telecom: [{ system: 'phone', value: r.nokPhone.trim(), use: 'mobile' }] } : {}),
      },
    ];
  }

  return {
    resourceType: 'Patient',
    name: [name],
    gender: r.gender,
    ...(r.birthDate ? { birthDate: r.birthDate } : {}),
    identifier,
    ...(r.phone.trim() ? { telecom: [{ system: 'phone', value: r.phone.trim(), use: 'mobile' }] } : {}),
    ...(hasAddress
      ? {
          address: [
            {
              use: 'home',
              type: 'physical',
              ...(line.length ? { line } : {}),
              ...(r.ward.trim() ? { city: r.ward.trim() } : {}),
              ...(r.subCounty.trim() ? { district: r.subCounty.trim() } : {}),
              ...(r.county ? { state: r.county } : {}),
              country: 'KE',
            },
          ],
        }
      : {}),
    ...(contact ? { contact } : {}),
  };
}
