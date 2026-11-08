// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA claim from a bill (DHA eClaims ke-eclaims-claimsubmission, IG 0.1.0).
//
// In the eClaims model the claim lines are SHA interventions (KNHTS MOH-KENYA/
// BenefitsAndInterventions, e.g. SHA-12-001), not the facility's own bill lines. The itemised bill
// travels with the claim as the eclaims-patient-invoice extension: its number, date, amount and the
// patient's share (bill total minus the amount claimed from SHA). So the claims clerk picks the
// interventions when making the claim, as for pre-authorisation; each line's price defaults to the
// KNHTS SHA tariff for the facility's level, and a clerk-entered price is used when KNHTS has none.
//
// The Claim carries what the profile requires: meta.profile, identifier, type (institutional),
// subType (from the encounter class), use = claim, patient, billablePeriod, insurer (the
// Coverage payor), provider (the bill's issuer), payee type provider, at least one ICD-11 diagnosis
// (from the encounter's conditions), insurance, items with category, quantity, unitPrice and net,
// and total. Codes are sent under DHA's terminology URIs (icd11-codes-cs,
// kenya-social-health-authority-intervention-cs) with the KNHTS coding alongside, because the two
// publish the same codes under different system URIs (change register 3.13).
//
// One active claim per bill. Submission to SHA is Claim/$submit-national-claim (unchanged).

import type { WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  getKenyaFacilityRegistrySnapshot,
  getReferenceString,
  KenyaIcd11System,
  KenyaShaInterventionSystem,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  ClaimCareTeam,
  ClaimItem,
  CodeableConcept,
  Condition,
  Coverage,
  Encounter,
  Invoice,
  Organization,
  Reference,
} from '@medplum/fhirtypes';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedRequestContext } from '../../context';
import { KenyaInvoiceCurrency, KenyaInvoiceNumberSystem } from './invoice';
import { isKnhtsValidationEnabled, KnhtsSources, lookupKnhtsConcept } from './knhts';

export const EclaimsClaimSubmissionProfile = 'https://fhir.dha.go.ke/claims/StructureDefinition/ke-eclaims-claimsubmission';
export const EclaimsPatientInvoiceExtension = 'https://fhir.dha.go.ke/claims/StructureDefinition/eclaims-patient-invoice';
export const DhaIcd11System = 'https://fhir.dha.go.ke/terminology/CodeSystem/icd11-codes-cs';
export const DhaShaInterventionSystem =
  'https://fhir.dha.go.ke/terminology/CodeSystem/kenya-social-health-authority-intervention-cs';
const DhaClaimTypeSystem = 'https://fhir.dha.go.ke/terminology/CodeSystem/claim-type-cs';
const DhaClaimSubtypeSystem = 'https://fhir.dha.go.ke/terminology/CodeSystem/claim-subtype-cs';
const DhaCareTeamRoleSystem = 'https://fhir.dha.go.ke/terminology/CodeSystem/claim-care-team-role-cs';
const BenefitCategorySystem = 'http://terminology.hl7.org/CodeSystem/ex-benefitcategory';

/** Afiax claim numbers, e.g. CLM-20261108-3F9A2C. SHA assigns its own on submission. */
export const KenyaClaimNumberSystem = 'https://afiax.africa/kenya/identifier/claim-number';
/** The bill a claim was made from (Invoice/<id>), so a bill is claimed once. */
export const KenyaClaimInvoiceSystem = 'https://afiax.africa/kenya/identifier/claim-invoice';

