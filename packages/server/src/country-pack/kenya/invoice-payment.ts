// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya patient payments against a bill (self-pay): cash, card or M-Pesa paid at the till, recorded
// against the FHIR Invoice that Encounter/$kenya-invoice issued (invoice.ts).
//
// DHA's IGs have no profile for a patient's receipt; the nearest is eClaims ke-eclaims-paymentnotice
// (payments against claims). Each payment is therefore a PaymentNotice that carries everything that
// profile requires: identifier (the receipt number), provider, payee, paymentDate, amount and
// paymentStatus with a code from the FHIR payment-status code system. The payment method is coded in
// DHA's payment-method-cs (CASH, CARD, MOBILE-MONEY). When the payments reach the bill's total, the
// Invoice becomes "balanced". Accounting (an ERPNext Payment Entry against the bill's Sales Invoice)
// follows from the PaymentNotice in afiax-services.
//
// M-Pesa STK Push is not here yet: it goes through Afiax Pay (change register 3.9), whose payment
// request API is still to be built; it will record the same PaymentNotice from its callback.

import type { WithId } from '@medplum/core';
import { badRequest, createReference, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import type { Invoice, PaymentNotice } from '@medplum/fhirtypes';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedRequestContext } from '../../context';
import { KenyaInvoiceCurrency } from './invoice';

/** Receipt numbers issued by Afiax FHIR, e.g. RCT-20261108-3F9A2C. */
export const KenyaReceiptNumberSystem = 'https://afiax.africa/kenya/identifier/receipt-number';
/** DHA payment method code system (eClaims IG). */
export const DhaPaymentMethodSystem = 'https://fhir.dha.go.ke/terminology/CodeSystem/payment-method-cs';
/** Extension carrying the payment method and the till's transaction reference. */
export const KenyaInvoicePaymentExtension = 'https://afiax.africa/fhir/StructureDefinition/kenya-invoice-payment';
const PaymentStatusSystem = 'http://terminology.hl7.org/CodeSystem/paymentstatus';

export type KenyaInvoicePaymentMethod = 'cash' | 'card' | 'mpesa-manual';

const DhaMethod: Record<KenyaInvoicePaymentMethod, { code: string; display: string }> = {
  cash: { code: 'CASH', display: 'Cash' },
  card: { code: 'CARD', display: 'Card' },
  'mpesa-manual': { code: 'MOBILE-MONEY', display: 'Mobile Money' },
};

export interface KenyaInvoicePaymentInput {
  readonly method: KenyaInvoicePaymentMethod;
  readonly amount: number;
  /** M-Pesa confirmation code or card authorisation; required for M-Pesa and card. */
  readonly transactionRef?: string;
}

export interface KenyaInvoicePaymentResult {
  readonly paymentNotice: WithId<PaymentNotice>;
  readonly invoice: WithId<Invoice>;
  readonly paid: number;
  readonly balance: number;
}

const toCents = (value: number): number => Math.round(value * 100);

/**
 * A new receipt number: the payment date plus 6 random hex characters.
 * @param now - Payment time.
 * @returns The number.
 */
