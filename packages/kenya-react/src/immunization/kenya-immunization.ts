// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya immunizations, recorded to DHA's Kenya Patient Summary (KPS) Immunization profile
// (https://fhir.dha.go.ke/kps/StructureDefinition/ke-kps-immunization, version 0.1.0):
// - status (completed | not-done | entered-in-error);
// - vaccineCode from the KPS ATC vaccine code system;
// - patient, date given, lot number, performer;
// - protocolApplied with a series name, exactly one target disease (the KPS target-disease code
//   system) and the dose number.
//
// Every vaccine and target-disease code below was checked against DHA's KPS package on 2026-11-10.

import { createReference } from '@medplum/core';
import type { Immunization, Patient, Reference } from '@medplum/fhirtypes';

export const KenyaKpsImmunizationProfile = 'https://fhir.dha.go.ke/kps/StructureDefinition/ke-kps-immunization|0.1.0';
export const KenyaVaccineAtcSystem = 'https://fhir.dha.go.ke/terminology/CodeSystem/kps-vaccine-atc-cs';
export const KenyaTargetDiseaseSystem = 'https://fhir.dha.go.ke/terminology/CodeSystem/kps-target-diseases-cs';

export interface KenyaVaccine {
  /** Short name used by health workers. */
  readonly label: string;
  /** ATC code and display, as in DHA's KPS vaccine code system. */
  readonly code: string;
  readonly display: string;
  /** Series name recorded in protocolApplied.series. */
  readonly series: string;
  /** The one target disease DHA's profile allows (for combined vaccines, the first one listed). */
  readonly targetDisease: { readonly code: string; readonly display: string };
  /** Doses in the routine series, for the dose number picker. */
  readonly doses: number;
}

/** Kenya Expanded Programme on Immunization (KEPI) vaccines and other vaccines in routine use. */
export const KenyaVaccines: readonly KenyaVaccine[] = [
  {
    label: 'BCG',
    code: 'J07AN01',
    display: 'tuberculosis, live attenuated',
    series: 'BCG',
    targetDisease: { code: 'A15', display: 'Respiratory tuberculosis, bacteriologically and histologically confirmed' },
    doses: 1,
  },
  {
    label: 'bOPV (oral polio)',
    code: 'J07BF04',
    display: 'poliomyelitis oral, bivalent, live attenuated',
    series: 'OPV',
    targetDisease: { code: 'A80', display: 'Acute poliomyelitis' },
    doses: 4,
  },
  {
    label: 'IPV (inactivated polio)',
    code: 'J07BF03',
    display: 'poliomyelitis, trivalent, inactivated, whole virus',
    series: 'IPV',
    targetDisease: { code: 'A80', display: 'Acute poliomyelitis' },
    doses: 2,
  },
  {
    label: 'Pentavalent (DPT-HepB-Hib)',
    code: 'J07CA11',
    display: 'diphtheria-haemophilus influenzae B-pertussis-tetanus-hepatitis B',
    series: 'Pentavalent',
    targetDisease: { code: 'A36', display: 'Diphtheria' },
    doses: 3,
  },
  {
    label: 'PCV (pneumococcal)',
    code: 'J07AL52',
    display: 'pneumococcus purified polysaccharides antigen and haemophilus influenzae, conjugated',
    series: 'PCV',
    targetDisease: {
      code: 'B95.3',
      display: 'Streptococcus pneumoniae as the cause of diseases classified to other chapters',
    },
    doses: 3,
  },
  {
    label: 'Rotavirus',
    code: 'J07BH01',
    display: 'rota virus, live attenuated',
    series: 'Rotavirus',
    targetDisease: { code: 'A08.0', display: 'Rotaviral enteritis' },
    doses: 3,
  },
  {
    label: 'Measles-Rubella (MR)',
    code: 'J07BD53',
    display: 'measles, combinations with rubella, live attenuated',
    series: 'MR',
    targetDisease: { code: 'B05', display: 'Measles' },
    doses: 2,
  },
  {
    label: 'Yellow fever',
    code: 'J07BL01',
    display: 'yellow fever, live attenuated',
    series: 'Yellow fever',
    targetDisease: { code: 'A95', display: 'Yellow fever' },
    doses: 1,
  },
  {
    label: 'Malaria (RTS,S / R21)',
    code: 'J07XA01',
    display: 'malaria vaccines',
    series: 'Malaria',
    targetDisease: { code: 'B50', display: 'Plasmodium falciparum malaria' },
    doses: 4,
  },
  {
    label: 'HPV',
    code: 'J07BM01',
    display: 'papillomavirus (human types 6, 11, 16, 18)',
    series: 'HPV',
    targetDisease: { code: 'B97.7', display: 'Papillomavirus as the cause of diseases classified to other chapters' },
    doses: 2,
  },
  {
    label: 'Td (tetanus-diphtheria)',
    code: 'J07AM51',
    display: 'tetanus toxoid, combinations with diphtheria toxoid',
    series: 'Td',
    targetDisease: { code: 'A35', display: 'Other tetanus' },
    doses: 5,
  },
  {
    label: 'Hepatitis B',
    code: 'J07BC01',
    display: 'hepatitis B, purified antigen',
    series: 'Hepatitis B',
    targetDisease: { code: 'B16', display: 'Acute hepatitis B' },
    doses: 3,
  },
  {
    label: 'Typhoid',
    code: 'J07AP03',
    display: 'typhoid, purified polysaccharide antigen',
    series: 'Typhoid',
    targetDisease: { code: 'A01', display: 'Typhoid and paratyphoid fevers' },
    doses: 1,
  },
];