/** ex-benefitcategory codes a clerk may choose (http://terminology.hl7.org/CodeSystem/ex-benefitcategory). */
const BenefitCategories: Readonly<Record<string, string>> = {
  '1': 'Medical Care',
  '2': 'Surgical',
  '3': 'Consultation',
  '4': 'Diagnostic XRay',
  '5': 'Diagnostic Lab',
  '6': 'Renal Supplies',
  '7': 'Diagnostic Dental',
  '8': 'Periodontics',
  '9': 'Restorative',
  '10': 'Endodontics',
  '11': 'Maxillofacial Prosthetics',
  '12': 'Adjunctive Dental Services',
  '13': 'Health Benefit Plan Coverage',
  '14': 'Dental Care',
  '15': 'Dental Crowns',
  '16': 'Dental Accident',
  '17': 'Hospital Room and Board',
  '18': 'Major Medical',
  '19': 'Medically Related Transportation',
  '20': 'In-vitro Fertilization',
  '21': 'MRI Scan',
  '22': 'Donor Procedures',
  '23': 'Maternity',
  '24': 'Renal dialysis',
  '25': 'Medical Coverage',
  '26': 'Dental Coverage',
  '27': 'Hearing Coverage',
  '28': 'Vision Coverage',
  '29': 'Mental Health',
  '30': 'Hospital Stay',
};

const SubtypeByEncounterClass: Readonly<Record<string, { code: string; display: string }>> = {
  AMB: { code: 'outpatient', display: 'Outpatient' },
  VR: { code: 'outpatient', display: 'Outpatient' },
  HH: { code: 'outpatient', display: 'Outpatient' },
  IMP: { code: 'inpatient', display: 'Inpatient' },
  ACUTE: { code: 'inpatient', display: 'Inpatient' },
  NONAC: { code: 'inpatient', display: 'Inpatient' },
  EMER: { code: 'emergency', display: 'Emergency' },
  SS: { code: 'day-case', display: 'Day Case' },
};

export interface KenyaClaimIntervention {
  /** SHA intervention code from KNHTS BenefitsAndInterventions, e.g. SHA-12-001. */
  readonly code: string;
  readonly quantity?: number;
  /** Price per unit in KES; required when KNHTS has no tariff for the facility's level. */
  readonly unitPrice?: number;
  /** ex-benefitcategory code; default 1 (Medical Care). */
  readonly category?: string;
}

export interface KenyaClaimFromInvoiceInput {
  readonly coverage: Reference<Coverage>;
  readonly interventions: readonly KenyaClaimIntervention[];
  /** SHA pre-authorisation reference, when the intervention needed one. */
  readonly preAuthRef?: string;
}

export interface KenyaClaimFromInvoiceResult {
  readonly claim: WithId<Claim>;
  readonly claimed: number;
  readonly patientShare: number;
}

const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (cents: number): number => cents / 100;

/**
 * A new claim number: the date plus 6 random hex characters.
 * @param now - Claim time.
 * @returns The number.
 */