export function newKenyaReceiptNumber(now: Date): string {
  const day = now.toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 10).replaceAll('-', '');
  return `RCT-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * The amount already paid on an Invoice: the sum of its active, paid PaymentNotices.
 * @param notices - PaymentNotices whose request is the Invoice.
 * @returns The amount, in KES.
 */
export function paidOnInvoice(notices: readonly PaymentNotice[]): number {
  const cents = notices
    .filter((n) => n.status === 'active' && n.paymentStatus?.coding?.some((c) => c.code === 'paid'))
    .reduce((sum, n) => sum + toCents(n.amount?.value ?? 0), 0);
  return cents / 100;
}

/**
 * Records a patient payment against an issued Invoice.
 * @param ctx - The caller's context; the caller's repository applies its access policies.
 * @param invoice - The bill.
 * @param input - Method, amount and transaction reference.
 * @param now - Clock, for tests.
 * @returns The PaymentNotice, the (possibly balanced) Invoice, the amount paid so far and the balance.
 */
export async function recordKenyaInvoicePayment(
  ctx: Pick<AuthenticatedRequestContext, 'repo' | 'profile'>,
  invoice: WithId<Invoice>,
  input: KenyaInvoicePaymentInput,
  now: Date = new Date()
): Promise<KenyaInvoicePaymentResult> {
  if (!(input.method in DhaMethod)) {
    throw new OperationOutcomeError(badRequest(`Unsupported payment method: ${input.method}`));
  }
  if (!Number.isFinite(input.amount) || toCents(input.amount) <= 0) {
    throw new OperationOutcomeError(badRequest('The amount must be more than zero'));
  }
  const transactionRef = input.transactionRef?.trim();
  if (input.method !== 'cash' && !transactionRef) {
    throw new OperationOutcomeError(
      badRequest(`A ${input.method === 'card' ? 'card authorisation' : 'M-Pesa confirmation'} code is required`)
    );
  }

  return ctx.repo.withTransaction(async () => {
    // Read again inside the transaction, so two tills cannot both take the last shilling
    const current = await ctx.repo.readResource<Invoice>('Invoice', invoice.id);
    if (current.status === 'balanced') {
      throw new OperationOutcomeError(badRequest('This bill is already paid in full'));
    }
    if (current.status !== 'issued') {
      throw new OperationOutcomeError(badRequest(`A ${current.status} bill cannot be paid`));
    }
    const currency = current.totalGross?.currency ?? KenyaInvoiceCurrency;
    if (currency !== KenyaInvoiceCurrency) {
      throw new OperationOutcomeError(badRequest(`Bills must be in ${KenyaInvoiceCurrency}`));
    }
    const total = current.totalGross?.value ?? 0;

    const previous = await ctx.repo.searchResources<PaymentNotice>({
      resourceType: 'PaymentNotice',
      filters: [{ code: 'request', operator: Operator.EQUALS, value: getReferenceString(current) }],
      count: 1000,
    });
    const paidBefore = paidOnInvoice(previous);
    const balanceBefore = (toCents(total) - toCents(paidBefore)) / 100;
    if (toCents(input.amount) > toCents(balanceBefore)) {
      throw new OperationOutcomeError(
        badRequest(`The amount (${currency} ${input.amount}) is more than the balance (${currency} ${balanceBefore})`)
      );
    }

    const facility = current.issuer;
    if (!facility?.reference) {
      throw new OperationOutcomeError(badRequest('The bill has no issuing facility'));
    }
    const method = DhaMethod[input.method];
    const issued = now.toISOString();
    const paymentNotice = await ctx.repo.createResource<PaymentNotice>({
      resourceType: 'PaymentNotice',
      status: 'active',
      identifier: [{ system: KenyaReceiptNumberSystem, value: newKenyaReceiptNumber(now) }],
      request: createReference(current),
      created: issued,
      provider: facility,
      // R4 requires a PaymentReconciliation reference; a till payment has none, so a label only
      payment: { display: `Patient ${method.display.toLowerCase()} payment` },
      paymentDate: now.toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 10),
      payee: facility,
      recipient: facility,
      amount: { value: input.amount, currency },
      paymentStatus: { coding: [{ system: PaymentStatusSystem, code: 'paid', display: 'Paid' }] },
      extension: [
        {
          url: KenyaInvoicePaymentExtension,
          extension: [
            { url: 'method', valueCoding: { system: DhaPaymentMethodSystem, ...method } },
            ...(transactionRef ? [{ url: 'transactionRef', valueString: transactionRef }] : []),
            ...(ctx.profile ? [{ url: 'cashier', valueReference: ctx.profile }] : []),
          ],
        },
      ],
    });

    const paid = (toCents(paidBefore) + toCents(input.amount)) / 100;
    const balance = (toCents(total) - toCents(paid)) / 100;
    const updated =
      balance === 0 ? await ctx.repo.updateResource<Invoice>({ ...current, status: 'balanced' }) : current;
    return { paymentNotice, invoice: updated, paid, balance };
  });
}
