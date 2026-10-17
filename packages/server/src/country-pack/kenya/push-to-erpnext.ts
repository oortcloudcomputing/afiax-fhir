// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Idempotent ERPNext sync retry for a Claim. Can be called any time to bring
// ERPNext in sync with the current FHIR state. Safe to call repeatedly.
import type { KenyaErpNextModeOfPayment, KenyaErpNextPayerType, KenyaErpNextSubmissionSnapshot } from '@medplum/core';
import {
  addPaymentToErpNextSnapshot,
  buildKenyaErpNextPatientExtension,
  buildKenyaErpNextSubmissionExtension,
  getKenyaErpNextPatientSnapshot,
  getKenyaErpNextSubmissionSnapshot,
  getKenyaInsuranceType,
  getKenyaPatientPaymentSnapshot,
  KenyaClientRegistryIdSystem,
  normalizeErrorString,
  Operator,
} from '@medplum/core';
import type { Bundle, Claim, ClaimResponse, Organization, Patient, PaymentNotice, Project } from '@medplum/fhirtypes';
import type { Repository } from '../../fhir/repo';
import { globalLogger } from '../../logger';
import type { KenyaErpNextCredentials } from './erpnext';
import {
  createErpNextPaymentEntry,
  createErpNextSalesInvoice,
  ensureErpNextCustomer,
  getKenyaErpNextCredentials,
  hasKenyaErpNextCredentials,
} from './erpnext';
import { methodToErpNextMode, methodToErpNextModeLabel } from './post-patient-payment';

const ShaErpNextCustomerName = 'SHA - Social Health Authority';

export interface PushToErpNextResult {
  readonly status: 'synced' | 'partial' | 'skipped' | 'error';
  readonly invoiceSynced: boolean;
  readonly paymentsSynced: number;
  readonly paymentsFailed: number;
  readonly patientDue?: number;
  readonly message: string;
}

