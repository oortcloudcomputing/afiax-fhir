// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Public health event (outbreak) detection for Kenya, DHA field test REP-PHE-001:
// "Verify detection and reporting of public health events".
// - Pass criteria (DHA Field Test Preparation Guide, APP-2026-WFA4YC):
//   - the system detects events automatically;
//   - alerts are sent to appropriate authorities;
//   - detection thresholds are configurable;
//   - event reports contain the required information.
// - DHA's test scenario: a simulated outbreak of 5 measles cases in 3 days.
//
// Every saved Condition is checked against the project's outbreak rules (project setting
// kenyaOutbreakRules, a JSON array; built-in default: DHA's measles scenario). When the number of
// cases of a rule's ICD-11 code in the rule's window reaches its threshold, at the same facility or
// in the same county, the system records a public health event:
// - a Task (kenya-task-type public-health-event), urgent, referencing every case;
// - a DocumentReference event report (JSON) with the rule, the cases and the response actions;
// - an email alert to kenyaOutbreakAlertEmails (falling back to the IDSR notification emails);
// - an AuditEvent.
// One event is kept per rule and place while it is open. Later cases are added to it instead of
// raising a new event.
import type { WithId } from '@medplum/core';
import {
  createReference,
  getKenyaIdsrNotificationEmails,
  getProjectSettingString,
  KenyaIcd11System,
  normalizeErrorString,
  Operator,
} from '@medplum/core';
import type {
  AuditEvent,
  Condition,
  DocumentReference,
  Encounter,
  Organization,
  Patient,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { DatabaseMode, getDatabasePool } from '../../database';
import { sendEmail } from '../../email/email';
import { getLogger } from '../../logger';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';

export const KenyaTaskTypeSystem = 'https://afiax.africa/CodeSystem/kenya-task-type';
export const KenyaPublicHealthEventTaskCode = 'public-health-event';
export const KenyaDocumentTypeSystem = 'https://afiax.africa/CodeSystem/kenya-document-type';
export const KenyaPublicHealthEventReportCode = 'public-health-event-report';
export const KenyaOutbreakEventIdSystem = 'https://afiax.africa/identifier/kenya-public-health-event';

export const KenyaOutbreakSettingNames = {
  rules: 'kenyaOutbreakRules',
  alertEmails: 'kenyaOutbreakAlertEmails',
} as const;

export type KenyaOutbreakScope = 'facility' | 'county';

export interface KenyaOutbreakRule {
  /** Stable id, used in the event identifier. */
  readonly id: string;
  /** ICD-11 MMS code; the code and its subcategories (code.x) match. */
  readonly icd11: string;
  readonly display: string;
  /** Number of cases that raises an event. */
  readonly threshold: number;
  /** Rolling window, in days, the cases must fall within. */
  readonly windowDays: number;
  /** Count cases at the same facility, or in the same county. */
  readonly scope: KenyaOutbreakScope;
}

/**
 * Built-in rule: DHA's REP-PHE-001 scenario (5 measles cases in 3 days). Projects replace the
 * list with the kenyaOutbreakRules setting, for example with county thresholds from the IDSR
 * technical guidelines.
 */
export const KenyaOutbreakDefaultRules: readonly KenyaOutbreakRule[] = [
  { id: 'measles-cluster', icd11: '1F03', display: 'Measles', threshold: 5, windowDays: 3, scope: 'facility' },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_CASES_SCANNED = 5000;
const PAGE_SIZE = 500;

/**
 * Reads the outbreak rules of a project. Invalid entries are dropped; an invalid or empty setting
 * falls back to the built-in rules.
 * @param project - The project (or its settings source).
 * @returns The rules in force.
 */
export function getKenyaOutbreakRules(project: Parameters<typeof getProjectSettingString>[0]): KenyaOutbreakRule[] {
  const raw = getProjectSettingString(project, KenyaOutbreakSettingNames.rules);
  if (!raw?.trim()) {
    return [...KenyaOutbreakDefaultRules];
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [...KenyaOutbreakDefaultRules];
    }
    const rules = parsed.map(parseRule).filter((r): r is KenyaOutbreakRule => !!r);
    return rules.length > 0 ? rules : [...KenyaOutbreakDefaultRules];
  } catch {
    return [...KenyaOutbreakDefaultRules];
  }
}

function parseRule(value: unknown): KenyaOutbreakRule | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const v = value as Record<string, unknown>;
  const icd11 = typeof v.icd11 === 'string' ? v.icd11.trim() : '';
  const threshold = Number(v.threshold);
  const windowDays = Number(v.windowDays);
  if (!icd11 || !Number.isInteger(threshold) || threshold < 1 || !(windowDays > 0)) {
    return undefined;
  }
  return {
    id: typeof v.id === 'string' && v.id.trim() ? v.id.trim() : `${icd11}-${threshold}-in-${windowDays}d`,
    icd11,
    display: typeof v.display === 'string' && v.display.trim() ? v.display.trim() : icd11,
    threshold,
    windowDays,
    scope: v.scope === 'county' ? 'county' : 'facility',
  };
}

