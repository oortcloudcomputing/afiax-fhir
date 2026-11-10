// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA coverage lookups through the DHA HIE middleware: what an eligible patient can receive at
// this facility, before the visit is started.
//
// Follows https://hie-docs.dha.go.ke (checked 2026-11-10, pages last modified 2026-09-28):
// - Eligibility Process overview (docs/claims/process/eligibility): eligibility check first, then
//   benefits -> sub-benefits -> interventions, then utilization as needed.
// - Benefits Coverage (GET /patients/benefits), Sub-Benefits Coverage (GET /patients/sub-benefits),
//   Intervention Coverage (GET /patients/benefits/interventions), Patient Utilization
//   (GET /patients/benefits/utilization).
// - Integration Scenarios overview (docs/scenarios/overview): the intervention flags
//   (fund, accessPoint, paymentMechanism, needsPreauth, needsManualPreauthApproval) pick the
//   scenario, and the scenario decides preauth and claim dispatch (submit or discharge).
//
// The facility comes from the facility-scoped token (or the X-Facility-Id headers), never a field.
// The sub-benefit accessPoint gates whether it can be billed on this visit: IP is inpatient only,
// OP outpatient only, "OP and IP" either; MR and any value not recognised are not selectable.
// Values are compared case-insensitively.
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { requestKenyaHie } from './afyalink';
import { KenyaHieRequestError } from './hie-visit';

/** The visit the coverage is for: outpatient or inpatient. */
export type KenyaShaVisitType = 'OP' | 'IP';

export interface KenyaHieBenefit {
  readonly code: string | null;
  readonly name: string | null;
}

export interface KenyaHieSubBenefit {
  readonly code: string | null;
  readonly name: string | null;
  readonly parentBenefitCode: string | null;
  readonly parentBenefit: string | null;
  /** As DHA returns it: IP, OP, "OP and IP" or MR. */
  readonly accessPoint: string | null;
  readonly fund: string | null;
  readonly active: boolean | null;
  readonly applicableLimit: string | null;
  readonly allowedInterventions: readonly string[];
  readonly cover: {
    readonly policyNumber: string | null;
    readonly category: string | null;
    readonly group: string | null;
    readonly validFrom: string | null;
    readonly validTo: string | null;
  } | null;
}

export type KenyaShaScenarioId = 1 | 2 | 3 | 4 | 5 | 6;

export interface KenyaShaScenario {
  readonly id: KenyaShaScenarioId;
  readonly name: string;
  /** Whether a preauthorization is needed before the claim, and which kind. */
  readonly preauth: 'none' | 'normal' | 'elective';
  /** How the claim is dispatched: POST /claims/submit (outpatient) or POST /claims/discharge (inpatient). */
  readonly dispatch: 'submit' | 'discharge';
}

/** DHA's scenario decision matrix (docs/scenarios/overview). Emergency (7 and 8) has its own flow. */
export const KenyaShaScenarios: Record<KenyaShaScenarioId, KenyaShaScenario> = {
  1: { id: 1, name: 'SHIF IP Per Diem', preauth: 'none', dispatch: 'discharge' },
  2: { id: 2, name: 'SHIF IP FFS Normal Preauth', preauth: 'normal', dispatch: 'discharge' },
  3: { id: 3, name: 'SHIF IP FFS Elective Preauth', preauth: 'elective', dispatch: 'discharge' },
  4: { id: 4, name: 'SHIF OP FFS Elective Preauth', preauth: 'elective', dispatch: 'submit' },
  5: { id: 5, name: 'SHIF OP FFS Normal Preauth', preauth: 'normal', dispatch: 'submit' },
  6: { id: 6, name: 'UHC OP Capitation', preauth: 'none', dispatch: 'submit' },
};

