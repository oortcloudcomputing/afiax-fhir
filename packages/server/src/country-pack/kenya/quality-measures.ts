// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Clinical quality measures for Kenya, DHA field test FUNC-QUAL-001 ("Verify quality measure
// capture, calculation, and reporting"). Pass criteria:
// - data can be captured;
// - calculations are accurate;
// - reports can be exported;
// - electronic submission is supported.
// DHA's sample measure is the vaccination coverage rate.
//
// Built to DHA's published definitions (fhir.dha.go.ke, checked 2026-11-10):
// - Kenya Core Measure and MeasureReport profiles
//   (https://fhir.dha.go.ke/core/StructureDefinition/kenya-core-measure and kenya-core-measurereport);
// - vaccines coded with the Kenya Patient Summary ATC vaccine code system
//   (https://fhir.dha.go.ke/terminology/CodeSystem/kps-vaccine-atc-cs). Measles-containing vaccines
//   are J07BD*, the measles-rubella vaccine is J07BD53.
//
// The engine counts clinical dates (birth date, vaccination date), never record update times, so
// a report can be recalculated for any past period with the same result.
import type { WithId } from '@medplum/core';
import { createReference, Operator } from '@medplum/core';
import type {
  DocumentReference,
  Immunization,
  Measure,
  MeasureReport,
  Organization,
  Patient,
  Reference,
} from '@medplum/fhirtypes';
import type { KenyaContext } from './job-context';

export const KenyaCoreMeasureProfile = 'https://fhir.dha.go.ke/core/StructureDefinition/kenya-core-measure';
export const KenyaCoreMeasureReportProfile = 'https://fhir.dha.go.ke/core/StructureDefinition/kenya-core-measurereport';
export const KenyaVaccineAtcSystem = 'https://fhir.dha.go.ke/terminology/CodeSystem/kps-vaccine-atc-cs';
export const KenyaMeasureIdentifierSystem = 'https://afiax.africa/kenya/identifier/quality-measure';
export const KenyaMeasureReportIdentifierSystem = 'https://afiax.africa/kenya/identifier/quality-measure-report';
const MeasurePopulationSystem = 'http://terminology.hl7.org/CodeSystem/measure-population';

export interface KenyaQualityMeasureDefinition {
  readonly id: string;
  readonly url: string;
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly rationale: string;
  readonly numerator: string;
  readonly denominator: string;
}

/**
 * MCV1 coverage, children 12 to 23 months: the share of children aged 12–23 months at the end of
 * the period, registered at the facility, who received a measles-containing vaccine (ATC J07BD*,
 * for example measles-rubella J07BD53) before their second birthday. This is the facility-level
 * form of the KEPI measles-rubella first dose (MR1) coverage indicator. It needs no census target
 * population.
 */
export const KenyaMcv1Coverage: KenyaQualityMeasureDefinition = {
  id: 'kenya-mcv1-coverage-12-23m',
  url: 'https://afiax.africa/fhir/Measure/kenya-mcv1-coverage-12-23m',
  name: 'KenyaMcv1Coverage12to23Months',
  title: 'Measles-containing vaccine first dose (MCV1/MR1) coverage, children 12–23 months',
  description:
    'Proportion of children aged 12–23 months at the end of the reporting period, registered at the facility, who received at least one measles-containing vaccine dose (ATC J07BD*, e.g. measles-rubella J07BD53) before their second birthday.',
  rationale:
    'Measles-rubella first dose coverage is a core Kenya Expanded Programme on Immunization (KEPI) indicator and the vaccination coverage measure in the DHA field test (FUNC-QUAL-001).',
  numerator:
    'Children in the denominator with a completed Immunization whose vaccine code is ATC J07BD* (measles-containing), given on or before the end of the period and before their second birthday.',
  denominator:
    'Children aged 12–23 months on the last day of the reporting period whose managing organization is the facility.',
};

export const KenyaQualityMeasures: readonly KenyaQualityMeasureDefinition[] = [KenyaMcv1Coverage];

export interface KenyaMeasurePeriod {
  readonly start: string;
  readonly end: string;
}