/**
 * The stem of an ICD-11 code: postcoordination (after & or /) is removed.
 * @param code - An ICD-11 code, possibly postcoordinated.
 * @returns The stem code.
 */
function icd11Stem(code: string): string {
  return code.split(/[&/]/)[0].trim();
}

/**
 * True when the ICD-11 code is the rule's code or one of its subcategories (1F03 matches 1F03.0).
 * @param code - The Condition's ICD-11 code.
 * @param ruleCode - The rule's ICD-11 code.
 * @returns Whether the code matches.
 */
export function matchesKenyaOutbreakCode(code: string, ruleCode: string): boolean {
  const stem = icd11Stem(code);
  return stem === ruleCode || stem.startsWith(`${ruleCode}.`);
}

function getIcd11Codes(condition: Condition): string[] {
  return (condition.code?.coding ?? [])
    .filter((c) => c.system === KenyaIcd11System && c.code)
    .map((c) => c.code as string);
}

function isCountableCase(condition: Condition): boolean {
  const verification = condition.verificationStatus?.coding?.[0]?.code;
  return verification !== 'refuted' && verification !== 'entered-in-error';
}

/**
 * When the case happened: onset, else recorded date, else when it was saved.
 * @param condition - The Condition.
 * @returns The case date.
 */
function caseDate(condition: Condition): Date | undefined {
  const value =
    condition.onsetDateTime ?? condition.onsetPeriod?.start ?? condition.recordedDate ?? condition.meta?.lastUpdated;
  const time = value ? Date.parse(value) : NaN;
  return Number.isNaN(time) ? undefined : new Date(time);
}

interface CaseRecord {
  readonly condition: WithId<Condition>;
  readonly date: Date;
  readonly facility?: WithId<Organization>;
  readonly county?: string;
  readonly patient?: WithId<Patient>;
}

type KenyaOutbreakContext = Pick<AuthenticatedRequestContext, 'project' | 'repo' | 'systemRepo' | 'profile'>;

class CaseResolver {
  private readonly encounters = new Map<string, Encounter | undefined>();
  private readonly organizations = new Map<string, WithId<Organization> | undefined>();
  private readonly patients = new Map<string, WithId<Patient> | undefined>();

  private readonly ctx: KenyaOutbreakContext;

  constructor(ctx: KenyaOutbreakContext) {
    this.ctx = ctx;
  }

  async resolve(condition: WithId<Condition>, date: Date): Promise<CaseRecord> {
    const patient = await this.read<Patient>(this.patients, condition.subject);
    let facility: WithId<Organization> | undefined;
    const encounter = await this.read<Encounter>(this.encounters, condition.encounter);
    if (encounter?.serviceProvider) {
      facility = await this.read<Organization>(this.organizations, encounter.serviceProvider);
    } else if (patient?.managingOrganization) {
      facility = await this.read<Organization>(this.organizations, patient.managingOrganization);
    }
    const county =
      patient?.address?.find((a) => a.state)?.state?.trim() || facility?.address?.find((a) => a.state)?.state?.trim();
    return { condition, date, facility, county, patient };
  }