export function newKenyaClaimNumber(now: Date): string {
  const day = now.toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 10).replaceAll('-', '');
  return `CLM-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * The facility level as a number (2–6), from the registry value ("Level 4", "4", "LEVEL 4B").
 * @param level - The registry value.
 * @returns The level, or undefined.
 */
export function parseKenyaFacilityLevel(level: string | null | undefined): number | undefined {
  const match = /([2-6])/.exec(level ?? '');
  return match ? Number(match[1]) : undefined;
}

/**
 * The SHA tariff for a facility level from a KNHTS intervention's extras (level_N_tariff).
 * @param extras - The concept's extras.
 * @param level - The facility level.
 * @returns The tariff in KES, or undefined when KNHTS has none (or 0).
 */
export function shaTariffForLevel(extras: Readonly<Record<string, unknown>> | undefined, level: number | undefined): number | undefined {
  if (!extras || !level) {
    return undefined;
  }
  const amount = Number(extras[`level_${level}_tariff`] ?? 0);
  return Number.isFinite(amount) && amount > 0 ? amount : undefined;
}

/**
 * Makes an SHA claim (ke-eclaims-claimsubmission) from an issued or paid bill.
 * @param ctx - The caller's context; the caller's repository applies its access policies.
 * @param invoice - The bill.
 * @param input - The Coverage and the SHA interventions the clerk picked.
 * @param now - Clock, for tests.
 * @returns The Claim, the amount claimed and the patient's share.
 */
export async function createKenyaClaimFromInvoice(
  ctx: Pick<AuthenticatedRequestContext, 'repo' | 'profile'>,
  invoice: WithId<Invoice>,
  input: KenyaClaimFromInvoiceInput,
  now: Date = new Date()
): Promise<KenyaClaimFromInvoiceResult> {
  if (invoice.status !== 'issued' && invoice.status !== 'balanced') {
    throw new OperationOutcomeError(badRequest(`A ${invoice.status} bill cannot be claimed`));
  }
  if (!input.interventions.length) {
    throw new OperationOutcomeError(badRequest('Pick at least one SHA intervention to claim'));
  }
  const currency = invoice.totalGross?.currency ?? KenyaInvoiceCurrency;
  if (currency !== KenyaInvoiceCurrency) {
    throw new OperationOutcomeError(badRequest(`Bills must be in ${KenyaInvoiceCurrency}`));
  }

  // One active claim per bill
  const existing = await ctx.repo.searchResources<Claim>({
    resourceType: 'Claim',
    filters: [
      { code: 'identifier', operator: Operator.EQUALS, value: `${KenyaClaimInvoiceSystem}|${getReferenceString(invoice)}` },
    ],
  });
  const active = existing.find((c) => c.status === 'active' || c.status === 'draft');
  if (active) {
    throw new OperationOutcomeError(badRequest(`This bill is already claimed (${getReferenceString(active)})`));
  }

  const coverage = await ctx.repo.readReference<Coverage>(input.coverage);
  if (coverage.status !== 'active') {
    throw new OperationOutcomeError(badRequest(`The coverage is ${coverage.status}`));
  }
  if (coverage.beneficiary?.reference !== invoice.subject?.reference) {
    throw new OperationOutcomeError(badRequest('The coverage is not for the billed patient'));
  }
  const insurer = coverage.payor?.find((p) => p.reference?.startsWith('Organization/')) as Reference<Organization> | undefined;
  if (!insurer) {
    throw new OperationOutcomeError(badRequest('The coverage has no paying organisation'));
  }
  if (!invoice.issuer?.reference?.startsWith('Organization/')) {
    throw new OperationOutcomeError(badRequest('The bill has no issuing facility'));
  }
  const facility = await ctx.repo.readReference<Organization>(invoice.issuer);
  const level = parseKenyaFacilityLevel(getKenyaFacilityRegistrySnapshot(facility)?.facilityLevel);

  const encounter = await readBillEncounter(ctx, invoice);
  const diagnosis = await readDiagnoses(ctx, encounter);
  if (!diagnosis.length) {
    throw new OperationOutcomeError(badRequest('The encounter has no ICD-11 diagnosis; SHA claims need at least one'));
  }
  const careTeam = buildCareTeam(encounter);

  // Claim lines: the clerk's interventions, priced from KNHTS tariffs where there is no price
  const items: ClaimItem[] = [];
  const unpriced: string[] = [];
  const unknown: string[] = [];
  let totalCents = 0;
  for (const [index, pick] of input.interventions.entries()) {
    const code = pick.code?.trim();
    if (!code) {
      throw new OperationOutcomeError(badRequest(`Intervention ${index + 1} has no code`));
    }
    const quantity = pick.quantity ?? 1;
    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new OperationOutcomeError(badRequest(`${code}: the quantity must be more than zero`));
    }
    const category = pick.category ?? '1';
    if (!BenefitCategories[category]) {
      throw new OperationOutcomeError(badRequest(`${code}: unknown benefit category ${category}`));
    }
    const concept = isKnhtsValidationEnabled() ? await lookupKnhtsConcept(KnhtsSources.shaInterventions, code) : undefined;
    if (concept?.status === 'not-found' || (concept?.status === 'found' && concept.retired)) {
      unknown.push(code);
      continue;
    }
    const found = concept?.status === 'found' ? concept : undefined;
    const unitPrice = pick.unitPrice ?? shaTariffForLevel(found?.extras, level);
    if (typeof unitPrice !== 'number' || toCents(unitPrice) <= 0) {
      unpriced.push(code);
      continue;
    }
    const netCents = Math.round(toCents(unitPrice) * quantity);
    totalCents += netCents;
    const display = found?.display ?? code;
    items.push({
      sequence: index + 1,
      ...(careTeam.length ? { careTeamSequence: [1] } : {}),
      diagnosisSequence: diagnosis.map((d) => d.sequence),
      category: { coding: [{ system: BenefitCategorySystem, code: category, display: BenefitCategories[category] }] },
      productOrService: {
        coding: [
          { system: DhaShaInterventionSystem, code, display },
          { system: KenyaShaInterventionSystem, code, display },
        ],
        text: display,
      },
      servicedDate: (invoice.date ?? now.toISOString()).slice(0, 10),
      quantity: { value: quantity },
      unitPrice: { value: unitPrice, currency: KenyaInvoiceCurrency },
      net: { value: fromCents(netCents), currency: KenyaInvoiceCurrency },
    });
  }
  if (unknown.length) {
    throw new OperationOutcomeError(badRequest(`Not SHA interventions in KNHTS: ${unknown.join(', ')}`));
  }
  if (unpriced.length) {
    throw new OperationOutcomeError(
      badRequest(`KNHTS has no SHA tariff for these at this facility's level; enter a price: ${unpriced.join(', ')}`)
    );
  }

  const billCents = toCents(invoice.totalGross?.value ?? 0);
  if (totalCents > billCents) {
    throw new OperationOutcomeError(
      badRequest(`The claim (KES ${fromCents(totalCents)}) is more than the bill (KES ${fromCents(billCents)})`)
    );
  }
  const patientShareCents = billCents - totalCents;
  const invoiceNumber = invoice.identifier?.find((i) => i.system === KenyaInvoiceNumberSystem)?.value;
  const issued = now.toISOString();
  const start = (encounter?.period?.start ?? invoice.date ?? issued).slice(0, 10);
  const end = (encounter?.period?.end ?? invoice.date ?? issued).slice(0, 10);
  const subtype = SubtypeByEncounterClass[encounter?.class?.code ?? ''] ?? SubtypeByEncounterClass.AMB;

  const claim = await ctx.repo.createResource<Claim>({
    resourceType: 'Claim',
    meta: { profile: [EclaimsClaimSubmissionProfile] },
    extension: [
      {
        url: EclaimsPatientInvoiceExtension,
        extension: [
          ...(invoiceNumber ? [{ url: 'invoiceNumber', valueString: invoiceNumber }] : []),
          { url: 'invoiceDate', valueDate: (invoice.date ?? issued).slice(0, 10) },
          { url: 'invoiceAmount', valueMoney: { value: fromCents(billCents), currency: KenyaInvoiceCurrency } },
          { url: 'patientShare', valueMoney: { value: fromCents(patientShareCents), currency: KenyaInvoiceCurrency } },
          ...(invoiceNumber
            ? [{ url: 'patientInvoiceIdentifier', valueIdentifier: { system: KenyaInvoiceNumberSystem, value: invoiceNumber } }]
            : []),
        ],
      },
    ],
    identifier: [
      { system: KenyaClaimNumberSystem, value: newKenyaClaimNumber(now) },
      { system: KenyaClaimInvoiceSystem, value: getReferenceString(invoice) },
    ],
    status: 'active',
    type: { coding: [{ system: DhaClaimTypeSystem, code: 'institutional', display: 'Institutional' }] },
    subType: { coding: [{ system: DhaClaimSubtypeSystem, ...subtype }] },
    use: 'claim',
    patient: invoice.subject as Claim['patient'],
    billablePeriod: { start, end },
    created: issued,
    enterer: ctx.profile as Claim['enterer'],
    insurer,
    provider: invoice.issuer,
    priority: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/processpriority', code: 'normal', display: 'Normal' }] },
    payee: { type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/payeetype', code: 'provider', display: 'Provider' }] } },
    ...(careTeam.length ? { careTeam } : {}),
    diagnosis,
    insurance: [
      {
        sequence: 1,
        focal: true,
        coverage: createReference(coverage),
        ...(input.preAuthRef?.trim() ? { preAuthRef: [input.preAuthRef.trim()] } : {}),
      },
    ],
    item: items,
    total: { value: fromCents(totalCents), currency: KenyaInvoiceCurrency },
  });
  return { claim, claimed: fromCents(totalCents), patientShare: fromCents(patientShareCents) };
}

