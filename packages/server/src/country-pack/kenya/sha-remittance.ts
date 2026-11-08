// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA remittance: SHA paying the facility for claims made from bills (claim-from-invoice.ts).
//
// DHA's eClaims IG models SHA's payment as a PaymentReconciliation (often one transfer for many
// claims, e.g. a month's claims) announced by a PaymentNotice; SHA's decision on each claim is a
// ClaimResponse, which the SHA callback and status check already store. Here the claims clerk records
// a payment SHA made: SHA's payment reference and date, and the amount paid for each claim. The
// PaymentReconciliation has one detail per claim (request = the Claim, response = its ClaimResponse
// when there is one). The amount SHA has paid so far is kept on each Claim, and a bill becomes
// "balanced" when SHA's payments and the patient's cover it. A claim paid less than claimed stays
// open for the shortfall (resubmission or write-off is a later decision); nothing moves back to the
// patient. Accounting (an ERPNext Payment Entry from the SHA customer per claim) follows from the
// PaymentReconciliation in afiax-services.

import type { WithId } from '@medplum/core';
import { badRequest, createReference, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import type { Claim, ClaimResponse, Invoice, Organization, PaymentNotice, PaymentReconciliation, Reference } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { KenyaClaimInvoiceSystem } from './claim-from-invoice';
import { KenyaInvoiceCurrency } from './invoice';
import { paidOnInvoice } from './invoice-payment';

/** SHA's own reference for a payment (bank or SHA payment number). */
export const KenyaShaPaymentReferenceSystem = 'https://afiax.africa/kenya/identifier/sha-payment-reference';
/** Running total SHA has paid for a claim, kept on the Claim. */
export const KenyaShaPaidExtension = 'https://afiax.africa/fhir/StructureDefinition/kenya-sha-paid';

export interface KenyaShaRemittanceLine {
  readonly claim: Reference<Claim>;
  readonly amount: number;
}

export interface KenyaShaRemittanceInput {
  readonly paymentReference: string;
  /** YYYY-MM-DD. */
  readonly paymentDate: string;
  readonly lines: readonly KenyaShaRemittanceLine[];
}

export interface KenyaShaRemittanceClaimResult {
  readonly claim: WithId<Claim>;
  readonly paid: number;
  /** What SHA still owes on the claim (claimed − paid so far). */
  readonly outstanding: number;
  readonly invoice?: WithId<Invoice>;
}

export interface KenyaShaRemittanceResult {
  readonly reconciliation: WithId<PaymentReconciliation>;
  readonly claims: readonly KenyaShaRemittanceClaimResult[];
}

const toCents = (value: number): number => Math.round(value * 100);
const fromCents = (cents: number): number => cents / 100;

/**
 * What SHA has paid on a claim so far.
 * @param claim - The Claim.
 * @returns The amount, in KES.
 */
export function shaPaidOnClaim(claim: Claim): number {
  return claim.extension?.find((e) => e.url === KenyaShaPaidExtension)?.valueMoney?.value ?? 0;
}

/**
 * Records a payment SHA made for one or more claims.
 * @param ctx - The caller's context; the caller's repository applies its access policies.
 * @param input - SHA's payment reference and date, and the amount per claim.
 * @param now - Clock, for tests.
 * @returns The PaymentReconciliation and, per claim, what is paid and still owed.
 */
export async function recordKenyaShaRemittance(
  ctx: Pick<AuthenticatedRequestContext, 'repo' | 'profile'>,
  input: KenyaShaRemittanceInput,
  now: Date = new Date()
): Promise<KenyaShaRemittanceResult> {
  const paymentReference = input.paymentReference?.trim();
  if (!paymentReference) {
    throw new OperationOutcomeError(badRequest("SHA's payment reference is required"));
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.paymentDate ?? '')) {
    throw new OperationOutcomeError(badRequest('The payment date must be YYYY-MM-DD'));
  }
  if (!input.lines.length) {
    throw new OperationOutcomeError(badRequest('List at least one claim SHA paid'));
  }
  const seen = new Set<string>();
  for (const line of input.lines) {
    const ref = line.claim?.reference ?? '';
    if (!ref.startsWith('Claim/')) {
      throw new OperationOutcomeError(badRequest('Each line must reference a Claim'));
    }
    if (seen.has(ref)) {
      throw new OperationOutcomeError(badRequest(`${ref} is listed twice`));
    }
    seen.add(ref);
    if (!Number.isFinite(line.amount) || toCents(line.amount) <= 0) {
      throw new OperationOutcomeError(badRequest(`${ref}: the amount must be more than zero`));
    }
  }

  return ctx.repo.withTransaction(async () => {
    const duplicate = await ctx.repo.searchOne<PaymentReconciliation>({
      resourceType: 'PaymentReconciliation',
      filters: [{ code: 'identifier', operator: Operator.EQUALS, value: `${KenyaShaPaymentReferenceSystem}|${paymentReference}` }],
    });
    if (duplicate && duplicate.status === 'active') {
      throw new OperationOutcomeError(
        badRequest(`SHA payment ${paymentReference} is already recorded (${getReferenceString(duplicate)})`)
      );
    }

    // Read and check every claim before writing anything
    const claims: WithId<Claim>[] = [];
    let insurer: Reference<Organization> | undefined;
    for (const line of input.lines) {
      const claim = await ctx.repo.readReference<Claim>(line.claim);
      if (claim.status !== 'active' || (claim.use ?? 'claim') !== 'claim') {
        throw new OperationOutcomeError(badRequest(`${getReferenceString(claim)} is not an active claim`));
      }
      if (!claim.identifier?.some((i) => i.system === KenyaClaimInvoiceSystem)) {
        throw new OperationOutcomeError(badRequest(`${getReferenceString(claim)} was not made from a bill`));
      }
      if (insurer && claim.insurer?.reference !== insurer.reference) {
        throw new OperationOutcomeError(badRequest('All claims in one SHA payment must have the same insurer'));
      }
      insurer = claim.insurer as Reference<Organization>;
      const outstandingCents = toCents(claim.total?.value ?? 0) - toCents(shaPaidOnClaim(claim));
      if (toCents(line.amount) > outstandingCents) {
        throw new OperationOutcomeError(
          badRequest(
            `${getReferenceString(claim)}: SHA's payment (KES ${line.amount}) is more than what SHA still owes on it (KES ${fromCents(outstandingCents)})`
          )
        );
      }
      claims.push(claim);
    }

    const responses = new Map<string, WithId<ClaimResponse>>();
    for (const claim of claims) {
      const response = await ctx.repo.searchOne<ClaimResponse>({
        resourceType: 'ClaimResponse',
        filters: [{ code: 'request', operator: Operator.EQUALS, value: getReferenceString(claim) }],
        sortRules: [{ code: '_lastUpdated', descending: true }],
      });
      if (response) {
        responses.set(getReferenceString(claim), response);
      }
    }

    const totalCents = input.lines.reduce((sum, l) => sum + toCents(l.amount), 0);
    const reconciliation = await ctx.repo.createResource<PaymentReconciliation>({
      resourceType: 'PaymentReconciliation',
      identifier: [{ system: KenyaShaPaymentReferenceSystem, value: paymentReference }],
      status: 'active',
      created: now.toISOString(),
      paymentIssuer: insurer,
      requestor: ctx.profile as PaymentReconciliation['requestor'],
      outcome: 'complete',
      disposition: `SHA payment ${paymentReference}`,
      paymentDate: input.paymentDate,
      paymentAmount: { value: fromCents(totalCents), currency: KenyaInvoiceCurrency },
      paymentIdentifier: { system: KenyaShaPaymentReferenceSystem, value: paymentReference },
      detail: input.lines.map((line, i) => {
        const claim = claims[i];
        const response = responses.get(getReferenceString(claim));
        return {
          type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/payment-type', code: 'payment', display: 'Payment' }] },
          request: createReference(claim),
          ...(response ? { response: createReference(response) } : {}),
          date: input.paymentDate,
          amount: { value: line.amount, currency: KenyaInvoiceCurrency },
        };
      }),
    });

    const results: KenyaShaRemittanceClaimResult[] = [];
    for (const [i, claim] of claims.entries()) {
      const paidCents = toCents(shaPaidOnClaim(claim)) + toCents(input.lines[i].amount);
      const updated = await ctx.repo.updateResource<Claim>({
        ...claim,
        extension: [
          ...(claim.extension ?? []).filter((e) => e.url !== KenyaShaPaidExtension),
          { url: KenyaShaPaidExtension, valueMoney: { value: fromCents(paidCents), currency: KenyaInvoiceCurrency } },
        ],
      });
      const outstanding = fromCents(toCents(claim.total?.value ?? 0) - paidCents);
      const invoice = await settleBillIfPaid(ctx, updated);
      results.push({ claim: updated, paid: fromCents(paidCents), outstanding, invoice });
    }
    return { reconciliation, claims: results };
  });
}

