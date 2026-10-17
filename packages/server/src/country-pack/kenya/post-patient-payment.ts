// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { KenyaErpNextModeOfPayment, KenyaPatientPaymentMethod } from '@medplum/core';
import {
  addPaymentToErpNextSnapshot,
  buildKenyaErpNextSubmissionExtension,
  buildKenyaPatientPaymentExtension,
  createReference,
  getKenyaErpNextPatientSnapshot,
  getKenyaErpNextSubmissionSnapshot,
  normalizeErrorString,
} from '@medplum/core';
import type { AuditEvent, Claim, Patient, PaymentNotice, Project, Reference, Task } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { globalLogger } from '../../logger';
import {
  AuditEventOutcome,
  createAuditEvent,
  logAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import { getKenyaAfiaxPayCredentials, hasKenyaAfiaxPayCredentials, initiateAfiaxPayRequest } from './afiax-pay';
import { createErpNextPaymentEntry, getKenyaErpNextCredentials, hasKenyaErpNextCredentials } from './erpnext';
import { getKenyaMpesaCredentials, hasKenyaMpesaCredentials, normalizeMpesaError, sendMpesaStkPush } from './mpesa';

export interface PostPatientPaymentInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly claim: Claim & { id: string };
  readonly method: KenyaPatientPaymentMethod;
  readonly amount: number;
  readonly currency: string;
  readonly phone?: string;
  readonly transactionRef?: string;
  readonly notes?: string;
  readonly correlationId: string;
  readonly project: Project & { id: string };
  readonly baseUrl: string;
}

export interface PostPatientPaymentResult {
  readonly status: 'confirmed' | 'pending' | 'error';
  readonly correlationId: string;
  readonly method: KenyaPatientPaymentMethod;
  readonly amount: number;
  readonly currency: string;
  readonly patientDue?: number;
  readonly message: string;
  readonly erpNextPaymentEntry?: string;
  readonly checkoutRequestId?: string;
  readonly customerMessage?: string;
  readonly paymentRequestId?: string;
  readonly paymentUrl?: string;
  readonly paymentNoticeReference?: Reference<PaymentNotice>;
  readonly task?: Reference<Task>;
}

// Identifier systems used to correlate callbacks back to a PaymentNotice.
export const MpesaCheckoutRequestSystem = 'https://afiax.africa/kenya/identifier/mpesa-checkout-request';
export const AfiaxPayRequestSystem = 'https://afiax.africa/kenya/identifier/afiax-pay-request';

