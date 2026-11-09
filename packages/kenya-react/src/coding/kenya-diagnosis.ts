// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya diagnoses: ICD-11 MMS (from KNHTS) recorded as a Condition shaped for the DHA eClaims
// Condition profile (clinical and verification status, category, ICD-11 code, subject, encounter,
// onset, recorder). IHR notification and IDSR reporting read these Conditions.

import { createReference, KenyaIcd11System } from '@medplum/core';
import type { CodeableConcept, Coding, Condition, Encounter, Patient, Reference } from '@medplum/fhirtypes';

/** HL7 condition-ver-status codes a clinician picks from when diagnosing. */
export const KenyaDiagnosisCertainties: readonly { readonly value: string; readonly label: string }[] = [
  { value: 'provisional', label: 'Provisional (working diagnosis)' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'differential', label: 'Differential' },
  { value: 'unconfirmed', label: 'Suspected' },
];

export interface KenyaDiagnosisInput {
  readonly patient: Patient;
  readonly encounter?: Encounter;
  /** The ICD-11 MMS coding chosen from KNHTS. */
  readonly code: Coding;
  /** HL7 condition-ver-status code (KenyaDiagnosisCertainties). */
  readonly verification: string;
  /** HL7 condition-clinical status; defaults to active. */
  readonly clinicalStatus?: CodeableConcept;
  /** When the problem started (YYYY-MM-DD or dateTime); defaults to today. */
  readonly onset?: string;
  /** Who recorded it (the signed-in practitioner). */
  readonly recorder?: Reference;
  readonly note?: string;
}

/**
 * Builds a Kenya diagnosis Condition.
 * @param input - The diagnosis details.
 * @returns The Condition to create.
 */
export function buildKenyaDiagnosis(input: KenyaDiagnosisInput): Condition {
  const coding = { ...input.code, system: input.code.system ?? KenyaIcd11System };
  return {
    resourceType: 'Condition',
    clinicalStatus: input.clinicalStatus ?? {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-clinical', code: 'active' }],
    },
    verificationStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: input.verification }],
    },
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/condition-category',
            code: input.encounter ? 'encounter-diagnosis' : 'problem-list-item',
            display: input.encounter ? 'Encounter Diagnosis' : 'Problem List Item',
          },
        ],
      },
    ],
    code: { coding: [coding], text: coding.display },
    subject: createReference(input.patient),
    encounter: input.encounter ? createReference(input.encounter) : undefined,
    onsetDateTime: input.onset ?? new Date().toISOString().slice(0, 10),
    recordedDate: new Date().toISOString(),
    recorder: input.recorder as Condition['recorder'],
    note: input.note?.trim() ? [{ text: input.note.trim() }] : undefined,
  };
}
