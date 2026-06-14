// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  buildKenyaKhisWeeklyExportExtension,
  createReference,
  isKenyaKhisWeeklyNotificationCode,
  KenyaKhisCorrelationIdSystem,
  khisWeekPeriodToDateRange,
  KhisWeeklyExportStatus,
  normalizeErrorString,
} from '@medplum/core';
import type { AuditEvent, Condition, DocumentReference, Organization, Project, Task } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import {
  AuditEventOutcome,
  createAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import type { KhisConditionAggregate } from './khis';
import { buildKhisDataValueSet, getKhisCredentials, pushKhisDataValueSet } from './khis';

export interface KhisWeeklyExportInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly period: string;
  readonly facilityId: string;
  readonly correlationId: string;
  readonly dryRun?: boolean;
}

export interface KhisWeeklyExportResult {
  readonly status: KhisWeeklyExportStatus;
  readonly correlationId: string;
  readonly period: string;
  readonly facilityId: string;
  readonly facilityOrgUnit?: string;
  readonly conditionCount: number;
  readonly dataValueCount: number;
  readonly dhis2ImportStatus?: string;
  readonly dhis2ImportCount?: number;
  readonly message: string;
  readonly exportedAt: string;
  readonly task?: import('@medplum/fhirtypes').Reference<Task>;
  readonly documentReference?: import('@medplum/fhirtypes').Reference<DocumentReference>;
}

export async function handleKhisWeeklyExport(input: KhisWeeklyExportInput): Promise<KhisWeeklyExportResult> {
  const { ctx, period, facilityId, correlationId, dryRun = false } = input;
  const exportedAt = new Date().toISOString();

  // 1. Resolve facility and its DHIS2 org unit code
  let facility: Organization & { id: string };
  let facilityOrgUnit: string | undefined;
  try {
    facility = await ctx.repo.readResource<Organization>('Organization', facilityId);
    facilityOrgUnit =
      facility.identifier?.find((id) => id.system === 'https://afiax.africa/kenya/identifier/mfl-code')?.value ??
      facilityId;
  } catch (err) {
    return makeErrorResult(correlationId, period, facilityId, exportedAt, `Cannot read facility Organization/${facilityId}: ${normalizeErrorString(err)}`);
  }

  // 2. Resolve date range for the period
  let weekStart: Date, weekEnd: Date;
  try {
    ({ start: weekStart, end: weekEnd } = khisWeekPeriodToDateRange(period));
  } catch (err) {
    return makeErrorResult(correlationId, period, facilityId, exportedAt, normalizeErrorString(err));
  }

  // 3. Aggregate Condition resources for the week
  let aggregates: KhisConditionAggregate[];
  try {
    aggregates = await aggregateConditionsForWeek(ctx, facilityId, weekStart, weekEnd);
  } catch (err) {
    return makeErrorResult(correlationId, period, facilityId, exportedAt, `FHIR Condition search failed: ${normalizeErrorString(err)}`);
  }

  // 4. Get KHIS credentials and build payload
  let project: Project;
  try {
    project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id as string);
  } catch (err) {
    return makeErrorResult(correlationId, period, facilityId, exportedAt, `Cannot read project: ${normalizeErrorString(err)}`);
  }

  let credentials: ReturnType<typeof getKhisCredentials>;
  try {
    credentials = getKhisCredentials(project);
  } catch (err) {
    return makeErrorResult(correlationId, period, facilityId, exportedAt, normalizeErrorString(err));
  }

  const payload = buildKhisDataValueSet(credentials, period, facilityOrgUnit, aggregates);

  if (dryRun) {
    const task = await createExportTask(ctx, facility, period, correlationId, exportedAt);
    await createExportAuditEvent(ctx, facility, task, period, 'pending', AuditEventOutcome.Success);
    return {
      status: 'pending',
      correlationId,
      period,
      facilityId,
      facilityOrgUnit,
      conditionCount: aggregates.reduce((s, a) => s + a.suspected + a.confirmed, 0),
      dataValueCount: payload.dataValues.length,
      message: `Dry run: ${payload.dataValues.length} data values would be pushed to KHIS for period ${period}. Set dryRun=false to submit.`,
      exportedAt,
      task: createReference(task),
    };
  }

  // 5. Push to KHIS/DHIS2
  let dhis2ImportStatus = 'ERROR';
  let dhis2ImportCount: number | undefined;
  let status: KhisWeeklyExportStatus = 'error';
  let message = '';

  const task = await createExportTask(ctx, facility, period, correlationId, exportedAt);
  let docRef: (DocumentReference & { id: string }) | undefined;

  try {
    const importSummary = await pushKhisDataValueSet(credentials, payload);
    dhis2ImportStatus = importSummary.status;
    dhis2ImportCount =
      (importSummary.importCount?.imported ?? 0) +
      (importSummary.importCount?.updated ?? 0);
    status = importSummary.status === 'ERROR' ? 'error' : 'exported';
    message = status === 'exported'
      ? `KHIS weekly export successful for ${period}. ${dhis2ImportCount} data values imported/updated.`
      : `KHIS returned import status ERROR for ${period}: ${importSummary.description ?? 'no description'}`;
  } catch (err) {
    status = 'error';
    message = `KHIS push failed: ${normalizeErrorString(err)}`;
  }

  // 6. Persist export artifact as DocumentReference
  try {
    docRef = await createExportDocumentReference(ctx, facility, task, period, payload, status, correlationId, exportedAt);
  } catch {
    // non-fatal — export result is already in Task
  }

  await updateExportTask(ctx, task, status, message, correlationId, dhis2ImportStatus, dhis2ImportCount);

  const outcome = status === 'exported' ? AuditEventOutcome.Success : AuditEventOutcome.MajorFailure;
  await createExportAuditEvent(ctx, facility, task, period, status, outcome);

  const totalConditionCount = aggregates.reduce((s, a) => s + a.suspected + a.confirmed, 0);

  return {
    status,
    correlationId,
    period,
    facilityId,
    facilityOrgUnit,
    conditionCount: totalConditionCount,
    dataValueCount: payload.dataValues.length,
    dhis2ImportStatus,
    dhis2ImportCount,
    message,
    exportedAt,
    task: createReference(task),
    documentReference: docRef ? createReference(docRef) : undefined,
  };
}