/**
 * Marks the claim's bill "balanced" when SHA's payments and the patient's cover it.
 * @param ctx - The caller's context.
 * @param claim - The claim, with its SHA-paid total updated.
 * @returns The bill, if it was found.
 */
async function settleBillIfPaid(
  ctx: Pick<AuthenticatedRequestContext, 'repo'>,
  claim: WithId<Claim>
): Promise<WithId<Invoice> | undefined> {
  const billRef = claim.identifier?.find((i) => i.system === KenyaClaimInvoiceSystem)?.value;
  if (!billRef?.startsWith('Invoice/')) {
    return undefined;
  }
  const invoice = await ctx.repo.readReference<Invoice>({ reference: billRef });
  if (invoice.status !== 'issued') {
    return invoice;
  }
  const payments = await ctx.repo.searchResources<PaymentNotice>({
    resourceType: 'PaymentNotice',
    filters: [{ code: 'request', operator: Operator.EQUALS, value: billRef }],
    count: 1000,
  });
  const claimsForBill = await ctx.repo.searchResources<Claim>({
    resourceType: 'Claim',
    filters: [{ code: 'identifier', operator: Operator.EQUALS, value: `${KenyaClaimInvoiceSystem}|${billRef}` }],
  });
  const shaCents = claimsForBill
    .filter((c) => c.status === 'active')
    .reduce((sum, c) => sum + toCents(c.id === claim.id ? shaPaidOnClaim(claim) : shaPaidOnClaim(c)), 0);
  const coveredCents = shaCents + toCents(paidOnInvoice(payments));
  if (coveredCents >= toCents(invoice.totalGross?.value ?? 0)) {
    return ctx.repo.updateResource<Invoice>({ ...invoice, status: 'balanced' });
  }
  return invoice;
}
