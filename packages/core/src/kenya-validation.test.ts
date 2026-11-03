// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Observation, Patient } from '@medplum/fhirtypes';
import {
  getKenyaBirthDateError,
  getKenyaIdentifierError,
  getKenyaPhoneError,
  getKenyaToday,
  getKenyaValidationIssues,
  KenyaPatientIdentifierSystems,
} from './kenya-validation';

// 2026-11-03 22:30 UTC is already 2026-11-04 in Nairobi
const now = new Date('2026-11-03T22:30:00Z');

describe('Kenya data validation', () => {
  test('Kenya today is East Africa Time', () => {
    expect(getKenyaToday(now)).toBe('2026-11-04');
  });

  test('Date of birth', () => {
    expect(getKenyaBirthDateError('1990-01-15', now)).toBeUndefined();
    expect(getKenyaBirthDateError('2026-11-04', now)).toBeUndefined();
    expect(getKenyaBirthDateError('1990', now)).toBeUndefined();
    expect(getKenyaBirthDateError('2026-11', now)).toBeUndefined();
    expect(getKenyaBirthDateError(undefined, now)).toBeUndefined();
    expect(getKenyaBirthDateError('2099-01-15', now)).toBe('Date of birth 2099-01-15 is in the future');
    expect(getKenyaBirthDateError('2026-11-05', now)).toBe('Date of birth 2026-11-05 is in the future');
    expect(getKenyaBirthDateError('2027', now)).toBe('Date of birth 2027 is in the future');
    expect(getKenyaBirthDateError('1899-12-31', now)).toBe('Date of birth 1899-12-31 is before 1900');
  });

  test('National ID', () => {
    const system = KenyaPatientIdentifierSystems['National ID'];
    expect(getKenyaIdentifierError(system, '12345678')).toBeUndefined();
    expect(getKenyaIdentifierError(system, '1234567A')).toContain('digits only');
    expect(getKenyaIdentifierError(system, 'ABCDEFGH')).toContain('is not valid');
    expect(getKenyaIdentifierError(system, '123')).toContain('is not valid');
    expect(getKenyaIdentifierError(system, ' ')).toBe('National ID is empty');
  });

  test('Passport and birth certificate', () => {
    expect(getKenyaIdentifierError(KenyaPatientIdentifierSystems.Passport, 'AK0123456')).toBeUndefined();
    expect(getKenyaIdentifierError(KenyaPatientIdentifierSystems.Passport, 'AK-01')).toContain('is not valid');
    expect(getKenyaIdentifierError('https://afiax.africa/kenya/identifier/passport-number', 'A$1')).toContain(
      'Passport number'
    );
    expect(getKenyaIdentifierError(KenyaPatientIdentifierSystems['Birth Certificate'], '1234567')).toBeUndefined();
    expect(getKenyaIdentifierError(KenyaPatientIdentifierSystems['Birth Certificate'], '12 34')).toContain(
      'is not valid'
    );
  });

  test('Identifiers without a Kenyan rule are not checked', () => {
    expect(getKenyaIdentifierError('https://example.com/mrn', 'anything at all')).toBeUndefined();
    expect(getKenyaIdentifierError(undefined, 'x')).toBeUndefined();
  });

  test('Phone number', () => {
    expect(getKenyaPhoneError('+254712345678')).toBeUndefined();
    expect(getKenyaPhoneError('0712 345 678')).toBeUndefined();
    expect(getKenyaPhoneError('(020) 271-0000')).toBeUndefined();
    expect(getKenyaPhoneError('07123')).toContain('is not valid');
    expect(getKenyaPhoneError('07123abc45')).toContain('is not valid');
    expect(getKenyaPhoneError('')).toBe('Phone number is empty');
  });

  test('Patient', () => {
    const patient: Patient = {
      resourceType: 'Patient',
      birthDate: '2099-01-01',
      identifier: [{ system: KenyaPatientIdentifierSystems['National ID'], value: '12AB5678' }],
      telecom: [{ system: 'phone', value: 'not a phone' }],
      contact: [{ telecom: [{ system: 'phone', value: '123' }] }],
    };
    expect(getKenyaValidationIssues(patient, now).map((i) => i.expression)).toEqual([
      'Patient.birthDate',
      'Patient.identifier[0].value',
      'Patient.telecom[0].value',
      'Patient.contact[0].telecom[0].value',
    ]);

    const valid: Patient = {
      resourceType: 'Patient',
      birthDate: '1990-01-15',
      gender: 'male',
      identifier: [{ system: KenyaPatientIdentifierSystems['National ID'], value: '12345678' }],
      telecom: [
        { system: 'phone', value: '+254712345678' },
        { system: 'email', value: 'john@example.com' },
      ],
    };
    expect(getKenyaValidationIssues(valid, now)).toEqual([]);
  });

  test('Date of death before date of birth', () => {
    expect(
      getKenyaValidationIssues(
        { resourceType: 'Patient', birthDate: '1990-01-15', deceasedDateTime: '1989-01-01T00:00:00Z' },
        now
      )
    ).toEqual([{ expression: 'Patient.deceasedDateTime', message: 'Date of death is before the date of birth' }]);
  });

  function vital(code: string, value: number, unit: string): Observation {
    return {
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code }] },
      valueQuantity: { value, unit, system: 'http://unitsofmeasure.org', code: unit },
    };
  }

  test('Vital signs', () => {
    expect(getKenyaValidationIssues(vital('29463-7', 70, 'kg'))).toEqual([]);
    expect(getKenyaValidationIssues(vital('29463-7', -5, 'kg'))[0].message).toBe('Body weight cannot be negative (-5)');
    expect(getKenyaValidationIssues(vital('29463-7', 900, 'kg'))[0].message).toContain('outside the plausible range');
    expect(getKenyaValidationIssues(vital('8310-5', 37, 'Cel'))).toEqual([]);
    expect(getKenyaValidationIssues(vital('8310-5', 98.6, '[degF]'))).toEqual([]);
    expect(getKenyaValidationIssues(vital('8310-5', 370, 'Cel'))).toHaveLength(1);
    expect(getKenyaValidationIssues(vital('8867-4', 0, 'beats'))[0].message).toBe('Heart rate cannot be zero');
    // Not a vital sign: negative values are allowed (e.g. base excess)
    expect(getKenyaValidationIssues(vital('11555-0', -4, 'mmol/L'))).toEqual([]);
  });

  test('Blood pressure components', () => {
    const bp: Observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '85354-9' }] },
      component: [
        {
          code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
          valueQuantity: { value: 120, code: 'mm[Hg]' },
        },
        {
          code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] },
          valueQuantity: { value: -80, code: 'mm[Hg]' },
        },
      ],
    };
    expect(getKenyaValidationIssues(bp)).toEqual([
      { expression: 'Observation.component[1].valueQuantity', message: 'Diastolic blood pressure cannot be negative (-80)' },
    ]);
  });
});