  private async read<T extends Patient | Encounter | Organization>(
    cache: Map<string, unknown>,
    ref: Reference | undefined
  ): Promise<WithId<T> | undefined> {
    const key = ref?.reference;
    if (!key) {
      return undefined;
    }
    if (!cache.has(key)) {
      try {
        cache.set(key, await this.ctx.systemRepo.readReference<T>(ref as Reference<T>));
      } catch {
        cache.set(key, undefined);
      }
    }
    return cache.get(key) as WithId<T> | undefined;
  }
}

function placeOf(record: CaseRecord, scope: KenyaOutbreakScope): string | undefined {
  if (scope === 'county') {
    return record.county ? record.county.toLowerCase() : undefined;
  }
  return record.facility ? `Organization/${record.facility.id}` : undefined;
}

export interface KenyaOutbreakDetection {
  readonly rule: KenyaOutbreakRule;
  readonly place: string;
  readonly placeLabel: string;
  readonly cases: CaseRecord[];
  readonly windowStart: Date;
  readonly windowEnd: Date;
}

/**
 * Checks one Condition against the project's outbreak rules and returns the rules it breaches,
 * with the cases counted. Does not write anything.
 * @param ctx - The request context.
 * @param condition - The saved Condition.
 * @param now - The detection time (defaults to now).
 * @returns The breaches (empty when no rule's threshold is reached).
 */
export async function evaluateKenyaOutbreakRules(
  ctx: KenyaOutbreakContext,
  condition: WithId<Condition>,
  now = new Date()
): Promise<KenyaOutbreakDetection[]> {
  if (!isCountableCase(condition)) {
    return [];
  }
  const codes = getIcd11Codes(condition);
  const rules = getKenyaOutbreakRules(ctx.project).filter((rule) =>
    codes.some((code) => matchesKenyaOutbreakCode(code, rule.icd11))
  );
  if (rules.length === 0) {
    return [];
  }

  const resolver = new CaseResolver(ctx);
  const triggerDate = caseDate(condition) ?? now;
  const trigger = await resolver.resolve(condition, triggerDate);
  const detections: KenyaOutbreakDetection[] = [];

  for (const rule of rules) {
    const place = placeOf(trigger, rule.scope);
    if (!place) {
      continue;
    }
    const windowEnd = now;
    const windowStart = new Date(now.getTime() - rule.windowDays * DAY_MS);
    const cases: CaseRecord[] = [];

    for await (const candidate of searchRecentConditions(ctx, windowStart)) {
      if (
        !isCountableCase(candidate) ||
        !getIcd11Codes(candidate).some((c) => matchesKenyaOutbreakCode(c, rule.icd11))
      ) {
        continue;
      }
      const date = caseDate(candidate);
      if (!date || date < windowStart || date > windowEnd) {
        continue;
      }
      const record = candidate.id === condition.id ? trigger : await resolver.resolve(candidate, date);
      if (placeOf(record, rule.scope) === place) {
        cases.push(record);
      }
    }

    if (cases.length >= rule.threshold) {
      cases.sort((a, b) => a.date.getTime() - b.date.getTime());
      const placeLabel = rule.scope === 'county' ? `${trigger.county} County` : (trigger.facility?.name ?? place);
      detections.push({ rule, place, placeLabel, cases, windowStart, windowEnd });
    }
  }
  return detections;
}

/**
 * Conditions saved since the window start, in this project. Searching by last update finds cases
 * entered late for an earlier onset as well as new ones; the case date is checked afterwards.
 * @param ctx - The request context.
 * @param since - The window start.
 * @yields The Conditions.
 */
async function* searchRecentConditions(ctx: KenyaOutbreakContext, since: Date): AsyncGenerator<WithId<Condition>> {
  for (let offset = 0; offset < MAX_CASES_SCANNED; offset += PAGE_SIZE) {
    const page = await ctx.systemRepo.searchResources<Condition>({
      resourceType: 'Condition',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
        { code: '_lastUpdated', operator: Operator.GREATER_THAN_OR_EQUALS, value: since.toISOString() },
      ],
      sortRules: [{ code: '_id' }],
      count: PAGE_SIZE,
      offset,
    });
    yield* page;
    if (page.length < PAGE_SIZE) {
      return;
    }
  }
}

