// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getKenyaValidationIssues } from '@medplum/core';
import type { KenyaPatientRegistration } from './KenyaPatientRegistration';
import { buildKenyaPatient, getRegistrationErrors } from './KenyaPatientRegistration';

const NOW = new Date('2026-11-04T09:00:00Z');

// DHA FUNC-DEMO-001 test patient: John Doe, Male, DOB 1990-01-15, ID 12345678
const johnDoe: KenyaPatientRegistration = {
  idType: 'National ID',
  idNumber: '12345678',
  clientRegistryId: 'CR-0001',
  givenName: 'John',
  familyName: 'Doe',
  birthDate: '1990-01-15',
  gender: 'male',
  phone: '+254712345678',
  county: 'Nairobi',
  subCounty: 'Westlands',
  ward: 'Parklands',
  village: 'Highridge Estate',
  passportNumber: 'AK1234567',
  birthCertificateNumber: '123456/1990',
  nokName: 'Jane Doe',
  nokRelationship: 'SPS',
  nokPhone: '0722000111',
};

const blank: KenyaPatientRegistration = {
  ...johnDoe,
  phone: '',
  county: '',
  subCounty: '',
  ward: '',
  village: '',
  passportNumber: '',
  birthCertificateNumber: '',
  nokName: '',
  nokRelationship: '',
  nokPhone: '',
};

describe('Kenya patient registration', () => {
  test('DHA test patient has no errors', () => {
    expect(getRegistrationErrors(johnDoe, NOW)).toStrictEqual({});
  });

  test('Optional fields can be left empty', () => {
    expect(getRegistrationErrors(blank, NOW)).toStrictEqual({});
  });

  test('Rejects bad values field by field', () => {
    const errors = getRegistrationErrors(
      {
        ...johnDoe,
        familyName: ' ',
        birthDate: '2027-01-01',
        phone: '12ab',
        passportNumber: 'A-1',
        birthCertificateNumber: '!!',
        nokRelationship: '',
        nokPhone: '',
      },
      NOW
    );
    expect(Object.keys(errors).sort()).toStrictEqual(
      [
        'birthCertificateNumber',
        'birthDate',
        'familyName',
        'nokPhone',
        'nokRelationship',
        'passportNumber',
        'phone',
      ].sort()
    );
    expect(errors.birthDate).toContain('in the future');
  });

  test('Next of kin needs a name once any next-of-kin field is filled', () => {
    const errors = getRegistrationErrors({ ...blank, nokPhone: '0722000111' }, NOW);
    expect(errors.nokName).toBeDefined();
    expect(errors.nokRelationship).toBeDefined();
  });

  test('Builds a complete Patient that passes the server rules', () => {
    const patient = buildKenyaPatient(johnDoe);
    expect(patient).toMatchObject({
      resourceType: 'Patient',
      name: [{ family: 'Doe', given: ['John'] }],
      gender: 'male',
      birthDate: '1990-01-15',
      telecom: [{ system: 'phone', value: '+254712345678', use: 'mobile' }],
      address: [
        {
          use: 'home',
          line: ['Highridge Estate'],
          city: 'Parklands',
          district: 'Westlands',
          state: 'Nairobi',
          country: 'KE',
        },
      ],
    });
    expect(patient.identifier?.map((i) => [i.type?.text, i.value])).toStrictEqual([
      ['National ID', '12345678'],
      ['Passport', 'AK1234567'],
      ['Birth Certificate', '123456/1990'],
    ]);
    expect(patient.identifier?.[0].extension?.[0].valueString).toBe('CR-0001');
    expect(patient.contact?.[0].name?.text).toBe('Jane Doe');
    expect(patient.contact?.[0].relationship?.map((r) => r.coding?.[0].code)).toStrictEqual(['N', 'SPS']);
    expect(patient.contact?.[0].telecom?.[0].value).toBe('0722000111');
    expect(getKenyaValidationIssues(patient, NOW)).toStrictEqual([]);
  });

  test('Leaves out empty sections and does not repeat the primary ID', () => {
    const patient = buildKenyaPatient({
      ...blank,
      idType: 'Passport',
      idNumber: 'AK1234567',
      passportNumber: 'AK1234567',
    });
    expect(patient.identifier).toHaveLength(1);
    expect(patient.telecom).toBeUndefined();
    expect(patient.address).toBeUndefined();
    expect(patient.contact).toBeUndefined();
  });
});