export interface KenyaHieIntervention {
  readonly code: string | null;
  readonly name: string | null;
  readonly subBenefitCode: string | null;
  readonly subBenefitName: string | null;
  readonly parentBenefitCode: string | null;
  readonly accessPoint: string | null;
  readonly fund: string | null;
  readonly supportedScheme: string | null;
  readonly paymentMechanism: string | null;
  readonly needsPreauth: boolean | null;
  /** true means an elective preauth (pre-visit authorization). */
  readonly needsManualPreauthApproval: boolean | null;
  readonly needsDoctorAuthorization: boolean | null;
  readonly needsMemberAuthorization: boolean | null;
  readonly needApprovalBeforeClaimSubmission: boolean | null;
  /** Specialised preauth types flagged on the intervention (oncology, optical, radiology, renal, surgical). */
  readonly specialPreauth: readonly string[];
  readonly requiredPreauthDocumentTypes: readonly string[];
  readonly applicableDocumentTypes: readonly string[];
  /** The tariff at this facility's KEPH level, else the overall tariff. */
  readonly tariff: number | null;
  readonly annualLimitValue: number | null;
  readonly lowerAgeLimit: number | null;
  readonly upperAgeLimit: number | null;
  readonly applicableGender: string | null;
  readonly diagnosisList: readonly string[];
  readonly active: boolean | null;
}

export interface KenyaHiePage<T> {
  readonly count: number;
  readonly currentPage: number | null;
  readonly totalPages: number | null;
  readonly results: readonly T[];
}