// Cases saved at the same moment are detected in parallel, possibly on different server replicas.
// Recording takes a Postgres advisory lock per project, rule and place, so the second detection
// finds the first one's open event instead of raising a duplicate.
async function withEventLock<T>(key: string, action: () => Promise<T>): Promise<T> {
  const client = await getDatabasePool(DatabaseMode.WRITER).connect();
  const lockKey = `kenya-outbreak|${key}`;
  try {
    await client.query('SELECT pg_advisory_lock(hashtext($1))', [lockKey]);
    try {
      return await action();
    } finally {
      await client.query('SELECT pg_advisory_unlock(hashtext($1))', [lockKey]);
    }
  } finally {
    client.release();
  }
}

function eventIdentifier(detection: KenyaOutbreakDetection): string {
  return `${detection.rule.id}|${detection.place}`;
}

async function findOpenEvent(
  ctx: KenyaOutbreakContext,
  detection: KenyaOutbreakDetection
): Promise<WithId<Task> | undefined> {
  const tasks = await ctx.systemRepo.searchResources<Task>({
    resourceType: 'Task',
    filters: [
      { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
      { code: 'code', operator: Operator.EQUALS, value: `${KenyaTaskTypeSystem}|${KenyaPublicHealthEventTaskCode}` },
      {
        code: 'identifier',
        operator: Operator.EQUALS,
        value: `${KenyaOutbreakEventIdSystem}|${eventIdentifier(detection)}`,
      },
    ],
    count: 20,
  });
  return tasks.find((t) => !['completed', 'cancelled', 'rejected', 'entered-in-error'].includes(t.status));
}

function ageInYears(birthDate: string | undefined, at: Date): number | undefined {
  if (!birthDate) {
    return undefined;
  }
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) {
    return undefined;
  }
  let age = at.getFullYear() - born.getFullYear();
  const m = at.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < born.getDate())) {
    age--;
  }
  return age;
}

/**
 * The event report. Case lines are de-identified (no names or identifiers): the report goes to
 * public health authorities by email and is kept as a document.
 * @param detection - The breach.
 * @param eventId - The event identifier.
 * @param now - The report time.
 * @returns The report content.
 */
export function buildKenyaOutbreakReport(
  detection: KenyaOutbreakDetection,
  eventId: string,
  now: Date
): Record<string, unknown> {
  const { rule, cases } = detection;
  return {
    reportType: 'Public health event: outbreak threshold reached',
    eventId,
    generatedAt: now.toISOString(),
    disease: rule.display,
    icd11Code: rule.icd11,
    rule: {
      id: rule.id,
      threshold: rule.threshold,
      windowDays: rule.windowDays,
      scope: rule.scope,
      description: `${rule.threshold} or more ${rule.display} cases within ${rule.windowDays} day(s) at the same ${rule.scope}`,
    },
    place: detection.placeLabel,
    window: { start: detection.windowStart.toISOString(), end: detection.windowEnd.toISOString() },
    caseCount: cases.length,
    confirmedCount: cases.filter((c) => c.condition.verificationStatus?.coding?.[0]?.code === 'confirmed').length,
    firstCaseDate: cases[0]?.date.toISOString(),
    lastCaseDate: cases[cases.length - 1]?.date.toISOString(),
    cases: cases.map((c, i) => ({
      caseNumber: i + 1,
      condition: `Condition/${c.condition.id}`,
      date: c.date.toISOString(),
      verificationStatus: c.condition.verificationStatus?.coding?.[0]?.code ?? 'unconfirmed',
      sex: c.patient?.gender ?? 'unknown',
      ageYears: ageInYears(c.patient?.birthDate, c.date),
      facility: c.facility?.name,
      county: c.county,
      subCounty: c.patient?.address?.find((a) => a.district)?.district,
      ward: c.patient?.address?.find((a) => a.city)?.city,
    })),
    recommendedActions: [
      'Notify the Sub-County and County Disease Surveillance Coordinators immediately',
      'Verify the cases and collect specimens for laboratory confirmation',
      'Conduct active case search and line-list all cases',
      'Institute control measures appropriate to the disease',
    ],
  };
}

export interface KenyaOutbreakEventResult {
  readonly task: WithId<Task>;
  readonly report?: WithId<DocumentReference>;
  readonly created: boolean;
  readonly alertSent: boolean;
  readonly alertRecipients: string[];
}

