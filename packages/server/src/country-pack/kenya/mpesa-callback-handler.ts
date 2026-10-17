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
import type { Bundle, Claim, Patient, PaymentNotice, Project, Task } from '@medplum/fhirtypes';
import { getConfig } from '../../config/loader';
import type { SystemRepository } from '../../fhir/repo';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../../fhir/repo';
import { globalLogger } from '../../logger';
import { createErpNextPaymentEntry, getKenyaErpNextCredentials, hasKenyaErpNextCredentials } from './erpnext';
import type { MpesaStkQueryResult } from './mpesa';
import {
  getKenyaMpesaCredentials,
  hasKenyaMpesaCredentials,
  parseMpesaCallback,
  queryMpesaStkPushStatus,
} from './mpesa';
import { MpesaCheckoutRequestSystem } from './post-patient-payment';

export interface MpesaCallbackResult {
  readonly ok: boolean;
  readonly projectId: string;
  readonly checkoutRequestId?: string;
  readonly status: 'confirmed' | 'failed' | 'ignored' | 'error';
  readonly message: string;
}

/**
 * Handles a Daraja STK push callback.
 *
 * Daraja callbacks are unsigned and the endpoint is public, so the callback body is treated only as a
 * notification: the result is confirmed with Daraja's STK Push Query API before any state changes, the
 * amount comes from the original payment request, and callbacks for already-settled payments are ignored.
 * @param projectId - The project the callback URL was issued for.
 * @param body - The raw callback body.
 * @returns The outcome of processing the callback.
 */
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

    const paymentSnap = getKenyaPatientPaymentSnapshot(notice);
    if (paymentSnap?.paymentStatus === 'confirmed' || paymentSnap?.paymentStatus === 'failed') {
      return {
        ok: true,
        projectId,
        checkoutRequestId,
        status: 'ignored',
        message: `Payment already ${paymentSnap.paymentStatus} — ignoring duplicate callback`,
      };
    }

    if (!hasKenyaMpesaCredentials(project)) {
      return {
        ok: false,
        projectId,
        checkoutRequestId,
        status: 'error',
        message: 'M-Pesa credentials not configured — cannot verify callback',
      };
    }

    let verified: MpesaStkQueryResult;
    try {
      const credentials = getKenyaMpesaCredentials(project, getConfig().baseUrl.replace(/\/+$/, ''), projectId);
      verified = await queryMpesaStkPushStatus(credentials, checkoutRequestId);
    } catch (err) {
      globalLogger.warn('M-Pesa callback: could not verify payment with Daraja', {
        projectId,
        checkoutRequestId,
        error: normalizeErrorString(err),
      });
      return {
        ok: false,
        projectId,
        checkoutRequestId,
        status: 'error',
        message: `Could not verify M-Pesa payment with Daraja: ${normalizeErrorString(err)}`,
      };
    }

    if (verified.resultCode !== resultCode) {
      globalLogger.warn('M-Pesa callback result disagrees with Daraja query — using Daraja result', {
        projectId,
        checkoutRequestId,
        callbackResultCode: resultCode,
        verifiedResultCode: verified.resultCode,
      });
    }

    // The STK push amount is fixed when the request is created, so the expected amount is authoritative.
    const expectedAmount = paymentSnap?.amount ?? notice.amount?.value ?? 0;
    if (amount !== undefined && amount !== expectedAmount) {
      globalLogger.warn('M-Pesa callback amount differs from requested amount — using requested amount', {
        projectId,
        checkoutRequestId,
        callbackAmount: amount,
        expectedAmount,
      });
    }

    const paymentSuccess = verified.resultCode === 0;
    const failureDesc = verified.resultDesc || resultDesc;
    const confirmedAt = new Date().toISOString();
    const paidAmount = expectedAmount;
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
      failureReason: paymentSuccess ? undefined : failureDesc,
    });
    const otherExts = (notice.extension ?? []).filter((e) => e.url !== updatedExt.url);
    await systemRepo.updateResource<PaymentNotice>({
      ...notice,
      extension: [...otherExts, updatedExt],
      paymentDate: paymentSuccess ? confirmedAt.slice(0, 10) : notice.paymentDate,
    });

    if (!paymentSuccess) {
      globalLogger.info('M-Pesa STK push payment failed', {
        projectId,
        checkoutRequestId,
        resultCode: verified.resultCode,
        resultDesc: failureDesc,
      });
      return { ok: true, projectId, checkoutRequestId, status: 'failed', message: failureDesc };
    }

    // Payment confirmed — create ERPNext Payment Entry and update Claim snapshot.
    if (notice.request?.reference?.startsWith('Claim/')) {
      const claimId = notice.request.reference.replace('Claim/', '');
      try {
        let claim = (await systemRepo.readResource<Claim>('Claim', claimId)) as Claim & { id: string };
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
          claim = (await systemRepo.updateResource<Claim>({
            ...claim,
            extension: [...otherClaimExts, ext],
          })) as Claim & { id: string };
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
    await completeRelatedTask(
      systemRepo,
      projectId,
      notice as PaymentNotice & { id: string },
      'confirmed',
      `M-Pesa payment confirmed. Receipt: ${mpesaReceiptNumber ?? checkoutRequestId}`
    );

    globalLogger.info('M-Pesa callback processed — payment confirmed', {
      projectId,
      checkoutRequestId,
      mpesaReceiptNumber,
    });

    return {
      ok: true,
      projectId,
      checkoutRequestId,
      status: 'confirmed',
      message: `Payment confirmed. Receipt: ${mpesaReceiptNumber ?? checkoutRequestId}`,
    };
  } catch (err) {
    globalLogger.error('M-Pesa callback processing failed', {
      projectId,
      checkoutRequestId,
      error: normalizeErrorString(err),
    });
    return { ok: false, projectId, checkoutRequestId, status: 'error', message: normalizeErrorString(err) };
  }
}

async function resolvePatientName(systemRepo: SystemRepository, claim: Claim & { id: string }): Promise<string> {
  if (!claim.patient?.reference) {
    return `Claim/${claim.id}`;
  }
  try {
    const { getKenyaErpNextPatientSnapshot } = await import('@medplum/core');
    const patient = await systemRepo.readReference(claim.patient);
    const snap = getKenyaErpNextPatientSnapshot(patient as Patient);
    if (snap?.customerName) {
      return snap.customerName;
    }
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
      if (!task?.id) {
        continue;
      }
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
