// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// IHR (2005) notification of events of potential international concern (DHA REP-IHR-001).
// See packages/core/src/kenya-ihr.ts for the Annex 2 table and decision instrument.
//
// Flow:
//   1. A Condition with an Annex 2 disease is saved -> flagKenyaIhrCondition() runs automatically.
//      Always-notifiable diseases get a WHO report and escalation Task straight away; others get an
//      "IHR assessment required" Task (assess within 48 hours, IHR Annex 1).
//   2. A surveillance officer runs Condition/$ihr-assessment with the four Annex 2 answers. Any
//      Condition can be assessed this way, so unlisted unusual events can still be escalated.
//   3. If notifiable, a de-identified IHR report (DocumentReference) and an escalation Task are created.
//   4. Task/$ihr-escalate records each step: County Director of Health -> National IHR Focal Point -> WHO.

import type { KenyaIhrAssessmentAnswers, KenyaIhrCategory, KenyaIhrDecision, WithId } from '@medplum/core';
import {
  assessKenyaIhrEvent,
  calculateAge,
  createReference,
  findKenyaIhrCondition,
  getNextKenyaIhrEscalationStage,
  getProjectSettingString,
  KenyaIcd11System,
  KenyaIhrAssessmentTaskCode,
  KenyaIhrEscalationStages,
  KenyaIhrNotificationTaskCode,
  KenyaIhrQuestions,
  KenyaIhrReportTypeCode,
  KenyaIhrReportTypeSystem,
  KenyaIhrTaskTypeSystem,
  Operator,
} from '@medplum/core';
import type { AuditEvent, Condition, DocumentReference, Patient, Reference, Resource, Task } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';

const HOUR_MS = 60 * 60 * 1000;

/** Default name of Kenya's National IHR Focal Point; overridable with the `ihrNationalFocalPoint` project setting. */
export const DefaultKenyaIhrNationalFocalPoint =
  'Kenya National IHR Focal Point, Ministry of Health, Disease Surveillance and Response Unit';

/** Additional event details supplied with an assessment. */
export interface KenyaIhrEventDetails {
  readonly travelHistory?: string;
  readonly controlMeasures?: string;
  readonly caseCount?: number;
  readonly deathCount?: number;
}

export interface KenyaIhrAssessmentResult {
  readonly decision: KenyaIhrDecision;
  readonly diseaseDisplay: string;
  readonly report?: WithId<DocumentReference>;
  readonly reportJson?: string;
  readonly notificationTask?: WithId<Task>;
}

/** The WHO IHR notification report, de-identified: no name, ID number or contact details. */
export interface KenyaIhrReport {
  readonly reportType: string;
  readonly reportId: string;
  readonly generatedAt: string;
  readonly reportingState: string;
  readonly nationalFocalPoint: string;
  readonly reportingFacility: string;
  readonly reportedBy: string;
  readonly event: {
    readonly disease: string;
    readonly icd11Code?: string;
    readonly ihrCategory: KenyaIhrCategory;
    readonly verificationStatus?: string;
    readonly clinicalStatus?: string;
    readonly onsetDate?: string;
    readonly recordedDate?: string;
    readonly county?: string;
    readonly caseCount: number;
    readonly deathCount: number;
  };
  readonly caseDemographics: {
    readonly sex?: string;
    readonly ageYears?: number;
    readonly deceased: boolean;
  };
  readonly exposureAndTravelHistory?: string;
  readonly controlMeasures?: string;
  readonly riskAssessment: {
    readonly questions: { readonly question: string; readonly answer: 'yes' | 'no' | 'not answered' }[];
    readonly notifiable: boolean;
    readonly rationale: string;
  };
  readonly escalationPathway: { readonly stage: string; readonly description: string }[];
  readonly deadline: string;
}

function ihrTaskCode(code: string, display: string): Task['code'] {
  return { coding: [{ system: KenyaIhrTaskTypeSystem, code, display }], text: code };
}

/**
 * Returns the IHR category of a Condition: its Annex 2 group, or "other-event" for anything else.
 * @param condition - The Condition.
 * @returns The category and the disease display.
 */