export async function handlePushToErpNext(
  systemRepo: Repository,
  claim: Claim & { id: string },
  project: Project & { id: string }
): Promise<PushToErpNextResult> {
  if (!hasKenyaErpNextCredentials(project)) {
    return {
      status: 'skipped',
      invoiceSynced: false,
      paymentsSynced: 0,
      paymentsFailed: 0,
      message: 'ERPNext not configured for this project.',
    };
  }

  const credentials = getKenyaErpNextCredentials(project);
  let currentClaim = claim;
  let invoiceSynced = false;
  let paymentsSynced = 0;
  let paymentsFailed = 0;

  // -----------------------------------------------------------------------
  // 1. Ensure Sales Invoice exists
  // -----------------------------------------------------------------------
  let snapshot = getKenyaErpNextSubmissionSnapshot(currentClaim) ?? {};

  if (!snapshot.invoiceName) {
    try {
      const patientName = await resolveOrCreateErpNextCustomer(systemRepo, credentials, currentClaim);
      const currency = currentClaim.total?.currency ?? 'KES';
      const invoice = await createErpNextSalesInvoice(credentials, currentClaim, patientName, currency);
      snapshot = {
        ...snapshot,
        invoiceName: invoice.invoiceName,
        invoiceTotal: currentClaim.total?.value ?? 0,
        currency,
        status: 'invoice-created',
        totalConfirmed: snapshot.totalConfirmed ?? 0,
        patientDue: (currentClaim.total?.value ?? 0) - (snapshot.totalConfirmed ?? 0),
        syncedAt: new Date().toISOString(),
        message: `ERPNext Sales Invoice ${invoice.invoiceName} created.`,
      };
      currentClaim = await persistSnapshot(systemRepo, currentClaim, snapshot);
      invoiceSynced = true;
    } catch (err) {
      return {
        status: 'error',
        invoiceSynced: false,
        paymentsSynced: 0,
        paymentsFailed: 1,
        message: `ERPNext invoice creation failed: ${normalizeErrorString(err)}`,
      };
    }
  }

  // -----------------------------------------------------------------------
  // 2. Sync any payments that are missing a paymentEntryName
  // -----------------------------------------------------------------------

  // Step 1 either found or created the invoice; this guard only narrows the type.
  const invoiceName = snapshot.invoiceName;
  if (!invoiceName) {
    return {
      status: 'error',
      invoiceSynced,
      paymentsSynced: 0,
      paymentsFailed: 0,
      message: 'ERPNext invoice is missing.',
    };
  }

  // Collect payment sources: ClaimResponses (insurer) and PaymentNotices (patient).
  const missingPayments = await collectMissingPayments(systemRepo, currentClaim, snapshot);

  for (const mp of missingPayments) {
    try {
      const entry = await createErpNextPaymentEntry(credentials, {
        invoiceName,
        amount: mp.amount,
        currency: mp.currency,
        modeOfPayment: mp.erpNextModeLabel,
        partyName: mp.partyName,
        customFields: mp.customFields,
      });

      snapshot = addPaymentToErpNextSnapshot(snapshot, {
        payerType: mp.payerType,
        payerName: mp.partyName,
        paymentEntryName: entry.paymentEntryName,
        amount: mp.amount,
        currency: mp.currency,
        modeOfPayment: mp.mode,
        confirmedAt: new Date().toISOString(),
        patientPaymentStatus: 'confirmed',
      });
      currentClaim = await persistSnapshot(systemRepo, currentClaim, snapshot);
      paymentsSynced++;
    } catch (err) {
      globalLogger.warn('push-to-erpnext: payment entry failed', {
        claimId: claim.id,
        partyName: mp.partyName,
        error: normalizeErrorString(err),
      });
      paymentsFailed++;
    }
  }

  const status = paymentsFailed > 0 ? 'partial' : 'synced';
  return {
    status,
    invoiceSynced,
    paymentsSynced,
    paymentsFailed,
    patientDue: snapshot.patientDue,
    message:
      status === 'synced'
        ? `ERPNext sync complete. ${invoiceSynced ? 'Invoice created. ' : ''}${paymentsSynced} payment(s) posted. Patient due: ${snapshot.currency ?? 'KES'} ${snapshot.patientDue ?? 'unknown'}.`
        : `ERPNext partial sync: ${paymentsSynced} succeeded, ${paymentsFailed} failed. Check logs.`,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MissingPayment {
  readonly payerType: KenyaErpNextPayerType;
  readonly partyName: string;
  readonly amount: number;
  readonly currency: string;
  readonly mode: KenyaErpNextModeOfPayment;
  readonly erpNextModeLabel: string;
  readonly customFields?: Record<string, string | undefined>;
}

async function collectMissingPayments(
  systemRepo: Repository,
  claim: Claim & { id: string },
  snapshot: KenyaErpNextSubmissionSnapshot
): Promise<MissingPayment[]> {
  const result: MissingPayment[] = [];
  const currency = snapshot.currency ?? claim.total?.currency ?? 'KES';
  const alreadyPostedEntries = new Set((snapshot.payments ?? []).map((p) => p.paymentEntryName).filter(Boolean));

  // ClaimResponses (SHA auto + private insurer manual payments).
  let claimResponses: ClaimResponse[] = [];
  try {
    const crBundle = (await systemRepo.search<ClaimResponse>({
      resourceType: 'ClaimResponse',
      filters: [{ code: 'request', operator: Operator.EQUALS, value: `Claim/${claim.id}` }],
      count: 50,
    })) as Bundle<ClaimResponse>;
    claimResponses = (crBundle.entry ?? []).map((e) => e.resource).filter((r): r is ClaimResponse => !!r);
  } catch {
    // not fatal
  }

  for (const cr of claimResponses) {
    const amount = cr.payment?.amount?.value;
    if (!amount || amount <= 0) {
      continue;
    }
    const crCurrency = cr.payment?.amount?.currency ?? currency;

    // Determine if this is SHA or a private insurer.
    const insurer = cr.insurer?.reference?.startsWith('Organization/')
      ? await tryReadOrganization(systemRepo, cr.insurer.reference.replace('Organization/', ''))
      : undefined;
    const insuranceType = insurer ? getKenyaInsuranceType(insurer) : undefined;
    const isSha = !insurer || insuranceType === 'sha';

    const partyName = isSha ? ShaErpNextCustomerName : (insurer?.name ?? 'Unknown Insurer');

    // Skip if already posted — match by ClaimResponse FHIR ID in customFields of existing payment.
    const alreadyPosted = (snapshot.payments ?? []).some(
      (p) =>
        p.paymentEntryName &&
        alreadyPostedEntries.has(p.paymentEntryName) &&
        p.payerName === partyName &&
        p.amount === amount
    );
    if (alreadyPosted) {
      continue;
    }

    // Check if we already tracked this specific CR.
    const trackedByCrId = (snapshot.payments ?? []).some(
      (p) => p.paymentEntryName && p.amount === amount && p.payerName === partyName
    );
    if (trackedByCrId) {
      continue;
    }

    const insurerPayerType = insuranceType && insuranceType !== 'private-manual' ? insuranceType : 'other';
    result.push({
      payerType: isSha ? 'sha' : insurerPayerType,
      partyName,
      amount,
      currency: crCurrency,
      mode: isSha ? 'sha-claims' : 'private-insurance',
      erpNextModeLabel: isSha ? 'SHA Claims' : 'Insurance Claims',
      customFields: {
        custom_fhir_claim_id: `Claim/${claim.id}`,
        custom_fhir_claim_response_id: `ClaimResponse/${cr.id}`,
      },
    });
  }

  // PaymentNotices (patient payments — only confirmed ones without an ERPNext entry yet).
  let notices: PaymentNotice[] = [];
  try {
    const noticeBundle = (await systemRepo.search<PaymentNotice>({
      resourceType: 'PaymentNotice',
      filters: [{ code: 'request', operator: Operator.EQUALS, value: `Claim/${claim.id}` }],
      count: 50,
    })) as Bundle<PaymentNotice>;
    notices = (noticeBundle.entry ?? []).map((e) => e.resource).filter((r): r is PaymentNotice => !!r);
  } catch {
    // not fatal
  }

  for (const notice of notices) {
    const paymentSnap = getKenyaPatientPaymentSnapshot(notice);
    if (!paymentSnap) {
      continue;
    }
    if (paymentSnap.paymentStatus !== 'confirmed') {
      continue;
    }
    if (paymentSnap.paymentEntryName) {
      continue;
    } // already has an ERPNext entry

    const amount = paymentSnap.amount ?? notice.amount?.value;
    if (!amount || amount <= 0) {
      continue;
    }

    const noticeCurrency = paymentSnap.currency ?? notice.amount?.currency ?? currency;
    const patientName = await resolvePatientNameFromClaim(systemRepo, claim);
    const method = paymentSnap.method ?? 'cash';

    result.push({
      payerType: 'patient',
      partyName: patientName,
      amount,
      currency: noticeCurrency,
      mode: methodToErpNextMode(method),
      erpNextModeLabel: methodToErpNextModeLabel(method),
      customFields: {
        custom_fhir_claim_id: `Claim/${claim.id}`,
        custom_payment_notice_id: `PaymentNotice/${notice.id}`,
        ...(paymentSnap.transactionRef ? { custom_transaction_ref: paymentSnap.transactionRef } : {}),
      },
    });
  }

  return result;
}

async function resolveOrCreateErpNextCustomer(
  systemRepo: Repository,
  credentials: KenyaErpNextCredentials,
  claim: Claim & { id: string }
): Promise<string> {
  if (!claim.patient?.reference) {
    return `Claim/${claim.id}`;
  }
  try {
    const patient = await systemRepo.readReference<Patient>(claim.patient);
    const existing = getKenyaErpNextPatientSnapshot(patient as Patient);
    if (existing?.customerName) {
      return existing.customerName;
    }
    const clientRegistryId = (patient as Patient).identifier?.find(
      (id) => id.system === KenyaClientRegistryIdSystem
    )?.value;
    const result = await ensureErpNextCustomer(credentials, patient as Patient & { id: string }, clientRegistryId);
    if (result.created && (patient as Patient).id) {
      const patientExt = buildKenyaErpNextPatientExtension({
        customerName: result.customerName,
        syncedAt: new Date().toISOString(),
        status: 'synced',
      });
      const otherExts = ((patient as Patient).extension ?? []).filter((e) => e.url !== patientExt.url);
      await systemRepo.updateResource<Patient>({
        ...(patient as Patient),
        extension: [...otherExts, patientExt],
      });
    }
    return result.customerName;
  } catch {
    return `Claim/${claim.id}`;
  }
}

async function resolvePatientNameFromClaim(systemRepo: Repository, claim: Claim & { id: string }): Promise<string> {
  if (!claim.patient?.reference) {
    return `Claim/${claim.id}`;
  }
  try {
    const patient = await systemRepo.readReference<Patient>(claim.patient);
    const snap = getKenyaErpNextPatientSnapshot(patient as Patient);
    if (snap?.customerName) {
      return snap.customerName;
    }
    const name = (patient as Patient).name?.[0];
    if (name) {
      return [...(name.given ?? []), name.family].filter(Boolean).join(' ');
    }
  } catch {
    // fall through
  }
  return `Claim/${claim.id}`;
}

async function tryReadOrganization(systemRepo: Repository, id: string): Promise<Organization | undefined> {
  try {
    return await systemRepo.readResource<Organization>('Organization', id);
  } catch {
    return undefined;
  }
}

async function persistSnapshot(
  systemRepo: Repository,
  claim: Claim & { id: string },
  snapshot: KenyaErpNextSubmissionSnapshot
): Promise<Claim & { id: string }> {
  const ext = buildKenyaErpNextSubmissionExtension(snapshot);
  const otherExts = (claim.extension ?? []).filter((e) => e.url !== ext.url);
  return systemRepo.updateResource<Claim>({ ...claim, extension: [...otherExts, ext] }) as Promise<
    Claim & { id: string }
  >;
}
