// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Fire-and-forget ERPNext sync helpers called from claim submit and status handlers.
// Errors are logged but never propagate — ERPNext sync must not block or fail FHIR operations.
import {
  addPaymentToErpNextSnapshot,
  buildKenyaErpNextPatientExtension,
  buildKenyaErpNextSubmissionExtension,
  getKenyaErpNextPatientSnapshot,
  getKenyaErpNextSubmissionSnapshot,
  KenyaClientRegistryIdSystem,
  normalizeErrorString,
} from '@medplum/core';
import type { Claim, ClaimResponse, Patient, Project } from '@medplum/fhirtypes';
import type { Repository } from '../../fhir/repo';
import { globalLogger } from '../../logger';
import {
  createErpNextPaymentEntry,
  createErpNextSalesInvoice,
  ensureErpNextCustomer,
  getKenyaErpNextCredentials,
  hasKenyaErpNextCredentials,
} from './erpnext';

const ShaErpNextCustomerName = 'SHA - Social Health Authority';

// ---------------------------------------------------------------------------
// Invoice sync — called from submit-national-claim after bundle preparation
// ---------------------------------------------------------------------------

export async function syncErpNextInvoice(
  systemRepo: Repository,
  claim: Claim & { id: string },
  project: Project & { id: string }
): Promise<void> {
  if (!hasKenyaErpNextCredentials(project)) {
    return;
  }

  const credentials = getKenyaErpNextCredentials(project);
  const claimTotal = claim.total?.value ?? 0;
  const currency = claim.total?.currency ?? 'KES';

  try {
    // Resolve patient and ensure ERPNext Customer exists.
    let customerName: string;
    if (claim.patient?.reference) {
      const patient = await systemRepo.readReference<Patient>(claim.patient);
      const existing = patient.id ? getKenyaErpNextPatientSnapshot(patient as Patient) : undefined;

      if (existing?.customerName) {
        customerName = existing.customerName;
      } else {
        const clientRegistryId = (patient as Patient).identifier?.find(
          (id) => id.system === KenyaClientRegistryIdSystem
        )?.value;
        const result = await ensureErpNextCustomer(
          credentials,
          patient as Patient & { id: string },
          clientRegistryId
        );
        customerName = result.customerName;

        // Persist the customer name on the Patient so future calls skip the ERPNext search.
        if (result.created && patient.id) {
          const patientExt = buildKenyaErpNextPatientExtension({
            customerName: result.customerName,
            syncedAt: new Date().toISOString(),
            status: 'synced',
          });
          const otherExts = (patient.extension ?? []).filter((e) => e.url !== patientExt.url);
          await systemRepo.updateResource<Patient>({
            ...(patient as Patient),
            extension: [...otherExts, patientExt],
          });
        }
      }
    } else {
      customerName = `Claim/${claim.id}`;
    }

    const invoice = await createErpNextSalesInvoice(credentials, claim, customerName, currency);

    const snapshot = getKenyaErpNextSubmissionSnapshot(claim) ?? {};
    const updated = buildKenyaErpNextSubmissionExtension({
      ...snapshot,
      invoiceName: invoice.invoiceName,
      invoiceTotal: claimTotal,
      currency,
      status: 'invoice-created',
      totalConfirmed: snapshot.totalConfirmed ?? 0,
      patientDue: claimTotal - (snapshot.totalConfirmed ?? 0),
      syncedAt: new Date().toISOString(),
      message: `ERPNext Sales Invoice ${invoice.invoiceName} created.`,
    });

    const otherExts = (claim.extension ?? []).filter((e) => e.url !== updated.url);
    await systemRepo.updateResource<Claim>({
      ...claim,
      extension: [...otherExts, updated],
    });

    globalLogger.info('ERPNext invoice synced', { claimId: claim.id, invoiceName: invoice.invoiceName });
  } catch (err) {
    globalLogger.warn('ERPNext invoice sync failed (non-blocking)', {
      claimId: claim.id,
      error: normalizeErrorString(err),
    });
  }
}

// ---------------------------------------------------------------------------
// SHA payment sync — called from check-national-claim-status and SHA callback
// when claimState reaches adjudicated
// ---------------------------------------------------------------------------

