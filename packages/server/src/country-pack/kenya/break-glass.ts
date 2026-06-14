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
import type { AuditEvent, Flag, Patient, Project } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { sendEmail } from '../../email/email';
import {
  AuditEventOutcome,
  createAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';

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
  readonly flag?: import('@medplum/fhirtypes').Reference<Flag>;
  readonly alertSent: boolean;
}

export async function handleBreakGlassAccess(input: BreakGlassInput): Promise<BreakGlassResult> {
  const { ctx, patient, reason, correlationId } = input;
  const durationHours = Math.min(Math.max(input.durationHours ?? KenyaBreakGlassDefaultDurationHours, 1), 24);
  const declaredAt = new Date().toISOString();
  const expiresAt = new Date(Date.parse(declaredAt) + durationHours * 3600 * 1000).toISOString();

  const declaredByRef = ctx.profile?.reference ?? 'unknown';
  const patientDisplay = [patient.name?.[0]?.family, patient.name?.[0]?.given?.[0]].filter(Boolean).join(', ') || patient.id;

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
    const project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id as string);
    await sendBreakGlassAlert(ctx, project, patient, patientDisplay, reason, declaredAt, expiresAt, declaredByRef, correlationId);
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
  (auditEvent as AuditEvent).purposeOfEvent = [
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

  await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
}

async function sendBreakGlassAlert(
  ctx: AuthenticatedRequestContext,
  project: Project,
  patient: Patient & { id: string },
  patientDisplay: string,
  reason: string,
  declaredAt: string,
  expiresAt: string,
  declaredBy: string,
  correlationId: string
): Promise<void> {
  const alertEmail = getKenyaSecurityAlertEmail(project);
  const projectName = project.name ?? ctx.project.id;

  await sendEmail(ctx.systemRepo as any, {
    to: alertEmail,
    subject: `[SECURITY ALERT] Break-glass emergency access — ${patientDisplay} — ${projectName}`,
    text: [
      'BREAK-GLASS EMERGENCY ACCESS DECLARATION',
      '=========================================',
      '',
      `Project:     ${projectName}`,
      `Patient:     ${patientDisplay} (Patient/${patient.id})`,
      `Declared by: ${declaredBy}`,
      `Declared at: ${declaredAt}`,
      `Expires at:  ${expiresAt}`,
      `Reason:      ${reason}`,
      `Correlation: ${correlationId}`,
      '',
      'This access declaration requires post-hoc review within 24 hours.',
      '',
      'Review actions:',
      '  1. Confirm the clinical emergency that required this access',
      '  2. Verify the declared reason matches the clinical record',
      '  3. Revoke the Flag resource if access was not justified',
      '  4. Document the outcome of this review in the patient record',
      '',
      'If this access appears to be unauthorized, escalate to the Data Protection Officer immediately.',
      '',
      'Afiax Connected Healthcare — Security Team',
      'This is an automated security alert.',
    ].join('\n'),
  });
}