/**
 * Records a detected outbreak: creates the event Task, report and alert, or adds new cases to an
 * open event for the same rule and place.
 * @param ctx - The request context.
 * @param detection - The breach.
 * @param now - The detection time.
 * @returns The event Task and what was done.
 */
export async function recordKenyaOutbreakEvent(
  ctx: KenyaOutbreakContext,
  detection: KenyaOutbreakDetection,
  now = new Date()
): Promise<KenyaOutbreakEventResult> {
  const caseRefs = detection.cases.map((c) => createReference(c.condition));
  const existing = await findOpenEvent(ctx, detection);
  if (existing) {
    const known = new Set((existing.input ?? []).map((i) => i.valueReference?.reference));
    const added = caseRefs.filter((r) => !known.has(r.reference));
    if (added.length === 0) {
      return { task: existing, created: false, alertSent: false, alertRecipients: [] };
    }
    const task = await ctx.systemRepo.updateResource<Task>({
      ...existing,
      input: [
        ...(existing.input ?? []),
        ...added.map((valueReference) => ({ type: { text: 'case' }, valueReference })),
      ],
      description: describeEvent(detection),
      lastModified: now.toISOString(),
    });
    return { task, created: false, alertSent: false, alertRecipients: [] };
  }

  const eventId = `PHE-${now.toISOString().slice(0, 10).replace(/-/g, '')}-${detection.rule.id}-${detection.cases[detection.cases.length - 1].condition.id.slice(0, 8)}`;
  const content = buildKenyaOutbreakReport(detection, eventId, now);
  const reportJson = JSON.stringify(content, null, 2);

  const report = await ctx.systemRepo.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    meta: { project: ctx.project.id },
    status: 'current',
    docStatus: 'final',
    identifier: [{ system: KenyaOutbreakEventIdSystem, value: eventId }],
    type: {
      coding: [
        {
          system: KenyaDocumentTypeSystem,
          code: KenyaPublicHealthEventReportCode,
          display: 'Public health event report',
        },
      ],
      text: 'Public health event report',
    },
    date: now.toISOString(),
    description: describeEvent(detection),
    content: [
      {
        attachment: {
          contentType: 'application/json',
          title: `public-health-event-${eventId}.json`,
          data: Buffer.from(reportJson, 'utf8').toString('base64'),
          creation: now.toISOString(),
        },
      },
    ],
    context: { related: caseRefs },
  });

  const recipients = getAlertRecipients(ctx);
  let alertSent = false;
  let alertError: string | undefined;
  if (recipients.length > 0) {
    try {
      await sendEmail(ctx.systemRepo as Parameters<typeof sendEmail>[0], {
        to: recipients,
        subject: `[PUBLIC HEALTH ALERT] ${detection.rule.display}: ${detection.cases.length} cases in ${detection.rule.windowDays} day(s), ${detection.placeLabel}`,
        text: formatAlertEmail(content),
      });
      alertSent = true;
    } catch (err) {
      alertError = normalizeErrorString(err);
      getLogger().warn('Public health event alert email failed', { eventId, error: alertError });
    }
  } else {
    alertError = `No alert recipients configured (${KenyaOutbreakSettingNames.alertEmails} or kenyaIdsrNotificationEmail)`;
  }

  let businessStatus = 'alert-failed';
  if (alertSent) {
    businessStatus = 'alert-sent';
  } else if (recipients.length === 0) {
    businessStatus = 'no-recipients';
  }

  const task = await ctx.systemRepo.createResource<Task>({
    resourceType: 'Task',
    meta: { project: ctx.project.id },
    identifier: [
      { system: KenyaOutbreakEventIdSystem, value: eventIdentifier(detection) },
      { system: `${KenyaOutbreakEventIdSystem}/event-id`, value: eventId },
    ],
    status: 'requested',
    intent: 'order',
    priority: 'urgent',
    code: {
      coding: [{ system: KenyaTaskTypeSystem, code: KenyaPublicHealthEventTaskCode, display: 'Public health event' }],
      text: KenyaPublicHealthEventTaskCode,
    },
    businessStatus: { text: businessStatus },
    description: describeEvent(detection),
    authoredOn: now.toISOString(),
    lastModified: now.toISOString(),
    focus: caseRefs[caseRefs.length - 1],
    input: caseRefs.map((valueReference) => ({ type: { text: 'case' }, valueReference })),
    output: [{ type: { text: 'Public health event report' }, valueReference: createReference(report) }],
    note: [
      {
        time: now.toISOString(),
        text: alertSent ? `Alert emailed to ${recipients.join(', ')}` : `Alert not sent: ${alertError}`,
      },
    ],
  });

  await writeAuditEvent(ctx, `Public health event detected: ${describeEvent(detection)}`, [task, report]);
  return { task, report, created: true, alertSent, alertRecipients: alertSent ? recipients : [] };
}

