// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  addPaymentToErpNextSnapshot,
  buildKenyaErpNextSubmissionExtension,
  buildKenyaPatientPaymentExtension,
  getKenyaErpNextSubmissionSnapshot,
  getKenyaPatientPaymentSnapshot,
  normalizeErrorString,
  Operator,
} from '@medplum/core';
import type { Bundle, Claim, PaymentNotice, Project, Task } from '@medplum/fhirtypes';
import { getGlobalSystemRepo, getProjectSystemRepo, SystemRepository } from '../../fhir/repo';
import { globalLogger } from '../../logger';
import { createErpNextPaymentEntry, getKenyaErpNextCredentials, hasKenyaErpNextCredentials } from './erpnext';
import { MpesaCheckoutRequestSystem } from './post-patient-payment';
import { parseMpesaCallback } from './mpesa';

export interface MpesaCallbackResult {
  readonly ok: boolean;
  readonly projectId: string;
  readonly checkoutRequestId?: string;
  readonly status: 'confirmed' | 'failed' | 'ignored' | 'error';
  readonly message: string;
}

export async function handleKenyaMpesaCallback(projectId: string, body: unknown): Promise<MpesaCallbackResult> {
  const globalSystemRepo = getGlobalSystemRepo();

  let project: Project;
  try {
    project = await globalSystemRepo.readResource<Project>('Project', projectId);
  } catch {
    return { ok: false, projectId, status: 'error', message: `Project ${projectId} not found` };
  }

  const payload = parseMpesaCallback(body);
  if (!payload) {
    return { ok: true, projectId, status: 'ignored', message: 'Could not parse M-Pesa callback body — ignoring' };
  }

  const { checkoutRequestId, resultCode, resultDesc, mpesaReceiptNumber, amount } = payload;

  if (!checkoutRequestId) {
    return { ok: true, projectId, status: 'ignored', message: 'No CheckoutRequestID in callback — ignoring' };
  }

  try {
    const systemRepo = getProjectSystemRepo(projectId);

    // Find PaymentNotice by M-Pesa checkoutRequestId identifier.
    const noticeBundle = (await systemRepo.search<PaymentNotice>({
      resourceType: 'PaymentNotice',
      filters: [
        { code: 'identifier', operator: Operator.EXACT, value: `${MpesaCheckoutRequestSystem}|${checkoutRequestId}` },
      ],
      count: 1,
    })) as Bundle<PaymentNotice>;

    const notice = noticeBundle.entry?.[0]?.resource;
    if (!notice?.id) {
      return {
        ok: true,
        projectId,
        checkoutRequestId,
        status: 'ignored',
        message: `No PaymentNotice found for M-Pesa checkout ${checkoutRequestId}`,
      };
    }

    const paymentSuccess = resultCode === 0;
    const confirmedAt = new Date().toISOString();
    const paymentSnap = getKenyaPatientPaymentSnapshot(notice);
    const paidAmount = amount ?? paymentSnap?.amount ?? notice.amount?.value ?? 0;
    const paidCurrency = paymentSnap?.currency ?? 'KES';

    // Update PaymentNotice extension to reflect confirmation or failure.
    const updatedExt = buildKenyaPatientPaymentExtension({
      ...(paymentSnap ?? {}),
      method: 'mpesa-stk',
      paymentStatus: paymentSuccess ? 'confirmed' : 'failed',
      amount: paidAmount,
      currency: paidCurrency,
      gatewayReference: checkoutRequestId,
      transactionRef: mpesaReceiptNumber,
      confirmedAt: paymentSuccess ? confirmedAt : undefined,
      failureReason: paymentSuccess ? undefined : resultDesc,
    });
    const otherExts = (notice.extension ?? []).filter((e) => e.url !== updatedExt.url);
    await systemRepo.updateResource<PaymentNotice>({
      ...notice,
      extension: [...otherExts, updatedExt],
      paymentDate: paymentSuccess ? confirmedAt.slice(0, 10) : notice.paymentDate,
    });

    if (!paymentSuccess) {
      globalLogger.info('M-Pesa STK push payment failed', { projectId, checkoutRequestId, resultCode, resultDesc });
      return { ok: true, projectId, checkoutRequestId, status: 'failed', message: resultDesc };
    }

    // Payment confirmed — create ERPNext Payment Entry and update Claim snapshot.
    if (notice.request?.reference?.startsWith('Claim/')) {
      const claimId = notice.request.reference.replace('Claim/', '');
      try {
        let claim = await systemRepo.readResource<Claim>('Claim', claimId) as Claim & { id: string };
        const snapshot = getKenyaErpNextSubmissionSnapshot(claim);

        if (snapshot?.invoiceName && hasKenyaErpNextCredentials(project as Project & { id: string })) {
          const patientName = await resolvePatientName(systemRepo, claim);
          const credentials = getKenyaErpNextCredentials(project as Project & { id: string });
          const entry = await createErpNextPaymentEntry(credentials, {
            invoiceName: snapshot.invoiceName,
            amount: paidAmount,
            currency: paidCurrency,
            modeOfPayment: 'M-Pesa',
            partyName: patientName,
            customFields: {
              custom_fhir_claim_id: `Claim/${claimId}`,
              custom_mpesa_receipt: mpesaReceiptNumber,
              custom_payment_notice_id: `PaymentNotice/${notice.id}`,
            },
          });

          const updatedSnapshot = addPaymentToErpNextSnapshot(snapshot, {
            payerType: 'patient',
            payerName: patientName,
            paymentEntryName: entry.paymentEntryName,
            amount: paidAmount,
            currency: paidCurrency,
            modeOfPayment: 'mpesa',
            confirmedAt,
            patientPaymentStatus: 'confirmed',
          });

          const ext = buildKenyaErpNextSubmissionExtension(updatedSnapshot);
          const otherClaimExts = (claim.extension ?? []).filter((e) => e.url !== ext.url);
          claim = await systemRepo.updateResource<Claim>({ ...claim, extension: [...otherClaimExts, ext] }) as Claim & { id: string };
        }
      } catch (err) {
        globalLogger.warn('M-Pesa callback: ERPNext sync failed (non-blocking)', {
          projectId,
          checkoutRequestId,
          claimId,
          error: normalizeErrorString(err),
        });
      }
    }

    // Complete any in-progress Task for this payment.
    await completeRelatedTask(systemRepo, projectId, notice as PaymentNotice & { id: string }, 'confirmed', `M-Pesa payment confirmed. Receipt: ${mpesaReceiptNumber ?? checkoutRequestId}`);

    globalLogger.info('M-Pesa callback processed — payment confirmed', { projectId, checkoutRequestId, mpesaReceiptNumber });

    return { ok: true, projectId, checkoutRequestId, status: 'confirmed', message: `Payment confirmed. Receipt: ${mpesaReceiptNumber ?? checkoutRequestId}` };
  } catch (err) {
    globalLogger.error('M-Pesa callback processing failed', { projectId, checkoutRequestId, error: normalizeErrorString(err) });
    return { ok: false, projectId, checkoutRequestId, status: 'error', message: normalizeErrorString(err) };
  }
}