/**
 * The encounter a bill is for: the context of its first charge.
 * @param ctx - The caller's context.
 * @param invoice - The bill.
 * @returns The encounter, if the bill's charges name one.
 */
async function readBillEncounter(
  ctx: Pick<AuthenticatedRequestContext, 'repo'>,
  invoice: Invoice
): Promise<WithId<Encounter> | undefined> {
  const chargeRef = invoice.lineItem?.find((l) => l.chargeItemReference)?.chargeItemReference;
  if (!chargeRef?.reference) {
    return undefined;
  }
  const charge = await ctx.repo.readReference<ChargeItem>(chargeRef);
  return charge.context?.reference?.startsWith('Encounter/')
    ? ctx.repo.readReference<Encounter>(charge.context as Reference<Encounter>)
    : undefined;
}

/**
 * The encounter's ICD-11 diagnoses: Encounter.diagnosis first, then conditions recorded against it.
 * @param ctx - The caller's context.
 * @param encounter - The encounter.
 * @returns The Claim diagnoses, coded under DHA's and WHO's ICD-11 system URIs.
 */
async function readDiagnoses(
  ctx: Pick<AuthenticatedRequestContext, 'repo'>,
  encounter: WithId<Encounter> | undefined
): Promise<NonNullable<Claim['diagnosis']>> {
  if (!encounter) {
    return [];
  }
  const conditions: Condition[] = [];
  for (const d of encounter.diagnosis ?? []) {
    if (d.condition?.reference?.startsWith('Condition/')) {
      conditions.push(await ctx.repo.readReference<Condition>(d.condition as Reference<Condition>));
    }
  }
  if (!conditions.length) {
    conditions.push(
      ...(await ctx.repo.searchResources<Condition>({
        resourceType: 'Condition',
        filters: [{ code: 'encounter', operator: Operator.EQUALS, value: getReferenceString(encounter) }],
      }))
    );
  }
  const seen = new Set<string>();
  const out: NonNullable<Claim['diagnosis']> = [];
  for (const condition of conditions) {
    const icd = condition.code?.coding?.find((c) => c.system === KenyaIcd11System && c.code);
    if (!icd?.code || seen.has(icd.code)) {
      continue;
    }
    seen.add(icd.code);
    const display = icd.display ?? condition.code?.text ?? icd.code;
    const code: CodeableConcept = {
      coding: [
        { system: DhaIcd11System, code: icd.code, display },
        { system: KenyaIcd11System, code: icd.code, display },
      ],
      text: display,
    };
    out.push({ sequence: out.length + 1, diagnosisCodeableConcept: code });
  }
  return out;
}

/**
 * The care team from the encounter's practitioners; the first is the primary provider.
 * @param encounter - The encounter.
 * @returns The Claim care team.
 */
function buildCareTeam(encounter: Encounter | undefined): ClaimCareTeam[] {
  const practitioners = (encounter?.participant ?? [])
    .map((p) => p.individual)
    .filter((r) => !!r?.reference?.startsWith('Practitioner/'));
  return practitioners.map((provider, i) => ({
    sequence: i + 1,
    provider: provider as ClaimCareTeam['provider'],
    role: {
      coding: [
        i === 0
          ? { system: DhaCareTeamRoleSystem, code: 'PRIMARY', display: 'Primary provider' }
          : { system: DhaCareTeamRoleSystem, code: 'ASSIST', display: 'Assisting provider' },
      ],
    },
  }));
}
