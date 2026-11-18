// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  buildKenyaBreakGlassExtension,
  createReference,
  getKenyaSecurityAlertEmail,
  KenyaBreakGlassCorrelationIdSystem,
  KenyaBreakGlassDefaultDurationHours,
  KenyaBreakGlassFlagCode,
  KenyaBreakGlassFlagSystem,
  normalizeErrorString,
} from '@medplum/core';
import type { AuditEvent, Flag, Patient, Project, Reference } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { sendEmail } from '../../email/email';
import { formatEmailTime, getActingPerson, getAppLink, getSupportEmail } from '../../email/helpers';
import { renderEmail } from '../../email/templates';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';

// Every emergency access must be reviewed within this many hours of starting.
const BreakGlassReviewHours = 24;

// IHE ATNA / HL7 v3 purpose-of-use code system
const ActReasonCodeSystem = 'http://terminology.hl7.org/CodeSystem/v3-ActReason';

export interface BreakGlassInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly patient: Patient & { id: string };
  readonly reason: string;
  readonly durationHours?: number;
  readonly correlationId: string;
}

export interface BreakGlassResult {
  readonly status: 'active' | 'error';
  readonly correlationId: string;
  readonly patientId: string;
  readonly declaredAt: string;
  readonly expiresAt: string;
  readonly durationHours: number;
  readonly message: string;
  readonly flag?: Reference<Flag>;
  readonly alertSent: boolean;
}

export async function handleBreakGlassAccess(input: BreakGlassInput): Promise<BreakGlassResult> {
  const { ctx, patient, reason, correlationId } = input;
  const durationHours = Math.min(Math.max(input.durationHours ?? KenyaBreakGlassDefaultDurationHours, 1), 24);
  const declaredAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(declaredAt) + durationHours * 3600 * 1000).toISOString();

  const declaredByRef = ctx.profile?.reference ?? 'unknown';
  const patientDisplay =
    [patient.name?.[0]?.family, patient.name?.[0]?.given?.[0]].filter(Boolean).join(', ') || patient.id;

  let flag: (Flag & { id: string }) | undefined;
  try {
    flag = await createBreakGlassFlag(ctx, patient, reason, declaredAt, expiresAt, correlationId);
  } catch (err) {
    await createBreakGlassAuditEvent(ctx, patient, reason, correlationId, AuditEventOutcome.MajorFailure);
    return {
      status: 'error',
      correlationId,
      patientId: patient.id,
      declaredAt,
      expiresAt,
      durationHours,
      message: `Break-glass declaration failed: ${normalizeErrorString(err)}`,
      alertSent: false,
    };
  }

  // Persist break-glass snapshot on the Patient
  await persistBreakGlassOnPatient(ctx, patient, reason, declaredAt, expiresAt, correlationId, declaredByRef, flag);

  // AuditEvent with ETREAT purpose-of-use — IHE ATNA emergency access pattern
  await createBreakGlassAuditEvent(ctx, patient, reason, correlationId, AuditEventOutcome.Success, flag);

  // Security alert email — non-fatal if it fails
  let alertSent = false;
  try {
    const project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id);
    await sendBreakGlassAlert(ctx, project, flag, declaredAt, expiresAt, durationHours, correlationId);
    alertSent = true;
  } catch (err) {
    // Log but don't fail the declaration — alert failure must not block emergency access
    ctx.logger?.warn('Break-glass security alert email failed', { error: normalizeErrorString(err) });
  }

  return {
    status: 'active',
    correlationId,
    patientId: patient.id,
    declaredAt,
    expiresAt,
    durationHours,
    message: `Break-glass emergency access declared for patient ${patientDisplay}. Access expires at ${expiresAt}. Security team has been alerted.`,
    flag: createReference(flag),
    alertSent,
  };
}

