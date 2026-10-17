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
import type { AfiaxPayPaymentRequestState } from './afiax-pay';
import {
  getAfiaxPayPaymentRequest,
  getKenyaAfiaxPayCredentials,
  hasKenyaAfiaxPayCredentials,
  parseAfiaxPayCallback,
} from './afiax-pay';
import { createErpNextPaymentEntry, getKenyaErpNextCredentials, hasKenyaErpNextCredentials } from './erpnext';
import { AfiaxPayRequestSystem } from './post-patient-payment';

export interface AfiaxPayCallbackResult {
  readonly ok: boolean;
  readonly projectId: string;
  readonly paymentRequestId?: string;
  readonly status: 'confirmed' | 'failed' | 'cancelled' | 'ignored' | 'error';
  readonly message: string;
}

/**
 * Handles an Afiax Pay payment callback.
 *
 * The endpoint is public, so the callback body is treated only as a notification: the payment request
 * is read back from the Afiax Pay API and that state is used for every update. Callbacks for
 * already-settled payments are ignored.
 * @param projectId - The project the callback URL was issued for.
 * @param body - The raw callback body.
 * @returns The outcome of processing the callback.
 */
export async function handleKenyaAfiaxPayCallback(projectId: string, body: unknown): Promise<AfiaxPayCallbackResult> {
  const globalSystemRepo = getGlobalSystemRepo();

  let project: Project;
  try {
    project = await globalSystemRepo.readResource<Project>('Project', projectId);
  } catch {
    return { ok: false, projectId, status: 'error', message: `Project ${projectId} not found` };
  }

  const payload = parseAfiaxPayCallback(body);
  if (!payload) {
    return { ok: true, projectId, status: 'ignored', message: 'Could not parse Afiax Pay callback body — ignoring' };
  }

  const { paymentRequestId } = payload;

  if (!paymentRequestId) {
    return { ok: true, projectId, status: 'ignored', message: 'No payment_request_id in callback — ignoring' };
  }

  try {
    const systemRepo = getProjectSystemRepo(projectId);

    // Find PaymentNotice by Afiax Pay paymentRequestId identifier.
    const noticeBundle = (await systemRepo.search<PaymentNotice>({
      resourceType: 'PaymentNotice',
      filters: [
        { code: 'identifier', operator: Operator.EXACT, value: `${AfiaxPayRequestSystem}|${paymentRequestId}` },
      ],
      count: 1,
    })) as Bundle<PaymentNotice>;

    const notice = noticeBundle.entry?.[0]?.resource;
    if (!notice?.id) {
      return {
        ok: true,
        projectId,
        paymentRequestId,
        status: 'ignored',
        message: `No PaymentNotice found for Afiax Pay request ${paymentRequestId}`,
      };
    }

    const paymentSnap = getKenyaPatientPaymentSnapshot(notice);
    if (paymentSnap?.paymentStatus === 'confirmed' || paymentSnap?.paymentStatus === 'failed') {
      return {
        ok: true,
        projectId,
        paymentRequestId,
        status: 'ignored',
        message: `Payment already ${paymentSnap.paymentStatus} — ignoring duplicate callback`,
      };
    }

    if (!hasKenyaAfiaxPayCredentials(project)) {
      return {
        ok: false,
        projectId,
        paymentRequestId,
        status: 'error',
        message: 'Afiax Pay credentials not configured — cannot verify callback',
      };
    }

    let verified: AfiaxPayPaymentRequestState;
    try {
      const credentials = getKenyaAfiaxPayCredentials(project, getConfig().baseUrl.replace(/\/+$/, ''), projectId);
      verified = await getAfiaxPayPaymentRequest(credentials, paymentRequestId);
    } catch (err) {
      globalLogger.warn('Afiax Pay callback: could not verify payment request', {
        projectId,
        paymentRequestId,
        error: normalizeErrorString(err),
      });
      return {
        ok: false,
        projectId,
        paymentRequestId,
        status: 'error',
        message: `Could not verify Afiax Pay payment: ${normalizeErrorString(err)}`,
      };
    }

    if (verified.status === 'pending') {
      return {
        ok: true,
        projectId,
        paymentRequestId,
        status: 'ignored',
        message: 'Afiax Pay reports payment still pending — ignoring callback',
      };
    }
    if (verified.status !== payload.status) {
      globalLogger.warn('Afiax Pay callback status disagrees with API — using API status', {
        projectId,
        paymentRequestId,
        callbackStatus: payload.status,
        verifiedStatus: verified.status,
      });
    }

    const { status: payStatus, transactionRef, amount, currency: payCurrency, paidAt, failureReason } = verified;
    const paymentSuccess = payStatus === 'success';
    const paymentCancelled = payStatus === 'cancelled';
    const confirmedAt = paidAt ?? new Date().toISOString();
    const expectedAmount = paymentSnap?.amount ?? notice.amount?.value ?? 0;
    const paidAmount = amount ?? expectedAmount;
    if (paymentSuccess && paidAmount !== expectedAmount) {
      globalLogger.warn('Afiax Pay paid amount differs from requested amount', {
        projectId,
        paymentRequestId,
        paidAmount,
        expectedAmount,
      });
    }
    const paidCurrency = payCurrency ?? paymentSnap?.currency ?? 'KES';

    // Update PaymentNotice extension.
    const updatedExt = buildKenyaPatientPaymentExtension({
      ...(paymentSnap ?? {}),
      method: 'afiax-pay',
      paymentStatus: paymentSuccess ? 'confirmed' : 'failed',
      amount: paidAmount,
      currency: paidCurrency,
      gatewayReference: paymentRequestId,
      transactionRef,
      confirmedAt: paymentSuccess ? confirmedAt : undefined,
      failureReason: paymentSuccess ? undefined : (failureReason ?? payStatus),
    });
    const otherExts = (notice.extension ?? []).filter((e) => e.url !== updatedExt.url);
    await systemRepo.updateResource<PaymentNotice>({
      ...notice,
      extension: [...otherExts, updatedExt],
      paymentDate: paymentSuccess ? confirmedAt.slice(0, 10) : notice.paymentDate,
    });

    if (!paymentSuccess) {
      const resultStatus = paymentCancelled ? 'cancelled' : 'failed';
      globalLogger.info('Afiax Pay payment not confirmed', { projectId, paymentRequestId, payStatus, failureReason });
      return {
        ok: true,
        projectId,
        paymentRequestId,
        status: resultStatus,
        message: failureReason ?? `Payment ${payStatus}`,
      };
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
            modeOfPayment: 'Afiax Pay',
            partyName: patientName,
            customFields: {
              custom_fhir_claim_id: `Claim/${claimId}`,
              custom_afiax_pay_ref: transactionRef,
              custom_payment_notice_id: `PaymentNotice/${notice.id}`,
            },
          });

          const updatedSnapshot = addPaymentToErpNextSnapshot(snapshot, {
            payerType: 'patient',
            payerName: patientName,
            paymentEntryName: entry.paymentEntryName,
            amount: paidAmount,
            currency: paidCurrency,
            modeOfPayment: 'afiax-pay',
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
        globalLogger.warn('Afiax Pay callback: ERPNext sync failed (non-blocking)', {
          projectId,
          paymentRequestId,
          claimId,
          error: normalizeErrorString(err),
        });
      }
    }

    await completeRelatedTask(
      systemRepo,
      projectId,
      notice as PaymentNotice & { id: string },
      'confirmed',
      `Afiax Pay payment confirmed. Reference: ${transactionRef ?? paymentRequestId}`
    );

    globalLogger.info('Afiax Pay callback processed — payment confirmed', {
      projectId,
      paymentRequestId,
      transactionRef,
    });

    return {
      ok: true,
      projectId,
      paymentRequestId,
      status: 'confirmed',
      message: `Payment confirmed. Reference: ${transactionRef ?? paymentRequestId}`,
    };
  } catch (err) {
    globalLogger.error('Afiax Pay callback processing failed', {
      projectId,
      paymentRequestId,
      error: normalizeErrorString(err),
    });
    return { ok: false, projectId, paymentRequestId, status: 'error', message: normalizeErrorString(err) };
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
        { code: 'code', operator: Operator.EQUALS, value: 'patient-payment-afiax-pay' },
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
        output: [...(task.output ?? []), { type: { text: 'afiax-pay-callback' }, valueString: message }],
      });
    }
  } catch (err) {
    globalLogger.warn('Afiax Pay callback: failed to update Task', { projectId, error: normalizeErrorString(err) });
  }
}