export interface KenyaHieUtilization {
  readonly code: string | null;
  readonly limitScope: string | null;
  readonly eligible: boolean | null;
  readonly individualMaxLimit: number | null;
  readonly individualUtilisedLimit: number | null;
  readonly householdMaxLimit: number | null;
  readonly householdUtilisedLimit: number | null;
  readonly limitAvailableAmount: number | null;
  readonly individualLimitAvailableCount: number | null;
  readonly householdLimitAvailableCount: number | null;
  readonly coverageStartDate: string | null;
  readonly coverageEndDate: string | null;
  readonly nextAvailableDate: string | null;
  readonly utilizationDays: number | null;
  readonly funds: readonly {
    readonly fundType: string | null;
    readonly maxAmount: number | null;
    readonly utilisedAmount: number | null;
    readonly availableAmount: number | null;
  }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function str(value: unknown): string | null {
  if (typeof value === 'number') {
    return String(value);
  }
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(str).filter((v): v is string => !!v) : [];
}

function requirePatient(patientId: string): string {
  const trimmed = patientId?.trim();
  if (!trimmed) {
    throw new Error('The patient Client Registry ID is required');
  }
  return trimmed;
}

function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toPage<T>(body: unknown, map: (record: Record<string, unknown>) => T): KenyaHiePage<T> {
  const payload = isRecord(body) ? body : {};
  const results = asList(Array.isArray(payload.results) ? payload.results : body).filter(isRecord);
  return {
    count: num(payload.count) ?? results.length,
    currentPage: num(payload.currentPage),
    totalPages: num(payload.totalPages),
    results: results.map(map),
  };
}

/**
 * The visit types an access point allows. IP and OP as tokens, case-insensitive; MR and anything
 * not recognised allow neither, as DHA says.
 * @param accessPoint - The accessPoint DHA returned.
 * @returns The visit types it can be billed on.
 */
export function getKenyaShaAccessPointVisitTypes(accessPoint: string | null | undefined): KenyaShaVisitType[] {
  const tokens = (accessPoint ?? '')
    .toUpperCase()
    .split(/[^A-Z]+/)
    .filter((t) => t && t !== 'AND');
  if (tokens.length === 0 || tokens.some((t) => t !== 'OP' && t !== 'IP')) {
    return [];
  }
  return (['OP', 'IP'] as const).filter((t) => tokens.includes(t));
}

function canBill(accessPoint: string | null, visitType: KenyaShaVisitType | undefined): boolean {
  return !visitType || getKenyaShaAccessPointVisitTypes(accessPoint).includes(visitType);
}

function normalizeMechanism(value: string | null): string | null {
  return value ? value.toUpperCase().replace(/[\s-]+/g, '_') : null;
}

/**
 * Picks DHA's integration scenario for an intervention on a visit, from the decision matrix.
 * Returns undefined when the flags match no scenario (including emergency, which DHA runs as its
 * own flow): the caller must not guess a preauth or dispatch path.
 * @param intervention - The intervention flags from Intervention Coverage.
 * @param visitType - The visit: OP or IP.
 * @returns The scenario, or undefined.
 */
export function selectKenyaShaScenario(
  intervention: Pick<
    KenyaHieIntervention,
    'fund' | 'accessPoint' | 'paymentMechanism' | 'needsPreauth' | 'needsManualPreauthApproval'
  >,
  visitType: KenyaShaVisitType
): KenyaShaScenario | undefined {
  if (!getKenyaShaAccessPointVisitTypes(intervention.accessPoint).includes(visitType)) {
    return undefined;
  }
  const mechanism = normalizeMechanism(intervention.paymentMechanism);
  const fund = intervention.fund?.trim().toUpperCase();
  if (mechanism === 'CAPITATION') {
    return visitType === 'OP' ? KenyaShaScenarios[6] : undefined;
  }
  if (fund !== 'SHIF') {
    return undefined;
  }
  const preauth = intervention.needsPreauth;
  const elective = intervention.needsManualPreauthApproval === true;
  if (visitType === 'IP') {
    if (mechanism === 'PER_DIEM' && preauth === false) {
      return KenyaShaScenarios[1];
    }
    if (mechanism === 'FEE_FOR_SERVICE' && preauth === true) {
      return elective ? KenyaShaScenarios[3] : KenyaShaScenarios[2];
    }
    return undefined;
  }
  if (mechanism === 'FEE_FOR_SERVICE' && preauth === true) {
    return elective ? KenyaShaScenarios[4] : KenyaShaScenarios[5];
  }
  return undefined;
}

/**
 * Lists the patient's benefits (parent level) at this facility (GET /patients/benefits).
 * @param credentials - The HIE credentials (facility-scoped).
 * @param patientId - The patient's Client Registry ID.
 * @returns The benefits.
 */
export async function getKenyaHieBenefits(
  credentials: KenyaAfyaLinkCredentials,
  patientId: string
): Promise<KenyaHiePage<KenyaHieBenefit>> {
  const result = await requestKenyaHie(credentials, 'GET', '/patients/benefits', {
    params: { patient_id: requirePatient(patientId) },
  });
  if (!result.ok) {
    throw new KenyaHieRequestError('benefits coverage', result);
  }
  return toPage(result.body, (b) => ({ code: str(b.parentBenefitCode), name: str(b.parentBenefit) }));
}

function normalizeSubBenefit(s: Record<string, unknown>): KenyaHieSubBenefit {
  const cover = isRecord(s.cover) ? s.cover : undefined;
  return {
    code: str(s.code),
    name: str(s.name),
    parentBenefitCode: str(s.parentBenefitCode),
    parentBenefit: str(s.parentBenefit),
    accessPoint: str(s.accessPoint),
    fund: str(s.fund),
    active: bool(s.active),
    applicableLimit: str(s.applicableLimit),
    allowedInterventions: strings(s.allowedInterventions),
    cover: cover
      ? {
          policyNumber: str(cover.effectivePolicyNumber) ?? str(cover.policyNumber),
          category: str(cover.category),
          group: str(cover.group),
          validFrom: str(cover.validFrom),
          validTo: str(cover.validTo),
        }
      : null,
  };
}

/**
 * Lists the sub-benefits the patient is covered for at this facility (GET /patients/sub-benefits).
 * With a visit type, only those billable on that visit are returned (DHA: filter on access point
 * before showing the list).
 * @param credentials - The HIE credentials (facility-scoped).
 * @param patientId - The patient's Client Registry ID.
 * @param options - Optional filters.
 * @param options.parentBenefitCode - Only this benefit's sub-benefits, for example SHA-19.
 * @param options.visitType - Only sub-benefits billable on this visit (OP or IP).
 * @returns The sub-benefits.
 */
export async function getKenyaHieSubBenefits(
  credentials: KenyaAfyaLinkCredentials,
  patientId: string,
  options: { readonly parentBenefitCode?: string; readonly visitType?: KenyaShaVisitType } = {}
): Promise<KenyaHiePage<KenyaHieSubBenefit>> {
  const params: Record<string, string> = { patient_id: requirePatient(patientId) };
  if (options.parentBenefitCode?.trim()) {
    params.parent_benefit_code = options.parentBenefitCode.trim();
  }
  const result = await requestKenyaHie(credentials, 'GET', '/patients/sub-benefits', { params });
  if (!result.ok) {
    throw new KenyaHieRequestError('sub-benefits coverage', result);
  }
  const page = toPage(result.body, normalizeSubBenefit);
  if (!options.visitType) {
    return page;
  }
  const results = page.results.filter((s) => canBill(s.accessPoint, options.visitType));
  return { ...page, results };
}

function normalizeIntervention(i: Record<string, unknown>): KenyaHieIntervention {
  const special = (
    [
      ['requiresOncologyPreauth', 'oncology'],
      ['requiresOpticalPreauth', 'optical'],
      ['requiresRadiologyPreauth', 'radiology'],
      ['requiresRenalPreauth', 'renal'],
      ['requiresSurgicalPreauth', 'surgical'],
    ] as const
  )
    .filter(([field]) => i[field] === true)
    .map(([, kind]) => kind);
  return {
    code: str(i.code),
    name: str(i.name),
    subBenefitCode: str(i.benefitCode),
    subBenefitName: str(i.benefitName),
    parentBenefitCode: str(i.parentBenefitCode),
    accessPoint: str(i.accessPoint),
    fund: str(i.fund),
    supportedScheme: str(i.supportedScheme),
    paymentMechanism: str(i.paymentMechanism),
    needsPreauth: bool(i.needsPreauth),
    needsManualPreauthApproval: bool(i.needsManualPreauthApproval),
    needsDoctorAuthorization: bool(i.needsDoctorAuthorization),
    needsMemberAuthorization: bool(i.needsMemberAuthorization),
    needApprovalBeforeClaimSubmission: bool(i.needApprovalBeforeClaimSubmission),
    specialPreauth: special,
    requiredPreauthDocumentTypes: strings(i.requiredPreauthDocumentTypes),
    applicableDocumentTypes: strings(i.applicableDocumentTypes),
    tariff: num(i.kephLevelTarriff) ?? num(i.overallTariff),
    annualLimitValue: num(i.annualLimitValue),
    lowerAgeLimit: num(i.lowerAgeLimit),
    upperAgeLimit: num(i.upperAgeLimit),
    applicableGender: str(i.applicableGender),
    diagnosisList: strings(i.diagnosisList),
    active: bool(i.active),
  };
}

export interface KenyaHieInterventionQuery {
  /** The sub-benefit chosen from Sub-Benefits Coverage, for example SHA-19-SC-13. */
  readonly subBenefitCode?: string;
  /** Matches across interventions, for example "consultation". */
  readonly search?: string;
  /** One intervention code. */
  readonly code?: string;
  /** Only interventions billable on this visit (OP or IP). */
  readonly visitType?: KenyaShaVisitType;
  readonly page?: number;
  readonly pageSize?: number;
}

/**
 * Lists the interventions the patient is covered for at this facility
 * (GET /patients/benefits/interventions), each with DHA's flags and, when a visit type is given,
 * the integration scenario they select.
 * @param credentials - The HIE credentials (facility-scoped).
 * @param patientId - The patient's Client Registry ID.
 * @param query - Filters and paging.
 * @returns The interventions, each with its scenario (undefined when no visit type or no match).
 */
export async function getKenyaHieInterventions(
  credentials: KenyaAfyaLinkCredentials,
  patientId: string,
  query: KenyaHieInterventionQuery = {}
): Promise<KenyaHiePage<KenyaHieIntervention & { readonly scenario?: KenyaShaScenario }>> {
  const params: Record<string, string> = { patient_id: requirePatient(patientId) };
  if (query.subBenefitCode?.trim()) {
    params.sub_benefit_code = query.subBenefitCode.trim();
  }
  if (query.search?.trim()) {
    params.search = query.search.trim();
  }
  if (query.code?.trim()) {
    params.code = query.code.trim();
  }
  // The visit type is filtered here, not with DHA's access_point filter, so that "OP and IP"
  // interventions are kept on both visits.
  if (query.page !== undefined) {
    params.page = String(query.page);
  }
  if (query.pageSize !== undefined) {
    params.page_size = String(query.pageSize);
  }
  const result = await requestKenyaHie(credentials, 'GET', '/patients/benefits/interventions', { params });
  if (!result.ok) {
    throw new KenyaHieRequestError('intervention coverage', result);
  }
  const page = toPage(result.body, normalizeIntervention);
  const { visitType } = query;
  if (!visitType) {
    return page;
  }
  return {
    ...page,
    results: page.results
      .filter((i) => canBill(i.accessPoint, visitType))
      .map((i) => ({ ...i, scenario: selectKenyaShaScenario(i, visitType) })),
  };
}

/**
 * How much of an intervention's limit the patient (and household) has used and what remains
 * (GET /patients/benefits/utilization).
 * @param credentials - The HIE credentials.
 * @param patientId - The patient's Client Registry ID.
 * @param interventionCode - The intervention, for example SHA-18-005.
 * @returns The utilization records.
 */
export async function getKenyaHieUtilization(
  credentials: KenyaAfyaLinkCredentials,
  patientId: string,
  interventionCode: string
): Promise<KenyaHieUtilization[]> {
  const code = interventionCode?.trim();
  if (!code) {
    throw new Error('The intervention code is required');
  }
  const result = await requestKenyaHie(credentials, 'GET', '/patients/benefits/utilization', {
    params: { patient_id: requirePatient(patientId), intervention_code: code },
  });
  if (!result.ok) {
    throw new KenyaHieRequestError('utilization lookup', result);
  }
  const records = Array.isArray(result.body) ? result.body : [result.body];
  return records.filter(isRecord).map((u) => {
    const detail = isRecord(u.computationalDetail) ? u.computationalDetail : {};
    return {
      code: str(u.code),
      limitScope: str(u.limitScope),
      eligible: bool(detail.eligibility),
      individualMaxLimit: num(u.individualMaxLimit),
      individualUtilisedLimit: num(u.individualUtilisedLimit),
      householdMaxLimit: num(u.householdMaxLimit),
      householdUtilisedLimit: num(u.householdUtilisedLimit),
      limitAvailableAmount: num(detail.limitAvailableAmount),
      individualLimitAvailableCount: num(detail.individualLimitAvailableCount),
      householdLimitAvailableCount: num(detail.householdLimitAvailableCount),
      coverageStartDate: str(detail.coverageStartDate),
      coverageEndDate: str(detail.coverageEndDate),
      nextAvailableDate: str(detail.nextAvailableDate) ?? str(u.nextAvailability),
      utilizationDays: num(u.utilizationDays),
      funds: (Array.isArray(u.fundUtilizationLimit) ? u.fundUtilizationLimit : []).filter(isRecord).map((f) => ({
        fundType: str(f.fundType),
        maxAmount: num(f.maxAmount),
        utilisedAmount: num(f.utilisedAmount),
        availableAmount: num(f.availableAmount),
      })),
    };
  });
}