export interface KenyaImmunizationInput {
  readonly patient: Patient;
  readonly vaccine: KenyaVaccine;
  readonly doseNumber: number;
  /** When it was given (ISO dateTime). */
  readonly occurrence: string;
  readonly lotNumber?: string;
  /** Not given: records the reason instead of a dose. */
  readonly notGivenReason?: string;
  /** The health worker (signed-in practitioner). */
  readonly performer?: Reference;
  /** Where it was given (facility). */
  readonly location?: Reference;
}

/**
 * Builds an Immunization to DHA's KPS Immunization profile.
 * @param input - The patient, vaccine and dose details.
 * @returns The Immunization to create.
 */
export function buildKenyaImmunization(input: KenyaImmunizationInput): Immunization {
  const { vaccine } = input;
  const notGiven = !!input.notGivenReason?.trim();
  return {
    resourceType: 'Immunization',
    meta: { profile: [KenyaKpsImmunizationProfile] },
    status: notGiven ? 'not-done' : 'completed',
    statusReason: notGiven ? { text: input.notGivenReason?.trim() } : undefined,
    vaccineCode: {
      coding: [{ system: KenyaVaccineAtcSystem, code: vaccine.code, display: vaccine.display }],
      text: vaccine.label,
    },
    patient: createReference(input.patient as Patient & { id: string }),
    occurrenceDateTime: input.occurrence,
    recorded: new Date().toISOString(),
    primarySource: true,
    lotNumber: input.lotNumber?.trim() || undefined,
    location: input.location as Immunization['location'],
    performer: input.performer
      ? [{ actor: input.performer as NonNullable<Immunization['performer']>[number]['actor'] }]
      : undefined,
    protocolApplied: [
      {
        series: vaccine.series,
        targetDisease: [
          {
            coding: [
              {
                system: KenyaTargetDiseaseSystem,
                code: vaccine.targetDisease.code,
                display: vaccine.targetDisease.display,
              },
            ],
          },
        ],
        doseNumberPositiveInt: input.doseNumber,
      },
    ],
  };
}

/**
 * The display name of an Immunization's vaccine: the KEPI label when known, else the coded display.
 * @param immunization - The Immunization.
 * @returns The vaccine name.
 */
export function getKenyaVaccineName(immunization: Immunization): string {
  const code = immunization.vaccineCode?.coding?.find((c) => c.system === KenyaVaccineAtcSystem)?.code;
  return (
    KenyaVaccines.find((v) => v.code === code)?.label ??
    immunization.vaccineCode?.text ??
    immunization.vaccineCode?.coding?.[0]?.display ??
    'Vaccine'
  );
}
