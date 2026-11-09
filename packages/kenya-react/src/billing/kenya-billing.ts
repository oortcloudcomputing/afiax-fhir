// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya billing builders: SHA cover (a Coverage with the SHA as payor), SHA claims for a visit (each
// billed charge under the SHA benefit code the cashier picks, diagnoses in ICD-11) and the lookups
// that tie bills and claims to a visit.

import type { KenyaCoverageEligibilityIdentificationType } from '@medplum/core';
import {
  createReference,
  getReferenceString,
  KenyaIcd11System,
  KenyaInsuranceTypeSystem,
  setKenyaCoverageEligibilityLookupIdentifier,
} from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  ClaimDiagnosis,
  Coding,
  Condition,
  Coverage,
  Encounter,
  Invoice,
  Organization,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';

/** Search for the SHA Organization: the payor of SHA cover. */
export const KenyaShaOrganizationSearch = { identifier: `${KenyaInsuranceTypeSystem}|sha` };

/**
 * Formats a patient's name ("Given Family").
 * @param patient - The patient.
 * @returns The name, or the patient reference when there is none.
 */
export function formatKenyaPatientName(patient: Patient): string {
  const name = patient.name?.[0];
  return [name?.given?.join(' '), name?.family].filter(Boolean).join(' ') || `Patient/${patient.id}`;
}

/**
 * Builds a patient's SHA cover.
 * @param patient - The patient (beneficiary and subscriber).
 * @param sha - The SHA Organization (payor).
 * @param idType - The identifier the SHA eligibility check looks the member up by.
 * @param idNumber - The identifier value.
 * @returns The Coverage to create.
 */
export function buildKenyaShaCoverage(
  patient: Patient,
  sha: Organization,
  idType: KenyaCoverageEligibilityIdentificationType,
  idNumber: string
): Coverage {
  const patientRef = { reference: getReferenceString(patient), display: formatKenyaPatientName(patient) };
  return setKenyaCoverageEligibilityLookupIdentifier(
    {
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: patientRef,
      subscriber: patientRef,
      relationship: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/subscriber-relationship', code: 'self' }],
        text: 'Self',
      },
      payor: [{ reference: getReferenceString(sha), display: sha.name }],
    },
    idType,
    idNumber
  );
}

/**
 * Picks the patient's invoices that bill this visit: those whose lines are this visit's charges.
 * @param invoices - The patient's invoices.
 * @param charges - The visit's charges.
 * @param encounterRef - The visit reference ("Encounter/id").
 * @returns The visit's invoices, newest first.
 */
export function getVisitInvoices(invoices: Invoice[], charges: ChargeItem[], encounterRef: string): Invoice[] {
  const chargeRefs = new Set(charges.map((c) => `ChargeItem/${c.id}`));
  return invoices
    .filter(
      (inv) =>
        inv.lineItem?.some(
          (l) => l.chargeItemReference?.reference && chargeRefs.has(l.chargeItemReference.reference)
        ) || inv.note?.some((n) => n.text === `Bill for ${encounterRef}`)
    )
    .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
}

/** A charge on the claim and the SHA benefit code the cashier chose for it. */
export interface KenyaShaClaimLine {
  readonly charge: ChargeItem;
  readonly shaCode: Coding;
}

export interface KenyaShaClaimInput {
  readonly patient: Patient;
  readonly encounter: Encounter;
  /** The facility making the claim (Claim.provider). */
  readonly facility: Reference<Organization>;
  /** The treating practitioner (care team). */
  readonly practitioner?: Reference<Practitioner>;
  readonly coverage: Coverage;
  readonly lines: readonly KenyaShaClaimLine[];
  /** The visit's diagnoses, principal first. */
  readonly diagnoses: readonly Condition[];
}

/**
 * Builds an SHA claim for a visit.
 * @param input - The visit, cover, lines and diagnoses.
 * @returns The Claim to create (draft until submitted to SHA).
 */
export function buildKenyaShaClaim(input: KenyaShaClaimInput): Claim {
  const encounterRef = createReference(input.encounter);
  const total = input.lines.reduce((sum, l) => sum + (l.charge.priceOverride?.value ?? 0), 0);
  const diagnosis: ClaimDiagnosis[] = input.diagnoses.flatMap((condition, index) => {
    const coding = condition.code?.coding?.find((c) => c.system === KenyaIcd11System);
    return coding
      ? [
          {
            sequence: index + 1,
            diagnosisCodeableConcept: { coding: [coding], text: coding.display },
            type: [{ coding: [{ code: index === 0 ? 'principal' : 'secondary' }] }],
          },
        ]
      : [];
  });
  const start = input.encounter.period?.start ?? new Date().toISOString();
  return {
    resourceType: 'Claim',
    status: 'active',
    use: 'claim',
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'professional' }] },
    created: new Date().toISOString(),
    billablePeriod: { start, end: input.encounter.period?.end ?? start },
    patient: createReference(input.patient),
    provider: input.facility,
    insurer: input.coverage.payor?.[0] as Reference<Organization> | undefined,
    priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal' }] },
    payee: { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/payeetype', code: 'provider' }] } },
    careTeam: input.practitioner ? [{ sequence: 1, provider: input.practitioner }] : undefined,
    insurance: [{ sequence: 1, focal: true, coverage: createReference(input.coverage) }],
    diagnosis: diagnosis.length ? diagnosis : undefined,
    item: input.lines.map((line, index) => {
      const quantity = line.charge.quantity?.value ?? 1;
      const net = line.charge.priceOverride?.value ?? 0;
      return {
        sequence: index + 1,
        careTeamSequence: input.practitioner ? [1] : undefined,
        diagnosisSequence: diagnosis.length ? [1] : undefined,
        encounter: [encounterRef],
        productOrService: { coding: [line.shaCode], text: line.shaCode.display },
        // The service actually given (its KNHTS order name), for checking against the SHA benefit
        category: { text: line.charge.code?.text ?? line.charge.code?.coding?.[0]?.display },
        quantity: { value: quantity },
        unitPrice: { value: quantity ? net / quantity : net, currency: 'KES' },
        net: { value: net, currency: 'KES' },
      };
    }),
    total: { value: total, currency: 'KES' },
  };
}

/**
 * The visit's claims (not pre-authorisations), newest first.
 * @param claims - Claims that reference the visit.
 * @returns The visit's claims.
 */
export function getVisitClaims(claims: Claim[]): Claim[] {
  return claims
    .filter((c) => c.use !== 'preauthorization' && c.status !== 'entered-in-error')
    .sort((a, b) => (b.created ?? '').localeCompare(a.created ?? ''));
}