async function resolvePatientName(systemRepo: SystemRepository, claim: Claim & { id: string }): Promise<string> {
  if (!claim.patient?.reference) return `Claim/${claim.id}`;
  try {
    const { getKenyaErpNextPatientSnapshot } = await import('@medplum/core');
    const patient = await systemRepo.readReference(claim.patient);
    const snap = getKenyaErpNextPatientSnapshot(patient as import('@medplum/fhirtypes').Patient);
    if (snap?.customerName) return snap.customerName;
  } catch {
    // fall through
  }
  return `Claim/${claim.id}`;
}

async function completeRelatedTask(
  systemRepo: SystemRepository,
  projectId: string,
  notice: PaymentNotice & { id: string },
  statusText: string,
  message: string
): Promise<void> {
  try {
    const taskBundle = (await systemRepo.search<Task>({
      resourceType: 'Task',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: projectId },
        { code: 'focus', operator: Operator.EQUALS, value: notice.request?.reference ?? '' },
        { code: 'status', operator: Operator.EQUALS, value: 'in-progress' },
        { code: 'code', operator: Operator.EQUALS, value: 'patient-payment-mpesa-stk' },
      ],
      count: 5,
    })) as Bundle<Task>;

    for (const entry of taskBundle.entry ?? []) {
      const task = entry.resource;
      if (!task?.id) continue;
      await systemRepo.updateResource<Task>({
        ...task,
        status: 'completed',
        businessStatus: { text: statusText },
        lastModified: new Date().toISOString(),
        output: [...(task.output ?? []), { type: { text: 'mpesa-callback' }, valueString: message }],
      });
    }
  } catch (err) {
    globalLogger.warn('M-Pesa callback: failed to update Task', { projectId, error: normalizeErrorString(err) });
  }
}