function parseDate(value: string, name: string): Date {
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(value.trim());
  const date = match ? new Date(`${value.trim()}T00:00:00Z`) : new Date(NaN);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must be a date (YYYY-MM-DD)`);
  }
  return date;
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * The Measure resource for a definition, to DHA's Kenya Core Measure profile.
 * @param definition - The measure definition.
 * @returns The Measure (without id).
 */
export function buildKenyaMeasure(definition: KenyaQualityMeasureDefinition): Measure {
  return {
    resourceType: 'Measure',
    meta: { profile: [KenyaCoreMeasureProfile] },
    url: definition.url,
    identifier: [
      {
        use: 'official',
        type: {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'RI', display: 'Resource identifier' },
          ],
        },
        system: KenyaMeasureIdentifierSystem,
        value: definition.id,
      },
    ],
    version: '1.0.0',
    name: definition.name,
    title: definition.title,
    status: 'active',
    experimental: false,
    publisher: 'Afiax Connected Healthcare',
    description: definition.description,
    rationale: definition.rationale,
    scoring: {
      coding: [
        { system: 'http://terminology.hl7.org/CodeSystem/measure-scoring', code: 'proportion', display: 'Proportion' },
      ],
      text: 'Proportion',
    },
    type: [
      {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/measure-type', code: 'process', display: 'Process' }],
        text: 'Process',
      },
    ],
    improvementNotation: {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/measure-improvement-notation',
          code: 'increase',
          display: 'Increased score indicates improvement',
        },
      ],
    },
    group: [
      {
        population: [
          {
            code: {
              coding: [{ system: MeasurePopulationSystem, code: 'initial-population', display: 'Initial Population' }],
            },
            description: definition.denominator,
            criteria: {
              language: 'application/x-fhir-query',
              expression:
                'Patient?organization={{facility}}&birthdate=gt{{periodEnd-24months}}&birthdate=le{{periodEnd-12months}}',
              description: definition.denominator,
            },
          },
          {
            code: { coding: [{ system: MeasurePopulationSystem, code: 'denominator', display: 'Denominator' }] },
            description: definition.denominator,
            criteria: {
              language: 'application/x-fhir-query',
              expression:
                'Patient?organization={{facility}}&birthdate=gt{{periodEnd-24months}}&birthdate=le{{periodEnd-12months}}',
              description: definition.denominator,
            },
          },
          {
            code: { coding: [{ system: MeasurePopulationSystem, code: 'numerator', display: 'Numerator' }] },
            description: definition.numerator,
            criteria: {
              language: 'application/x-fhir-query',
              expression:
                'Immunization?patient={{denominator}}&status=completed&vaccine-code=https://fhir.dha.go.ke/terminology/CodeSystem/kps-vaccine-atc-cs|J07BD01,https://fhir.dha.go.ke/terminology/CodeSystem/kps-vaccine-atc-cs|J07BD51,https://fhir.dha.go.ke/terminology/CodeSystem/kps-vaccine-atc-cs|J07BD52,https://fhir.dha.go.ke/terminology/CodeSystem/kps-vaccine-atc-cs|J07BD53,https://fhir.dha.go.ke/terminology/CodeSystem/kps-vaccine-atc-cs|J07BD54&date=le{{periodEnd}}',
              description: definition.numerator,
            },
          },
        ],
      },
    ],
  };
}

/**
 * Finds the project's Measure for a definition, creating it the first time.
 * @param ctx - The context.
 * @param definition - The measure definition.
 * @returns The Measure.
 */
export async function ensureKenyaMeasure(
  ctx: KenyaContext,
  definition: KenyaQualityMeasureDefinition
): Promise<WithId<Measure>> {
  const existing = await ctx.systemRepo.searchOne<Measure>({
    resourceType: 'Measure',
    filters: [
      { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
      { code: 'url', operator: Operator.EQUALS, value: definition.url },
    ],
  });
  if (existing) {
    return existing;
  }
  return ctx.systemRepo.createResource<Measure>({
    ...buildKenyaMeasure(definition),
    meta: { project: ctx.project.id, profile: [KenyaCoreMeasureProfile] },
  });
}

function isMeaslesContaining(immunization: Immunization): boolean {
  return (immunization.vaccineCode?.coding ?? []).some(
    (c) => c.system === KenyaVaccineAtcSystem && typeof c.code === 'string' && c.code.startsWith('J07BD')
  );
}

export interface KenyaMcv1Result {
  readonly denominator: WithId<Patient>[];
  readonly numerator: WithId<Patient>[];
  readonly qualifyingImmunizations: WithId<Immunization>[];
}

/**
 * Calculates MCV1 coverage for children registered at a facility.
 * @param ctx - The context.
 * @param facilityId - The facility Organization id.
 * @param period - The reporting period (YYYY-MM-DD dates, inclusive).
 * @returns The denominator and numerator patients and the qualifying immunizations.
 */
export async function calculateKenyaMcv1Coverage(
  ctx: KenyaContext,
  facilityId: string,
  period: KenyaMeasurePeriod
): Promise<KenyaMcv1Result> {
  const periodStart = parseDate(period.start, 'periodStart');
  const periodEnd = parseDate(period.end, 'periodEnd');
  if (periodEnd < periodStart) {
    throw new Error('periodEnd must not be before periodStart');
  }
  // Aged 12–23 months on the last day of the period: born after (end − 24 months) and on or
  // before (end − 12 months).
  const bornAfter = addMonths(periodEnd, -24);
  const bornOnOrBefore = addMonths(periodEnd, -12);

  const denominator = await ctx.systemRepo.searchResources<Patient>({
    resourceType: 'Patient',
    filters: [
      { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
      { code: 'organization', operator: Operator.EQUALS, value: `Organization/${facilityId}` },
      { code: 'birthdate', operator: Operator.GREATER_THAN, value: isoDate(bornAfter) },
      { code: 'birthdate', operator: Operator.LESS_THAN_OR_EQUALS, value: isoDate(bornOnOrBefore) },
    ],
    count: 5000,
  });
  const children = denominator.filter((p) => p.active !== false && !p.deceasedBoolean && !p.deceasedDateTime);

  const numerator: WithId<Patient>[] = [];
  const qualifyingImmunizations: WithId<Immunization>[] = [];
  const endOfPeriod = `${period.end.trim()}T23:59:59.999Z`;
  for (let i = 0; i < children.length; i += 50) {
    const chunk = children.slice(i, i + 50);
    const immunizations = await ctx.systemRepo.searchResources<Immunization>({
      resourceType: 'Immunization',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
        { code: 'patient', operator: Operator.EQUALS, value: chunk.map((p) => `Patient/${p.id}`).join(',') },
        { code: 'status', operator: Operator.EQUALS, value: 'completed' },
      ],
      count: 5000,
    });
    for (const child of chunk) {
      const secondBirthday = addMonths(new Date(`${child.birthDate}T00:00:00Z`), 24).toISOString();
      const dose = immunizations
        .filter((im) => im.patient?.reference === `Patient/${child.id}` && isMeaslesContaining(im))
        .filter((im) => {
          const given = im.occurrenceDateTime;
          return !!given && given <= endOfPeriod && given < secondBirthday;
        })
        .sort((a, b) => String(a.occurrenceDateTime).localeCompare(String(b.occurrenceDateTime)))[0];
      if (dose) {
        numerator.push(child);
        qualifyingImmunizations.push(dose);
      }
    }
  }
  return { denominator: children, numerator, qualifyingImmunizations };
}

/**
 * Evaluates a Kenya quality measure for a facility and period, and saves the MeasureReport
 * (Kenya Core MeasureReport profile, summary).
 * @param ctx - The context.
 * @param definition - The measure definition.
 * @param facility - The facility.
 * @param period - The reporting period.
 * @returns The saved MeasureReport and the calculation behind it.
 */
export async function evaluateKenyaQualityMeasure(
  ctx: KenyaContext,
  definition: KenyaQualityMeasureDefinition,
  facility: WithId<Organization>,
  period: KenyaMeasurePeriod
): Promise<{ readonly report: WithId<MeasureReport>; readonly result: KenyaMcv1Result }> {
  const measure = await ensureKenyaMeasure(ctx, definition);
  const result = await calculateKenyaMcv1Coverage(ctx, facility.id, period);
  const denominator = result.denominator.length;
  const numerator = result.numerator.length;
  const now = new Date().toISOString();
  const population = (
    code: string,
    display: string,
    count: number
  ): NonNullable<NonNullable<MeasureReport['group']>[number]['population']>[number] => ({
    code: { coding: [{ system: MeasurePopulationSystem, code, display }] },
    count,
  });

  const report = await ctx.systemRepo.createResource<MeasureReport>({
    resourceType: 'MeasureReport',
    meta: { project: ctx.project.id, profile: [KenyaCoreMeasureReportProfile] },
    identifier: [
      {
        use: 'official',
        type: {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/v2-0203', code: 'RI', display: 'Resource identifier' },
          ],
        },
        system: KenyaMeasureReportIdentifierSystem,
        value: `${definition.id}|${facility.id}|${period.start}|${period.end}|${now}`,
      },
    ],
    status: 'complete',
    type: 'summary',
    measure: definition.url,
    date: now,
    // The facility reports; R4 MeasureReport.subject cannot be an Organization
    reporter: createReference(facility),
    period: { start: period.start, end: period.end },
    improvementNotation: measure.improvementNotation,
    group: [
      {
        population: [
          population('initial-population', 'Initial Population', denominator),
          population('denominator', 'Denominator', denominator),
          population('numerator', 'Numerator', numerator),
        ],
        // Proportion as a decimal (0.8 = 80%); no score when the denominator is empty
        ...(denominator > 0 ? { measureScore: { value: Math.round((numerator / denominator) * 10000) / 10000 } } : {}),
      },
    ],
    evaluatedResource: result.qualifyingImmunizations.map((im) => createReference(im) as Reference),
  });
  return { report, result };
}

/**
 * The report as CSV (opens in Excel): one summary block and one line per child in the denominator,
 * de-identified (age in months, sex, vaccinated yes/no and date).
 * @param definition - The measure definition.
 * @param facility - The facility.
 * @param report - The MeasureReport.
 * @param result - The calculation behind it.
 * @returns The CSV text.
 */
export function buildKenyaMeasureCsv(
  definition: KenyaQualityMeasureDefinition,
  facility: Organization,
  report: MeasureReport,
  result: KenyaMcv1Result
): string {
  const esc = (v: string | number | undefined | null): string => {
    const s = v === undefined || v === null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const counts = Object.fromEntries(
    (report.group?.[0]?.population ?? []).map((p) => [p.code?.coding?.[0]?.code, p.count])
  );
  const score = report.group?.[0]?.measureScore?.value;
  const doseByPatient = new Map(result.qualifyingImmunizations.map((im) => [im.patient?.reference, im]));
  const end = new Date(`${report.period?.end}T00:00:00Z`);
  const lines = [
    ['Measure', definition.title],
    ['Facility', facility.name ?? facility.id],
    ['Period start', report.period?.start],
    ['Period end', report.period?.end],
    ['Denominator', counts.denominator],
    ['Numerator', counts.numerator],
    ['Coverage (%)', score === undefined ? '' : (score * 100).toFixed(1)],
    ['Generated', report.date],
    [],
    ['Child', 'Age at period end (months)', 'Sex', 'Measles-containing vaccine', 'Vaccine (ATC)', 'Date given'],
    ...result.denominator.map((p, i) => {
      const born = new Date(`${p.birthDate}T00:00:00Z`);
      const months =
        (end.getUTCFullYear() - born.getUTCFullYear()) * 12 +
        (end.getUTCMonth() - born.getUTCMonth()) -
        (end.getUTCDate() < born.getUTCDate() ? 1 : 0);
      const dose = doseByPatient.get(`Patient/${p.id}`);
      const coding = dose?.vaccineCode?.coding?.find((c) => c.system === KenyaVaccineAtcSystem);
      return [
        i + 1,
        months,
        p.gender ?? 'unknown',
        dose ? 'yes' : 'no',
        coding ? `${coding.code} ${coding.display ?? ''}`.trim() : '',
        dose?.occurrenceDateTime?.slice(0, 10) ?? '',
      ];
    }),
  ];
  return lines.map((row) => row.map(esc).join(',')).join('\n') + '\n';
}

/**
 * Keeps the CSV export as a DocumentReference linked to the MeasureReport.
 * @param ctx - The context.
 * @param facility - The facility.
 * @param report - The MeasureReport.
 * @param csv - The CSV text.
 * @param definition - The measure definition.
 * @returns The DocumentReference.
 */
export async function saveKenyaMeasureExport(
  ctx: KenyaContext,
  facility: WithId<Organization>,
  report: WithId<MeasureReport>,
  csv: string,
  definition: KenyaQualityMeasureDefinition
): Promise<WithId<DocumentReference>> {
  return ctx.systemRepo.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    meta: { project: ctx.project.id },
    status: 'current',
    docStatus: 'final',
    type: {
      coding: [
        {
          system: 'https://afiax.africa/CodeSystem/kenya-document-type',
          code: 'quality-measure-report',
          display: 'Quality measure report',
        },
      ],
      text: 'Quality measure report',
    },
    custodian: createReference(facility),
    date: report.date,
    description: `${definition.title}: ${facility.name ?? facility.id}, ${report.period?.start} to ${report.period?.end}`,
    content: [
      {
        attachment: {
          contentType: 'text/csv',
          title: `${definition.id}-${report.period?.start}-${report.period?.end}.csv`,
          data: Buffer.from(csv, 'utf8').toString('base64'),
          creation: report.date,
        },
      },
    ],
    context: {
      related: [createReference(report) as Reference],
      period: { start: report.period?.start, end: report.period?.end },
    },
  });
}
