// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Delivery of IDSR immediate notifications to the Ministry of Health (DHA REP-IMM-001):
//   1. a DHIS2 event in the KHIS IDSR immediate-notification program, and
//   2. an email to the County Disease Surveillance Coordinator / County Director of Health.
// The notification Task records KHIS's confirmation (the DHIS2 event UID) or the failure. Failed
// deliveries are retried by the Kenya surveillance worker every hour.

import type { WithId } from '@medplum/core';
import {
  calculateAge,
  createReference,
  findKenyaIdsrImmediateCondition,
  getKenyaIdsrConditionCode,
  getKenyaIdsrNotificationEmails,
  getKenyaKhisIdsrEventProgram,
  normalizeErrorString,
  Operator,
} from '@medplum/core';
import type { AuditEvent, Condition, Organization, Patient, Project, Task } from '@medplum/fhirtypes';
import { sendEmail } from '../../email/email';
import type { Repository } from '../../fhir/repo';
import { getLogger } from '../../logger';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import { getMflCode, KenyaFacilityAttribution } from './facility-attribution';
import type { KenyaContext } from './job-context';
import type { KhisDataValue } from './khis';
import { getKhisConnection, pushKhisTrackerEvent } from './khis';

export const KenyaIdsrDeliveryStatusSystem = 'https://afiax.africa/CodeSystem/kenya-idsr-delivery-status';
export type KenyaIdsrDeliveryStatus = 'reported' | 'delivery-failed';

export interface IdsrDeliveryResult {
  readonly delivered: boolean;
  readonly khisEventUid?: string;
  readonly emailedTo: string[];
  readonly message: string;
}

/**
 * Sends an IDSR immediate notification to KHIS and the configured county contacts, and records the
 * outcome on the notification Task.
 * @param ctx - The context.
 * @param condition - The notifiable Condition.
 * @param task - The IDSR immediate-notification Task.
 * @returns The delivery result.
 */
export async function deliverKenyaIdsrNotification(
  ctx: KenyaContext,
  condition: WithId<Condition>,
  task: WithId<Task>
): Promise<IdsrDeliveryResult> {
  const code = getKenyaIdsrConditionCode(condition) ?? '';
  const disease = findKenyaIdsrImmediateCondition(code)?.display ?? code;
  const now = new Date().toISOString();

  // Secrets are not on the cached auth-state project, so re-read it
  const project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id);
  const patient = await readPatient(ctx, condition);
  const facility = await (await KenyaFacilityAttribution.load(ctx)).getFacility(condition);

  let khisEventUid: string | undefined;
  let khisError: string | undefined;
  try {
    const program = getKenyaKhisIdsrEventProgram(project);
    if (!program) {
      throw new Error(
        'KHIS IDSR event program is not configured. Set the kenyaKhisIdsrEventProgram project setting ' +
          'with the program UID and data element UIDs from your KHIS administrator.'
      );
    }
    const orgUnit = getMflCode(facility);
    if (!orgUnit) {
      throw new Error(
        'Cannot tell which facility this case belongs to: link the Condition to an encounter whose service ' +
          'provider is a facility with an MFL code (needed as the KHIS org unit).'
      );
    }
    const values = buildIdsrValues(condition, patient, facility, code, disease, now);
    const dataValues: KhisDataValue[] = [];
    for (const [field, uid] of Object.entries(program.dataElements)) {
      const value = values[field];
      if (uid && value !== undefined && value !== '') {
        dataValues.push({ dataElement: uid, value });
      }
    }
    const confirmation = await pushKhisTrackerEvent(getKhisConnection(project), {
      program: program.program,
      programStage: program.programStage,
      orgUnit,
      occurredAt: (condition.onsetDateTime ?? condition.recordedDate ?? now).slice(0, 10),
      status: 'COMPLETED',
      dataValues,
    });
    khisEventUid = confirmation.eventUid ?? 'unknown';
  } catch (err) {
    khisError = normalizeErrorString(err);
  }

  const emailedTo = await emailCountyContacts(ctx, project, condition, disease, facility, khisEventUid, khisError);

  const delivered = !!khisEventUid;
  const message = delivered
    ? `Reported to KHIS (DHIS2 event ${khisEventUid}) at ${now}.`
    : `KHIS delivery failed: ${khisError}. Will retry hourly.`;

  const status: KenyaIdsrDeliveryStatus = delivered ? 'reported' : 'delivery-failed';
  await ctx.systemRepo.updateResource<Task>({
    ...task,
    status: delivered ? 'completed' : 'in-progress',
    businessStatus: { coding: [{ system: KenyaIdsrDeliveryStatusSystem, code: status }], text: status },
    lastModified: now,
    note: [
      ...(task.note ?? []),
      {
        time: now,
        text: message + (emailedTo.length ? ` Emailed ${emailedTo.join(', ')}.` : ' No notification email configured.'),
      },
    ],
    ...(delivered
      ? { output: [...(task.output ?? []), { type: { text: 'khisEventUid' }, valueString: khisEventUid }] }
      : {}),
  });

  await createDeliveryAuditEvent(ctx, condition, task, `IDSR delivery to KHIS: ${disease}: ${message}`, delivered);

  return { delivered, khisEventUid, emailedTo, message };
}