async function createBreakGlassFlag(
  ctx: AuthenticatedRequestContext,
  patient: Patient & { id: string },
  reason: string,
  declaredAt: string,
  expiresAt: string,
  correlationId: string
): Promise<Flag & { id: string }> {
  return ctx.systemRepo.createResource<Flag>({
    resourceType: 'Flag',
    meta: { project: ctx.project.id },
    status: 'active',
    category: [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/flag-category',
            code: 'security',
            display: 'Security',
          },
        ],
      },
    ],
    code: {
      coding: [
        {
          system: KenyaBreakGlassFlagSystem,
          code: KenyaBreakGlassFlagCode,
          display: 'Break-glass emergency access declared',
        },
      ],
      text: `Break-glass: ${reason}`,
    },
    subject: createReference(patient),
    period: { start: declaredAt, end: expiresAt },
    author: ctx.profile as Flag['author'],
    identifier: [{ system: KenyaBreakGlassCorrelationIdSystem, value: correlationId }],
  });
}

async function persistBreakGlassOnPatient(
  ctx: AuthenticatedRequestContext,
  patient: Patient & { id: string },
  reason: string,
  declaredAt: string,
  expiresAt: string,
  correlationId: string,
  declaredBy: string,
  flag: Flag & { id: string }
): Promise<void> {
  const ext = buildKenyaBreakGlassExtension(
    'active',
    reason,
    declaredAt,
    expiresAt,
    correlationId,
    declaredBy,
    createReference(flag)
  );

  const otherExtensions = (patient.extension ?? []).filter((e) => e.url !== ext.url);
  await ctx.systemRepo.updateResource<Patient>({
    ...patient,
    extension: [...otherExtensions, ext],
  });
}

async function createBreakGlassAuditEvent(
  ctx: AuthenticatedRequestContext,
  patient: Patient & { id: string },
  reason: string,
  correlationId: string,
  outcome: AuditEventOutcome,
  flag?: Flag & { id: string }
): Promise<void> {
  const auditEvent = createAuditEvent(
    RestfulOperationType,
    OperationInteraction,
    ctx.project.id,
    ctx.profile,
    undefined,
    outcome,
    { description: `Break-glass emergency access declared: ${reason}` }
  );

  // IHE ATNA emergency treatment purpose-of-use
  auditEvent.purposeOfEvent = [
    {
      coding: [
        {
          system: ActReasonCodeSystem,
          code: 'ETREAT',
          display: 'Emergency Treatment',
        },
      ],
    },
  ];

  auditEvent.entity = [
    ...(auditEvent.entity ?? []),
    { what: createReference(patient) },
    ...(flag ? [{ what: createReference(flag) }] : []),
  ];

  const saved = await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
  logAuditEvent(saved);
}

/**
 * Emails the organisation's security alert contact. Content and wording: specs/break-glass-alert.md in
 * oortcloud-email-templates. The patient's name, ID and the reason are clinical information, so the email
 * leaves them out and links to the Flag, which the reviewer opens after signing in.
 * @param ctx - The request context of the person who declared emergency access.
 * @param project - Their project, with its settings.
 * @param flag - The break-glass Flag.
 * @param declaredAt - When access started (ISO).
 * @param expiresAt - When access ends by itself (ISO).
 * @param durationHours - How long access lasts.
 * @param correlationId - The reference shared by the Flag, AuditEvent and alert.
 */
async function sendBreakGlassAlert(
  ctx: AuthenticatedRequestContext,
  project: Project,
  flag: Flag & { id: string },
  declaredAt: string,
  expiresAt: string,
  durationHours: number,
  correlationId: string
): Promise<void> {
  const projectName = project.name ?? ctx.project.id;
  const declaredBy = await getActingPerson(ctx);

  const { subject, html, text } = renderEmail('break-glass-alert', {
    projectName,
    declaredByName: declaredBy?.name ?? 'A staff member',
    declaredAt: formatEmailTime(declaredAt),
    expiresAt: formatEmailTime(expiresAt),
    durationHours,
    reviewBy: formatEmailTime(new Date(Date.parse(declaredAt) + BreakGlassReviewHours * 3600 * 1000)),
    correlationId,
    reviewUrl: getAppLink(`Flag/${flag.id}`).url,
    supportEmail: getSupportEmail(),
  });

  await sendEmail(ctx.systemRepo, { to: getKenyaSecurityAlertEmail(project), subject, html, text });
}