async function aggregateConditionsForWeek(
  ctx: AuthenticatedRequestContext,
  facilityId: string,
  weekStart: Date,
  weekEnd: Date
): Promise<KhisConditionAggregate[]> {
  const startStr = weekStart.toISOString().slice(0, 10);
  const endStr = weekEnd.toISOString().slice(0, 10);

  const bundle = await ctx.repo.search<Condition>({
    resourceType: 'Condition',
    filters: [
      { code: 'onset-date', operator: 'ge', value: startStr },
      { code: 'onset-date', operator: 'le', value: endStr },
    ],
    count: 1000,
  });

  const counts = new Map<string, { suspected: number; confirmed: number; deaths: number }>();

  for (const entry of bundle.entry ?? []) {
    const condition = entry.resource;
    if (!condition) {
      continue;
    }

    for (const coding of condition.code?.coding ?? []) {
      const code = coding.code ?? '';
      if (!isKenyaKhisWeeklyNotificationCode(code)) {
        continue;
      }

      if (!counts.has(code)) {
        counts.set(code, { suspected: 0, confirmed: 0, deaths: 0 });
      }
      const agg = counts.get(code)!;
      const verificationStatus = condition.verificationStatus?.coding?.[0]?.code ?? 'unconfirmed';

      if (verificationStatus === 'confirmed') {
        counts.set(code, { ...agg, confirmed: agg.confirmed + 1 });
      } else if (verificationStatus !== 'refuted' && verificationStatus !== 'entered-in-error') {
        counts.set(code, { ...agg, suspected: agg.suspected + 1 });
      }
    }
  }

  return Array.from(counts.entries()).map(([code, counts]) => ({
    code,
    suspected: counts.suspected,
    confirmed: counts.confirmed,
    deaths: counts.deaths,
  }));
}

async function createExportTask(
  ctx: AuthenticatedRequestContext,
  facility: Organization & { id: string },
  period: string,
  correlationId: string,
  startedAt: string
): Promise<Task & { id: string }> {
  return ctx.systemRepo.createResource<Task>({
    resourceType: 'Task',
    meta: { project: ctx.project.id },
    intent: 'order',
    status: 'in-progress',
    authoredOn: startedAt,
    requester: ctx.profile as Task['requester'],
    focus: createReference(facility),
    description: `KHIS MOH 505 weekly aggregate export for ${period} — ${facility.name ?? facility.id}`,
    code: {
      coding: [
        {
          system: 'https://afiax.africa/CodeSystem/kenya-task-type',
          code: 'khis-weekly-export',
          display: 'KHIS Weekly Aggregate Export',
        },
      ],
      text: 'khis-weekly-export',
    },
    businessStatus: { text: 'in-progress' },
    identifier: [{ system: KenyaKhisCorrelationIdSystem, value: correlationId }],
  });
}

