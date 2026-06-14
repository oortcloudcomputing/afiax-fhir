// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  buildKenyaIdsrNotificationExtension,
  createReference,
  getKenyaIdsrConditionCode,
  KenyaIdsrConditionDisplay,
  KenyaIdsrCorrelationIdSystem,
  normalizeErrorString,
} from '@medplum/core';
import type { IdsrNotificationStatus } from '@medplum/core';
import type { AuditEvent, Condition, Task } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import {
  AuditEventOutcome,
  createAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';

export interface IdsrNotificationInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly condition: Condition & { id: string };
  readonly correlationId: string;
}

export interface IdsrNotificationResult {
  readonly status: IdsrNotificationStatus;
  readonly correlationId: string;
  readonly conditionCode: string;
  readonly conditionDisplay: string;
  readonly message: string;
  readonly notifiedAt: string;
  readonly task?: import('@medplum/fhirtypes').Reference<Task>;
}

export async function handleKenyaIdsrNotification(input: IdsrNotificationInput): Promise<IdsrNotificationResult> {
  const { ctx, condition, correlationId } = input;

  const conditionCode = getKenyaIdsrConditionCode(condition);
  if (!conditionCode) {
    return {
      status: 'error',
      correlationId,
      conditionCode: '',
      conditionDisplay: '',
      notifiedAt: new Date().toISOString(),
      message: 'Condition does not carry a Kenya IDSR immediately notifiable ICD-10 code.',
    };
  }

  const conditionDisplay = KenyaIdsrConditionDisplay[conditionCode] ?? conditionCode;
  const notifiedAt = new Date().toISOString();

  let task: (Task & { id: string }) | undefined;
  let status: IdsrNotificationStatus = 'pending';
  let message = '';

  try {
    task = await ctx.systemRepo.createResource<Task>({
      resourceType: 'Task',
      meta: { project: ctx.project.id },
      intent: 'order',
      status: 'requested',
      authoredOn: notifiedAt,
      requester: ctx.profile as Task['requester'],
      focus: createReference(condition),
      description: `IDSR immediate notification: ${conditionDisplay} (${conditionCode}) on Condition/${condition.id}`,
      code: {
        coding: [
          {
            system: 'https://afiax.africa/CodeSystem/kenya-task-type',
            code: 'idsr-immediate-notification',
            display: 'IDSR Immediate Notification',
          },
        ],
        text: 'idsr-immediate-notification',
      },
      businessStatus: { text: 'pending' },
      // 24-hour notification deadline — Kenya Health Act 2017 s.57(1)
      restriction: {
        repetitions: 1,
        period: {
          start: notifiedAt,
          end: new Date(Date.parse(notifiedAt) + 24 * 60 * 60 * 1000).toISOString(),
        },
      },
      identifier: [{ system: KenyaIdsrCorrelationIdSystem, value: correlationId }],
    });

    status = 'pending';
    message = `IDSR immediate notification task created for ${conditionDisplay} (${conditionCode}). Notification must reach the County Director of Health within 24 hours (Kenya Health Act 2017 s.57).`;
  } catch (err) {
    status = 'error';
    message = `IDSR notification task creation failed: ${normalizeErrorString(err)}`;
  }

  await createIdsrAuditEvent(ctx, condition, task, conditionCode, conditionDisplay, status);

  return {
    status,
    correlationId,
    conditionCode,
    conditionDisplay,
    message,
    notifiedAt,
    task: task ? createReference(task) : undefined,
  };
}

async function createIdsrAuditEvent(
  ctx: AuthenticatedRequestContext,
  condition: Condition & { id: string },
  task: (Task & { id: string }) | undefined,
  conditionCode: string,
  conditionDisplay: string,
  status: IdsrNotificationStatus
): Promise<void> {
  const outcome = status === 'error' ? AuditEventOutcome.MajorFailure : AuditEventOutcome.Success;

  const auditEvent = createAuditEvent(
    RestfulOperationType,
    OperationInteraction,
    ctx.project.id,
    ctx.profile,
    undefined,
    outcome,
    { description: `IDSR immediate notification: ${conditionDisplay} (${conditionCode})` }
  );

  auditEvent.entity = [
    ...(auditEvent.entity ?? []),
    { what: createReference(condition) },
    ...(task ? [{ what: createReference(task) }] : []),
  ];

  await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
}

export function applyIdsrNotificationExtension(
  condition: Condition & { id: string },
  result: IdsrNotificationResult
): Condition & { id: string } {
  const ext = buildKenyaIdsrNotificationExtension(
    result.status,
    result.conditionCode,
    result.notifiedAt,
    result.correlationId,
    result.task
  );

  const otherExtensions = (condition.extension ?? []).filter((e) => e.url !== ext.url);

  return { ...condition, extension: [...otherExtensions, ext] };
}