export async function handlePostPatientPayment(input: PostPatientPaymentInput): Promise<PostPatientPaymentResult> {
  const { ctx, claim, method, amount, currency, correlationId } = input;
  const postedAt = new Date().toISOString();

  try {
    switch (method) {
      case 'cash':
      case 'card':
      case 'mpesa-manual':
        return await handleSynchronousPayment(input, postedAt);
      case 'mpesa-stk':
        return await handleMpesaStkPayment(input, postedAt);
      case 'afiax-pay':
        return await handleAfiaxPayPayment(input, postedAt);
      default: {
        const _exhaustive: never = method;
        throw new Error(`Unsupported payment method: ${_exhaustive}`);
      }
    }
  } catch (err) {
    await writeAuditEvent(ctx, claim, undefined, correlationId, AuditEventOutcome.MajorFailure);
    return {
      status: 'error',
      correlationId,
      method,
      amount,
      currency,
      message: `Patient payment failed: ${normalizeErrorString(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Synchronous payment (cash / card / mpesa-manual)
// ---------------------------------------------------------------------------

async function handleSynchronousPayment(
  input: PostPatientPaymentInput,
  postedAt: string
): Promise<PostPatientPaymentResult> {
  const { ctx, claim, method, amount, currency, correlationId, project } = input;

  const modeOfPayment = methodToErpNextMode(method);
  const patientName = await resolvePatientName(ctx, claim);

  // ERPNext Payment Entry (fire-and-forget on failure — FHIR record is authoritative).
  let erpNextPaymentEntry: string | undefined;
  const snapshot = getKenyaErpNextSubmissionSnapshot(claim);
  if (snapshot?.invoiceName && hasKenyaErpNextCredentials(project)) {
    try {
      const credentials = getKenyaErpNextCredentials(project);
      const entry = await createErpNextPaymentEntry(credentials, {
        invoiceName: snapshot.invoiceName,
        amount,
        currency,
        modeOfPayment: methodToErpNextModeLabel(method),
        partyName: patientName,
        customFields: {
          custom_fhir_claim_id: `Claim/${claim.id}`,
          custom_payment_method: method,
          ...(input.transactionRef ? { custom_transaction_ref: input.transactionRef } : {}),
        },
      });
      erpNextPaymentEntry = entry.paymentEntryName;
    } catch (err) {
      globalLogger.warn('ERPNext patient payment entry failed (non-blocking)', {
        claimId: claim.id,
        method,
        error: normalizeErrorString(err),
      });
    }
  }

  // Update Claim ERPNext snapshot.
  const currentSnapshot = snapshot ?? {};
  const updatedSnapshot = erpNextPaymentEntry
    ? addPaymentToErpNextSnapshot(currentSnapshot, {
        payerType: 'patient',
        payerName: patientName,
        paymentEntryName: erpNextPaymentEntry,
        amount,
        currency,
        modeOfPayment,
        confirmedAt: postedAt,
        patientPaymentStatus: 'confirmed',
      })
    : currentSnapshot;

  if (erpNextPaymentEntry) {
    const ext = buildKenyaErpNextSubmissionExtension(updatedSnapshot);
    const otherExts = (claim.extension ?? []).filter((e) => e.url !== ext.url);
    await ctx.systemRepo.updateResource<Claim>({ ...claim, extension: [...otherExts, ext] });
  }

  const paymentNotice = await createPaymentNotice(ctx, claim, {
    method,
    paymentStatus: 'confirmed',
    amount,
    currency,
    transactionRef: input.transactionRef,
    paymentEntryName: erpNextPaymentEntry,
    confirmedAt: postedAt,
    correlationId,
  });

  const task = await ctx.systemRepo.createResource<Task>({
    resourceType: 'Task',
    meta: { project: ctx.project.id },
    status: 'completed',
    intent: 'order',
    authoredOn: postedAt,
    requester: ctx.profile as Task['requester'],
    focus: createReference(claim),
    description: `Patient ${method} payment of ${currency} ${amount} recorded${input.transactionRef ? ` (ref: ${input.transactionRef})` : ''}`,
    code: { coding: [{ system: 'https://afiax.africa/fhir/CodeSystem/kenya-task-type', code: 'patient-payment' }] },
    businessStatus: { text: 'confirmed' },
    identifier: [{ system: 'https://afiax.africa/identifier/correlation-id', value: correlationId }],
  });

  await writeAuditEvent(ctx, claim, task, correlationId, AuditEventOutcome.Success);

  return {
    status: 'confirmed',
    correlationId,
    method,
    amount,
    currency,
    patientDue: updatedSnapshot.patientDue,
    message: `${method.replace('-', ' ')} payment of ${currency} ${amount} confirmed.${updatedSnapshot.patientDue === 0 ? ' Balance cleared.' : ` Remaining: ${currency} ${updatedSnapshot.patientDue ?? 'unknown'}.`}`,
    erpNextPaymentEntry,
    paymentNoticeReference: createReference(paymentNotice),
    task: createReference(task),
  };
}

// ---------------------------------------------------------------------------
// M-Pesa STK push (async — confirmed via callback)
// ---------------------------------------------------------------------------

async function handleMpesaStkPayment(
  input: PostPatientPaymentInput,
  postedAt: string
): Promise<PostPatientPaymentResult> {
  const { ctx, claim, amount, currency, correlationId, project, baseUrl } = input;

  if (!input.phone) {
    throw new Error('phone is required for mpesa-stk payment method.');
  }

  if (!hasKenyaMpesaCredentials(project)) {
    throw new Error('M-Pesa credentials are not configured for this project.');
  }

  const credentials = getKenyaMpesaCredentials(project, baseUrl, ctx.project.id);

  let stkResult;
  try {
    stkResult = await sendMpesaStkPush(
      credentials,
      input.phone,
      amount,
      `Claim/${claim.id}`,
      `Afiax Healthcare payment of ${currency} ${amount}`
    );
  } catch (err) {
    throw new Error(normalizeMpesaError(err));
  }

  const paymentNotice = await createPaymentNotice(ctx, claim, {
    method: 'mpesa-stk',
    paymentStatus: 'pending',
    amount,
    currency,
    gatewayReference: stkResult.checkoutRequestId,
    phone: input.phone,
    correlationId,
    identifierSystem: MpesaCheckoutRequestSystem,
    identifierValue: stkResult.checkoutRequestId,
  });

  const task = await ctx.systemRepo.createResource<Task>({
    resourceType: 'Task',
    meta: { project: ctx.project.id },
    status: 'in-progress',
    intent: 'order',
    authoredOn: postedAt,
    requester: ctx.profile as Task['requester'],
    focus: createReference(claim),
    description: `M-Pesa STK push sent for ${currency} ${amount} to ${input.phone}`,
    code: {
      coding: [{ system: 'https://afiax.africa/fhir/CodeSystem/kenya-task-type', code: 'patient-payment-mpesa-stk' }],
    },
    businessStatus: { text: 'pending' },
    identifier: [{ system: 'https://afiax.africa/identifier/correlation-id', value: correlationId }],
  });

  await writeAuditEvent(ctx, claim, task, correlationId, AuditEventOutcome.Success);

  return {
    status: 'pending',
    correlationId,
    method: 'mpesa-stk',
    amount,
    currency,
    message: stkResult.customerMessage || 'M-Pesa STK push sent. Patient will receive a payment prompt on their phone.',
    checkoutRequestId: stkResult.checkoutRequestId,
    customerMessage: stkResult.customerMessage,
    paymentNoticeReference: createReference(paymentNotice),
    task: createReference(task),
  };
}

// ---------------------------------------------------------------------------
// Afiax Pay (async — confirmed via callback)
// ---------------------------------------------------------------------------

async function handleAfiaxPayPayment(
  input: PostPatientPaymentInput,
  postedAt: string
): Promise<PostPatientPaymentResult> {
  const { ctx, claim, amount, currency, correlationId, project, baseUrl } = input;

  if (!hasKenyaAfiaxPayCredentials(project)) {
    throw new Error('Afiax Pay credentials are not configured for this project.');
  }

  const credentials = getKenyaAfiaxPayCredentials(project, baseUrl, ctx.project.id);
  const payResult = await initiateAfiaxPayRequest(credentials, {
    amount,
    currency,
    reference: `Claim/${claim.id}`,
    description: `Afiax Healthcare payment for claim ${claim.id}`,
    customerPhone: input.phone,
  });

  const paymentNotice = await createPaymentNotice(ctx, claim, {
    method: 'afiax-pay',
    paymentStatus: 'pending',
    amount,
    currency,
    gatewayReference: payResult.paymentRequestId,
    phone: input.phone,
    correlationId,
    identifierSystem: AfiaxPayRequestSystem,
    identifierValue: payResult.paymentRequestId,
  });

  const task = await ctx.systemRepo.createResource<Task>({
    resourceType: 'Task',
    meta: { project: ctx.project.id },
    status: 'in-progress',
    intent: 'order',
    authoredOn: postedAt,
    requester: ctx.profile as Task['requester'],
    focus: createReference(claim),
    description: `Afiax Pay payment request initiated for ${currency} ${amount}`,
    code: {
      coding: [{ system: 'https://afiax.africa/fhir/CodeSystem/kenya-task-type', code: 'patient-payment-afiax-pay' }],
    },
    businessStatus: { text: 'pending' },
    identifier: [{ system: 'https://afiax.africa/identifier/correlation-id', value: correlationId }],
  });

  await writeAuditEvent(ctx, claim, task, correlationId, AuditEventOutcome.Success);

  return {
    status: 'pending',
    correlationId,
    method: 'afiax-pay',
    amount,
    currency,
    message: 'Afiax Pay payment request initiated. Patient will receive a payment link.',
    paymentRequestId: payResult.paymentRequestId,
    paymentUrl: payResult.paymentUrl,
    paymentNoticeReference: createReference(paymentNotice),
    task: createReference(task),
  };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

interface CreatePaymentNoticeOptions {
  readonly method: KenyaPatientPaymentMethod;
  readonly paymentStatus: 'confirmed' | 'pending';
  readonly amount: number;
  readonly currency: string;
  readonly gatewayReference?: string;
  readonly transactionRef?: string;
  readonly phone?: string;
  readonly paymentEntryName?: string;
  readonly confirmedAt?: string;
  readonly correlationId: string;
  readonly identifierSystem?: string;
  readonly identifierValue?: string;
}

async function createPaymentNotice(
  ctx: AuthenticatedRequestContext,
  claim: Claim & { id: string },
  opts: CreatePaymentNoticeOptions
): Promise<PaymentNotice & { id: string }> {
  const ext = buildKenyaPatientPaymentExtension({
    method: opts.method,
    paymentStatus: opts.paymentStatus,
    amount: opts.amount,
    currency: opts.currency,
    gatewayReference: opts.gatewayReference,
    transactionRef: opts.transactionRef,
    phone: opts.phone,
    paymentEntryName: opts.paymentEntryName,
    confirmedAt: opts.confirmedAt,
  });

  return ctx.systemRepo.createResource<PaymentNotice>({
    resourceType: 'PaymentNotice',
    meta: { project: ctx.project.id },
    status: 'active',
    request: createReference(claim),
    created: new Date().toISOString(),
    // FHIR R4 PaymentNotice.payment (1..1) and .recipient (1..1) are required by the spec.
    // We record the payment method in the extension; these fields carry a display label only.
    payment: { display: `Patient ${opts.method} payment` },
    recipient: { display: 'Afiax Healthcare' },
    amount: { value: opts.amount, currency: opts.currency as 'KES' | 'USD' | 'EUR' },
    paymentDate: opts.confirmedAt ? opts.confirmedAt.slice(0, 10) : undefined,
    extension: [ext],
    identifier: [
      { system: 'https://afiax.africa/identifier/correlation-id', value: opts.correlationId },
      ...(opts.identifierSystem && opts.identifierValue
        ? [{ system: opts.identifierSystem, value: opts.identifierValue }]
        : []),
    ],
  }) as Promise<PaymentNotice & { id: string }>;
}

async function resolvePatientName(ctx: AuthenticatedRequestContext, claim: Claim & { id: string }): Promise<string> {
  if (!claim.patient?.reference) {
    return `Claim/${claim.id}`;
  }
  try {
    const patient = await ctx.systemRepo.readReference<Patient>(claim.patient);
    const erpExtSnapshot = getKenyaErpNextPatientSnapshot(patient as Patient);
    if (erpExtSnapshot?.customerName) {
      return erpExtSnapshot.customerName;
    }
    const name = (patient as Patient).name?.[0];
    if (name) {
      return [...(name.given ?? []), name.family].filter(Boolean).join(' ');
    }
  } catch {
    // fall through to fallback
  }
  return `Claim/${claim.id}`;
}

const ErpNextModeByMethod: Record<KenyaPatientPaymentMethod, KenyaErpNextModeOfPayment> = {
  cash: 'cash',
  card: 'card',
  'mpesa-manual': 'mpesa',
  'mpesa-stk': 'mpesa',
  'afiax-pay': 'afiax-pay',
};

export function methodToErpNextMode(method: KenyaPatientPaymentMethod): KenyaErpNextModeOfPayment {
  return ErpNextModeByMethod[method];
}

// ERPNext uses string labels — must match a configured Mode of Payment in ERPNext.
const ErpNextModeLabelByMethod: Record<KenyaPatientPaymentMethod, string> = {
  cash: 'Cash',
  card: 'Card',
  'mpesa-manual': 'M-Pesa',
  'mpesa-stk': 'M-Pesa',
  'afiax-pay': 'Afiax Pay',
};

export function methodToErpNextModeLabel(method: KenyaPatientPaymentMethod): string {
  return ErpNextModeLabelByMethod[method];
}

async function writeAuditEvent(
  ctx: AuthenticatedRequestContext,
  claim: Claim & { id: string },
  task: (Task & { id: string }) | undefined,
  correlationId: string,
  outcome: AuditEventOutcome
): Promise<void> {
  const auditEvent = createAuditEvent(
    RestfulOperationType,
    OperationInteraction,
    ctx.project.id,
    ctx.profile,
    undefined,
    outcome,
    { description: `Patient payment posted (correlationId: ${correlationId})` }
  );
  auditEvent.entity = [
    ...(auditEvent.entity ?? []),
    { what: createReference(claim) },
    ...(task ? [{ what: createReference(task) }] : []),
  ];
  const saved = await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
  logAuditEvent(saved);
}