async function updateExportTask(
  ctx: AuthenticatedRequestContext,
  task: Task & { id: string },
  status: KhisWeeklyExportStatus,
  message: string,
  correlationId: string,
  dhis2ImportStatus?: string,
  dhis2ImportCount?: number
): Promise<void> {
  const end = new Date().toISOString();
  await ctx.systemRepo.updateResource<Task>({
    ...task,
    status: status === 'error' ? 'failed' : 'completed',
    businessStatus: { text: status },
    lastModified: end,
    executionPeriod: { start: task.authoredOn, end },
    output: [
      { type: { text: 'correlationId' }, valueString: correlationId },
      { type: { text: 'status' }, valueString: status },
      { type: { text: 'message' }, valueString: message },
      ...(dhis2ImportStatus ? [{ type: { text: 'dhis2ImportStatus' }, valueString: dhis2ImportStatus }] : []),
      ...(dhis2ImportCount !== undefined ? [{ type: { text: 'dhis2ImportCount' }, valueInteger: dhis2ImportCount }] : []),
    ],
  });
}

async function createExportDocumentReference(
  ctx: AuthenticatedRequestContext,
  facility: Organization & { id: string },
  task: Task & { id: string },
  period: string,
  payload: import('./khis').KhisDataValueSet,
  status: KhisWeeklyExportStatus,
  correlationId: string,
  exportedAt: string
): Promise<DocumentReference & { id: string }> {
  const ext = buildKenyaKhisWeeklyExportExtension(status, period, exportedAt, correlationId, {
    facilityOrgUnit: payload.orgUnit,
    conditionCount: payload.dataValues.length,
    task: createReference(task),
  });

  return ctx.systemRepo.createResource<DocumentReference>({
    resourceType: 'DocumentReference',
    meta: { project: ctx.project.id },
    status: status === 'exported' ? 'current' : 'entered-in-error',
    type: {
      coding: [
        {
          system: 'https://afiax.africa/CodeSystem/kenya-document-type',
          code: 'khis-weekly-export',
          display: 'KHIS MOH 505 Weekly Aggregate Export',
        },
      ],
    },
    subject: createReference(facility) as DocumentReference['subject'],
    date: exportedAt,
    description: `KHIS MOH 505 weekly aggregate export for ${period}`,
    extension: [ext],
    content: [
      {
        attachment: {
          contentType: 'application/json',
          data: Buffer.from(JSON.stringify(payload, null, 2)).toString('base64'),
          title: `khis-moh505-${period}-${facility.id}.json`,
          creation: exportedAt,
        },
      },
    ],
    context: {
      related: [createReference(task)],
      period: (() => {
        try {
          const { start, end } = khisWeekPeriodToDateRange(period);
          return { start: start.toISOString(), end: end.toISOString() };
        } catch {
          return undefined;
        }
      })(),
    },
  });
}

async function createExportAuditEvent(
  ctx: AuthenticatedRequestContext,
  facility: Organization & { id: string },
  task: Task & { id: string },
  period: string,
  status: KhisWeeklyExportStatus,
  outcome: AuditEventOutcome
): Promise<void> {
  const auditEvent = createAuditEvent(
    RestfulOperationType,
    OperationInteraction,
    ctx.project.id,
    ctx.profile,
    undefined,
    outcome,
    { description: `KHIS MOH 505 weekly export — ${period} — ${status}` }
  );

  auditEvent.entity = [
    ...(auditEvent.entity ?? []),
    { what: createReference(facility) },
    { what: createReference(task) },
  ];

  await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
}

function makeErrorResult(
  correlationId: string,
  period: string,
  facilityId: string,
  exportedAt: string,
  message: string
): KhisWeeklyExportResult {
  return {
    status: 'error',
    correlationId,
    period,
    facilityId,
    conditionCount: 0,
    dataValueCount: 0,
    message,
    exportedAt,
  };
}