function describeEvent(detection: KenyaOutbreakDetection): string {
  const { rule, cases } = detection;
  return `${rule.display} (ICD-11 ${rule.icd11}): ${cases.length} cases in ${rule.windowDays} day(s) at ${detection.placeLabel} (threshold ${rule.threshold})`;
}

function getAlertRecipients(ctx: KenyaOutbreakContext): string[] {
  const configured = (getProjectSettingString(ctx.project, KenyaOutbreakSettingNames.alertEmails) ?? '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  return configured.length > 0 ? configured : getKenyaIdsrNotificationEmails(ctx.project);
}

function formatAlertEmail(content: Record<string, unknown>): string {
  const cases = content.cases as {
    caseNumber: number;
    date: string;
    verificationStatus: string;
    sex: string;
    ageYears?: number;
    county?: string;
    subCounty?: string;
  }[];
  return [
    'PUBLIC HEALTH EVENT: OUTBREAK THRESHOLD REACHED',
    '===============================================',
    '',
    `Event:      ${String(content.eventId)}`,
    `Disease:    ${String(content.disease)} (ICD-11 ${String(content.icd11Code)})`,
    `Place:      ${String(content.place)}`,
    `Cases:      ${String(content.caseCount)} (${String(content.confirmedCount)} confirmed)`,
    `Rule:       ${(content.rule as { description: string }).description}`,
    `Detected:   ${String(content.generatedAt)}`,
    '',
    'Cases (de-identified):',
    ...cases.map(
      (c) =>
        `  ${c.caseNumber}. ${c.date.slice(0, 10)}  ${c.verificationStatus}  ${c.sex}${c.ageYears === undefined ? '' : `, ${c.ageYears}y`}  ${[c.subCounty, c.county].filter(Boolean).join(', ')}`
    ),
    '',
    'Recommended actions:',
    ...(content.recommendedActions as string[]).map((a) => `  - ${a}`),
    '',
    'Afiax Connected Healthcare: automated disease surveillance alert.',
  ].join('\n');
}

async function writeAuditEvent(
  ctx: KenyaOutbreakContext,
  description: string,
  entities: WithId<Task | DocumentReference>[]
): Promise<void> {
  const auditEvent = createAuditEvent(
    RestfulOperationType,
    OperationInteraction,
    ctx.project.id,
    ctx.profile,
    undefined,
    AuditEventOutcome.Success,
    { description }
  );
  auditEvent.entity = [...(auditEvent.entity ?? []), ...entities.map((e) => ({ what: createReference(e) }))];
  const saved = await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
  logAuditEvent(saved);
}

/**
 * Called in the FHIR write path after a Condition is created or updated (Kenya projects only).
 * Detection runs in the background: it never delays or fails the clinical write.
 * @param ctx - The request context of the write.
 * @param condition - The saved Condition.
 */
export function maybeDetectKenyaOutbreak(ctx: AuthenticatedRequestContext, condition: WithId<Condition>): void {
  evaluateKenyaOutbreakRules(ctx, condition)
    .then(async (detections) => {
      for (const detection of detections) {
        await withEventLock(`${ctx.project.id}|${eventIdentifier(detection)}`, () =>
          recordKenyaOutbreakEvent(ctx, detection)
        );
      }
    })
    .catch((err) => {
      getLogger().error('Outbreak detection failed', { condition: condition.id, error: normalizeErrorString(err) });
    });
}