/**
 * Retries delivery for every IDSR notification Task in the project whose KHIS delivery failed.
 * @param ctx - The context.
 * @returns The number of Tasks retried and delivered.
 */
export async function retryFailedKenyaIdsrDeliveries(
  ctx: KenyaContext
): Promise<{ retried: number; delivered: number }> {
  const tasks = await ctx.systemRepo.searchResources<Task>({
    resourceType: 'Task',
    filters: [
      { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
      { code: 'business-status', operator: Operator.EQUALS, value: `${KenyaIdsrDeliveryStatusSystem}|delivery-failed` },
    ],
    count: 100,
  });
  let delivered = 0;
  for (const task of tasks) {
    const ref = task.focus?.reference;
    if (!ref?.startsWith('Condition/')) {
      continue;
    }
    try {
      const condition = await ctx.systemRepo.readReference<Condition>({ reference: ref });
      const result = await deliverKenyaIdsrNotification(ctx, condition, task);
      if (result.delivered) {
        delivered++;
      }
    } catch (err) {
      getLogger().error('IDSR delivery retry failed', { task: task.id, err });
    }
  }
  return { retried: tasks.length, delivered };
}

function buildIdsrValues(
  condition: Condition,
  patient: Patient | undefined,
  facility: Organization | undefined,
  code: string,
  disease: string,
  notifiedAt: string
): Record<string, string | number | undefined> {
  const home = patient?.address?.find((a) => a.use === 'home') ?? patient?.address?.[0];
  return {
    disease,
    icd11Code: code,
    verificationStatus: condition.verificationStatus?.coding?.[0]?.code ?? 'unconfirmed',
    onsetDate: (condition.onsetDateTime ?? condition.onsetPeriod?.start)?.slice(0, 10),
    sex: patient?.gender,
    ageYears: patient?.birthDate ? calculateAge(patient.birthDate).years : undefined,
    county: home?.state,
    subCounty: home?.district,
    outcome: patient?.deceasedBoolean || patient?.deceasedDateTime ? 'died' : 'alive',
    reportingFacility: facility?.name,
    notifiedAt,
  };
}

async function readPatient(ctx: KenyaContext, condition: Condition): Promise<Patient | undefined> {
  const ref = condition.subject?.reference;
  if (!ref?.startsWith('Patient/')) {
    return undefined;
  }
  try {
    return await ctx.systemRepo.readReference<Patient>({ reference: ref });
  } catch {
    return undefined;
  }
}

async function emailCountyContacts(
  ctx: KenyaContext,
  project: Project,
  condition: WithId<Condition>,
  disease: string,
  facility: Organization | undefined,
  khisEventUid: string | undefined,
  khisError: string | undefined
): Promise<string[]> {
  const to = getKenyaIdsrNotificationEmails(project);
  if (to.length === 0) {
    return [];
  }
  const facilityName = facility?.name ?? project.name ?? 'Unknown facility';
  try {
    await sendEmail(ctx.systemRepo as unknown as Repository, {
      to,
      subject: `[IDSR IMMEDIATE] ${disease} - ${facilityName}`,
      text: [
        'IDSR IMMEDIATE NOTIFICATION (Kenya Health Act 2017 s.57)',
        '',
        `Disease:            ${disease}`,
        `Verification:       ${condition.verificationStatus?.coding?.[0]?.code ?? 'unconfirmed'}`,
        `Onset date:         ${condition.onsetDateTime ?? 'not recorded'}`,
        `Reporting facility: ${facilityName}`,
        `Record:             Condition/${condition.id}`,
        `KHIS submission:    ${khisEventUid ? `accepted, DHIS2 event ${khisEventUid}` : `FAILED (${khisError})`}`,
        '',
        'Patient identifiers are not included in this email. Open the record in Afiax for case details.',
      ].join('\n'),
    });
    return to;
  } catch (err) {
    getLogger().error('IDSR notification email failed', { condition: condition.id, err });
    return [];
  }
}

async function createDeliveryAuditEvent(
  ctx: KenyaContext,
  condition: WithId<Condition>,
  task: WithId<Task>,
  description: string,
  delivered: boolean
): Promise<void> {
  const auditEvent = createAuditEvent(
    RestfulOperationType,
    OperationInteraction,
    ctx.project.id,
    ctx.profile,
    undefined,
    delivered ? AuditEventOutcome.Success : AuditEventOutcome.MajorFailure,
    { description }
  );
  auditEvent.entity = [
    ...(auditEvent.entity ?? []),
    { what: createReference(condition) },
    { what: createReference(task) },
  ];
  const saved = await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
  logAuditEvent(saved);
}