export async function syncErpNextShaPayment(
  systemRepo: Repository,
  claim: Claim & { id: string },
  claimResponse: ClaimResponse | undefined,
  project: Project & { id: string }
): Promise<void> {
  if (!hasKenyaErpNextCredentials(project)) {
    return;
  }

  const snapshot = getKenyaErpNextSubmissionSnapshot(claim);
  if (!snapshot?.invoiceName) {
    // Invoice was never created — attempt to create it now then retry payment.
    globalLogger.warn('ERPNext SHA payment skipped — no invoice found on Claim', { claimId: claim.id });
    return;
  }

  // Avoid duplicate payment entries: if a SHA payment is already recorded, skip.
  const alreadyPosted = snapshot.payments?.some((p) => p.payerType === 'sha' && p.paymentEntryName);
  if (alreadyPosted) {
    return;
  }

  const shaAmount =
    claimResponse?.payment?.amount?.value ??
    claimResponse?.total?.find((t) => t.category?.coding?.[0]?.code === 'benefit')?.amount?.value ??
    claim.total?.value ??
    0;

  const currency = claimResponse?.payment?.amount?.currency ?? claim.total?.currency ?? 'KES';

  if (shaAmount <= 0) {
    globalLogger.warn('ERPNext SHA payment skipped — SHA amount is zero', { claimId: claim.id });
    return;
  }

  const credentials = getKenyaErpNextCredentials(project);

  try {
    const paymentEntry = await createErpNextPaymentEntry(credentials, {
      invoiceName: snapshot.invoiceName,
      amount: shaAmount,
      currency,
      modeOfPayment: 'SHA Claims',
      partyName: ShaErpNextCustomerName,
      customFields: {
        custom_sha_claim_state: 'approved',
        custom_fhir_claim_response_id: claimResponse?.id ? `ClaimResponse/${claimResponse.id}` : undefined,
        custom_fhir_claim_id: `Claim/${claim.id}`,
      },
    });

    const updatedSnapshot = addPaymentToErpNextSnapshot(snapshot, {
      payerType: 'sha',
      payerName: ShaErpNextCustomerName,
      paymentEntryName: paymentEntry.paymentEntryName,
      amount: shaAmount,
      currency,
      modeOfPayment: 'sha-claims',
      confirmedAt: new Date().toISOString(),
    });

    const ext = buildKenyaErpNextSubmissionExtension(updatedSnapshot);
    const otherExts = (claim.extension ?? []).filter((e) => e.url !== ext.url);
    await systemRepo.updateResource<Claim>({
      ...claim,
      extension: [...otherExts, ext],
    });

    globalLogger.info('ERPNext SHA payment posted', {
      claimId: claim.id,
      paymentEntryName: paymentEntry.paymentEntryName,
      amount: shaAmount,
    });
  } catch (err) {
    globalLogger.warn('ERPNext SHA payment sync failed (non-blocking)', {
      claimId: claim.id,
      error: normalizeErrorString(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Expose the SHA customer name for callers that need it (e.g. push-to-erpnext)
// ---------------------------------------------------------------------------

export { ShaErpNextCustomerName };

// Helper used in post-patient-payment and record-insurance-payment to update
// the Claim ERPNext snapshot after any payment is confirmed.
export async function persistErpNextSnapshot(
  systemRepo: Repository,
  claim: Claim & { id: string },
  snapshot: ReturnType<typeof getKenyaErpNextSubmissionSnapshot>
): Promise<void> {
  if (!snapshot) {
    return;
  }
  const ext = buildKenyaErpNextSubmissionExtension(snapshot);
  const otherExts = (claim.extension ?? []).filter((e) => e.url !== ext.url);
  await systemRepo.updateResource<Claim>({
    ...claim,
    extension: [...otherExts, ext],
  });
}

// Re-export so callers only need one import for all ERPNext-related functionality.
export {
  createErpNextPaymentEntry,
  createErpNextSalesInvoice,
  ensureErpNextCustomer,
  getKenyaErpNextCredentials,
  hasKenyaErpNextCredentials,
} from './erpnext';