export function getKenyaIhrCategory(condition: Condition): { category: KenyaIhrCategory; display: string } {
  const match = findKenyaIhrCondition(condition.code);
  if (match) {
    return { category: match.category, display: match.display };
  }
  return {
    category: 'other-event',
    display: condition.code?.text ?? condition.code?.coding?.[0]?.display ?? 'Unlisted event',
  };
}

/**
 * Finds the IHR Tasks already created for a Condition.
 * @param ctx - The request context.
 * @param condition - The Condition.
 * @param code - The Task type code.
 * @returns The Tasks, newest first.
 */
export async function findKenyaIhrTasks(
  ctx: AuthenticatedRequestContext,
  condition: WithId<Condition>,
  code: string
): Promise<WithId<Task>[]> {
  return ctx.systemRepo.searchResources<Task>({
    resourceType: 'Task',
    filters: [
      { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
      { code: 'focus', operator: Operator.EQUALS, value: `Condition/${condition.id}` },
      { code: 'code', operator: Operator.EQUALS, value: `${KenyaIhrTaskTypeSystem}|${code}` },
    ],
    sortRules: [{ code: '_lastUpdated', descending: true }],
  });
}

/**
 * Flags a newly saved Annex 2 Condition. Called automatically on Condition writes in Kenya projects.
 * Always-notifiable diseases are reported immediately; others get an assessment Task.
 * Does nothing if the Condition is not an Annex 2 disease or has already been flagged.
 * @param ctx - The request context of the write.
 * @param condition - The saved Condition.
 */
export async function flagKenyaIhrCondition(
  ctx: AuthenticatedRequestContext,
  condition: WithId<Condition>
): Promise<void> {
  const match = findKenyaIhrCondition(condition.code);
  if (!match) {
    return;
  }
  const existing = [
    ...(await findKenyaIhrTasks(ctx, condition, KenyaIhrAssessmentTaskCode)),
    ...(await findKenyaIhrTasks(ctx, condition, KenyaIhrNotificationTaskCode)),
  ];
  if (existing.length > 0) {
    return;
  }

  if (match.category === 'always-notifiable') {
    await runKenyaIhrAssessment(ctx, condition, {}, {});
    return;
  }

  const now = new Date();
  const task = await ctx.systemRepo.createResource<Task>({
    resourceType: 'Task',
    meta: { project: ctx.project.id },
    status: 'requested',
    intent: 'order',
    priority: 'urgent',
    authoredOn: now.toISOString(),
    requester: ctx.profile as Task['requester'],
    focus: createReference(condition),
    for: condition.subject,
    code: ihrTaskCode(KenyaIhrAssessmentTaskCode, 'IHR assessment required'),
    description:
      `IHR (2005) Annex 2: ${match.display} must be assessed with the IHR decision instrument ` +
      'to decide whether WHO must be notified. Assess within 48 hours (IHR Annex 1).',
    businessStatus: { text: 'assessment-required' },
    restriction: {
      repetitions: 1,
      period: { start: now.toISOString(), end: new Date(now.getTime() + 48 * HOUR_MS).toISOString() },
    },
  });
  await createIhrAuditEvent(ctx, `IHR flag: ${match.display} requires IHR assessment`, [condition, task]);
}

/**
 * Runs the IHR Annex 2 decision instrument on a Condition and, when notifiable, creates the WHO
 * report and the escalation Task. Closes any open assessment Task.
 * @param ctx - The request context.
 * @param condition - The Condition being assessed.
 * @param answers - Answers to the four Annex 2 questions.
 * @param details - Additional event details for the report.
 * @returns The decision and any report and notification Task created.
 */
export async function runKenyaIhrAssessment(
  ctx: AuthenticatedRequestContext,
  condition: WithId<Condition>,
  answers: KenyaIhrAssessmentAnswers,
  details: KenyaIhrEventDetails
): Promise<KenyaIhrAssessmentResult> {
  const { category, display } = getKenyaIhrCategory(condition);
  const decision = assessKenyaIhrEvent(category, answers);
  const now = new Date();

  let report: WithId<DocumentReference> | undefined;
  let reportJson: string | undefined;
  let notificationTask: WithId<Task> | undefined;

  if (decision.notifiable) {
    const existing = await findKenyaIhrTasks(ctx, condition, KenyaIhrNotificationTaskCode);
    if (existing.length > 0) {
      throw new Error(`An IHR notification already exists for this Condition (Task/${existing[0].id}).`);
    }

    const content = await buildKenyaIhrReport(ctx, condition, display, decision, answers, details, now);
    reportJson = JSON.stringify(content, null, 2);
    report = await ctx.systemRepo.createResource<DocumentReference>({
      resourceType: 'DocumentReference',
      meta: { project: ctx.project.id },
      status: 'current',
      docStatus: 'final',
      type: {
        coding: [
          { system: KenyaIhrReportTypeSystem, code: KenyaIhrReportTypeCode, display: 'IHR notification report' },
        ],
        text: 'IHR notification report',
      },
      subject: condition.subject,
      date: now.toISOString(),
      author: ctx.profile ? [ctx.profile as Reference<never>] : undefined,
      description: `IHR (2005) notification: ${display}`,
      content: [
        {
          attachment: {
            contentType: 'application/json',
            title: `ihr-notification-${content.reportId}.json`,
            data: Buffer.from(reportJson, 'utf8').toString('base64'),
            creation: now.toISOString(),
          },
        },
      ],
      context: { related: [createReference(condition)] },
    });

    notificationTask = await ctx.systemRepo.createResource<Task>({
      resourceType: 'Task',
      meta: { project: ctx.project.id },
      status: 'requested',
      intent: 'order',
      priority: 'stat',
      authoredOn: now.toISOString(),
      requester: ctx.profile as Task['requester'],
      focus: createReference(condition),
      for: condition.subject,
      code: ihrTaskCode(KenyaIhrNotificationTaskCode, 'IHR notification to WHO'),
      description:
        `IHR (2005) notification: ${display}. Escalate County Director of Health -> National IHR Focal Point -> WHO. ` +
        'WHO must be notified within 24 hours of assessment (IHR Article 6).',
      businessStatus: { text: KenyaIhrEscalationStages[0].code },
      restriction: {
        repetitions: 1,
        period: { start: now.toISOString(), end: new Date(now.getTime() + 24 * HOUR_MS).toISOString() },
      },
      output: [{ type: { text: 'IHR notification report' }, valueReference: createReference(report) }],
    });
  }

  // Close any open assessment Task with the outcome
  for (const task of await findKenyaIhrTasks(ctx, condition, KenyaIhrAssessmentTaskCode)) {
    if (task.status === 'completed') {
      continue;
    }
    await ctx.systemRepo.updateResource<Task>({
      ...task,
      status: 'completed',
      businessStatus: { text: decision.notifiable ? 'notifiable' : 'not-notifiable' },
      note: [...(task.note ?? []), { time: now.toISOString(), text: decision.rationale }],
      ...(notificationTask
        ? { output: [{ type: { text: 'IHR notification' }, valueReference: createReference(notificationTask) }] }
        : {}),
    });
  }

  await createIhrAuditEvent(
    ctx,
    `IHR assessment: ${display}: ${decision.notifiable ? 'notifiable to WHO' : 'not notifiable'}`,
    [condition, report, notificationTask].filter(Boolean) as WithId<Resource>[]
  );

  return { decision, diseaseDisplay: display, report, reportJson, notificationTask };
}

/**
 * Advances an IHR notification Task to its next escalation stage.
 * @param ctx - The request context.
 * @param task - The IHR notification Task.
 * @param note - Optional note, e.g. who was contacted and how.
 * @returns The updated Task.
 */
export async function escalateKenyaIhrNotification(
  ctx: AuthenticatedRequestContext,
  task: WithId<Task>,
  note?: string
): Promise<WithId<Task>> {
  if (!task.code?.coding?.some((c) => c.system === KenyaIhrTaskTypeSystem && c.code === KenyaIhrNotificationTaskCode)) {
    throw new Error('This Task is not an IHR notification.');
  }
  const current = task.businessStatus?.text;
  const next = getNextKenyaIhrEscalationStage(current);
  if (!next) {
    throw new Error('WHO has already been notified; there is no further escalation step.');
  }
  const stage = KenyaIhrEscalationStages.find((s) => s.code === next);
  const now = new Date().toISOString();
  const by = ctx.profile.display ?? ctx.profile.reference;
  const updated = await ctx.systemRepo.updateResource<Task>({
    ...task,
    status: next === 'who-notified' ? 'completed' : 'in-progress',
    businessStatus: { text: next },
    lastModified: now,
    note: [
      ...(task.note ?? []),
      {
        authorReference: ctx.profile as Reference<never>,
        time: now,
        text: `${stage?.display}${by ? ` (recorded by ${by})` : ''}${note ? `: ${note}` : ''}`,
      },
    ],
  });
  await createIhrAuditEvent(ctx, `IHR escalation: ${stage?.display}`, [updated]);
  return updated;
}

async function buildKenyaIhrReport(
  ctx: AuthenticatedRequestContext,
  condition: WithId<Condition>,
  display: string,
  decision: KenyaIhrDecision,
  answers: KenyaIhrAssessmentAnswers,
  details: KenyaIhrEventDetails,
  now: Date
): Promise<KenyaIhrReport> {
  let patient: Patient | undefined;
  if (condition.subject?.reference?.startsWith('Patient/')) {
    try {
      patient = await ctx.systemRepo.readReference<Patient>(condition.subject as Reference<Patient>);
    } catch {
      patient = undefined;
    }
  }
  const deceased = !!(patient?.deceasedBoolean || patient?.deceasedDateTime);
  const icd11Code = condition.code?.coding?.find((c) => c.system === KenyaIcd11System)?.code;
  const reportId = `IHR-KE-${now.toISOString().slice(0, 10).replaceAll('-', '')}-${condition.id.slice(0, 8)}`;

  return {
    reportType: 'IHR (2005) Article 6 notification of an event that may constitute a PHEIC',
    reportId,
    generatedAt: now.toISOString(),
    reportingState: 'Kenya',
    nationalFocalPoint:
      getProjectSettingString(ctx.project, 'ihrNationalFocalPoint') ?? DefaultKenyaIhrNationalFocalPoint,
    reportingFacility: ctx.project.name ?? ctx.project.id,
    reportedBy: ctx.profile.display ?? ctx.profile.reference ?? '',
    event: {
      disease: display,
      icd11Code,
      ihrCategory: decision.category,
      verificationStatus: condition.verificationStatus?.coding?.[0]?.code,
      clinicalStatus: condition.clinicalStatus?.coding?.[0]?.code,
      onsetDate: condition.onsetDateTime ?? condition.onsetPeriod?.start,
      recordedDate: condition.recordedDate ?? condition.meta?.lastUpdated,
      county: patient?.address?.find((a) => a.use === 'home')?.state ?? patient?.address?.[0]?.state,
      caseCount: details.caseCount ?? 1,
      deathCount: details.deathCount ?? (deceased ? 1 : 0),
    },
    caseDemographics: {
      sex: patient?.gender,
      ageYears: patient?.birthDate ? calculateAge(patient.birthDate, now.toISOString().slice(0, 10)).years : undefined,
      deceased,
    },
    exposureAndTravelHistory: details.travelHistory?.trim() || undefined,
    controlMeasures: details.controlMeasures?.trim() || undefined,
    riskAssessment: {
      questions: KenyaIhrQuestions.map((q) => ({
        question: q.text,
        answer: formatIhrAnswer(answers[q.key]),
      })),
      notifiable: decision.notifiable,
      rationale: decision.rationale,
    },
    escalationPathway: KenyaIhrEscalationStages.map((s) => ({ stage: s.code, description: s.display })),
    deadline: new Date(now.getTime() + 24 * HOUR_MS).toISOString(),
  };
}

function formatIhrAnswer(answer: boolean | undefined): 'yes' | 'no' | 'not answered' {
  if (answer === undefined) {
    return 'not answered';
  }
  return answer ? 'yes' : 'no';
}

async function createIhrAuditEvent(
  ctx: AuthenticatedRequestContext,
  description: string,
  entities: WithId<Resource>[]
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
