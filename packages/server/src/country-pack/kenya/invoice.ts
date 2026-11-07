// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya encounter billing: turns an encounter's billable ChargeItems (raised by CPOE orders,
// orders.ts) into a FHIR Invoice, the patient's bill (ADR-009 §6 "Billing"). The Invoice is the
// facility's own document: DHA's IGs profile the claim that follows from it (ke-eclaims-
// claimsubmission, whose eclaims-patient-invoice extension carries this invoice's number, date,
// amount and the patient's share), not the bill itself, so the Invoice is plain FHIR R4.
//
// Each call bills the charges not yet billed: the ChargeItems go from billable to billed in the
// same transaction as the Invoice, so a repeated call never bills a charge twice and a later call
// makes an interim or final bill for what was added since. Prices come from ChargeItem.priceOverride
// (the facility price list at order time, or a price set at billing); a charge without a price is
// refused rather than billed at zero. Accounting (the ERPNext Sales Invoice) follows from the
// Invoice in afiax-services, without a stock update: dispensing moves the stock.

import type { WithId } from '@medplum/core';
import { badRequest, createReference, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import type { ChargeItem, Encounter, Invoice, Patient, Reference } from '@medplum/fhirtypes';
import { randomBytes } from 'node:crypto';
import type { AuthenticatedRequestContext } from '../../context';

/** Invoice numbers issued by Afiax FHIR for Kenya facilities, e.g. INV-20261107-3F9A2C. */
export const KenyaInvoiceNumberSystem = 'https://afiax.africa/kenya/identifier/invoice-number';

export const KenyaInvoiceCurrency = 'KES' as const;

export interface KenyaInvoiceResult {
  readonly invoice: WithId<Invoice>;
  readonly chargeItems: WithId<ChargeItem>[];
}

/** Encounter statuses that can be billed: anything that happened (not planned or cancelled). */
const billableEncounterStatuses = new Set<Encounter['status']>([
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
  'finished',
]);

/**
 * A new invoice number: the issue date plus 6 random hex characters. Unique enough per facility
 * per day (16.7 million values) and short enough to read out at the till.
 * @param now - Issue time.
 * @returns The number.
 */
export function newKenyaInvoiceNumber(now: Date): string {
  const day = now.toLocaleString('sv-SE', { timeZone: 'Africa/Nairobi' }).slice(0, 10).replaceAll('-', '');
  return `INV-${day}-${randomBytes(3).toString('hex').toUpperCase()}`;
}

/**
 * Builds the Invoice lines and total from priced ChargeItems.
 * @param chargeItems - The charges, in the order they were raised.
 * @returns The lines and total.
 */
export function buildKenyaInvoiceLines(chargeItems: WithId<ChargeItem>[]): {
  lineItem: NonNullable<Invoice['lineItem']>;
  total: number;
} {
  let total = 0;
  const lineItem = chargeItems.map((charge, index) => {
    const amount = charge.priceOverride?.value as number;
    total += amount;
    return {
      sequence: index + 1,
      chargeItemReference: createReference(charge) as Reference<ChargeItem>,
      // The base component carries the charge's code and quantity (factor) as well as the line amount,
      // so the bill can be read, printed and posted to accounting without fetching each ChargeItem.
      priceComponent: [
        {
          type: 'base' as const,
          code: charge.code,
          factor: charge.quantity?.value ?? 1,
          amount: { value: amount, currency: KenyaInvoiceCurrency },
        },
      ],
    };
  });
  // Money in KES to the cent, without floating-point residue
  return { lineItem, total: Math.round(total * 100) / 100 };
}

/**
 * Issues an Invoice for an encounter's unbilled charges.
 * @param ctx - The caller's context; the caller's repository applies its access policies.
 * @param encounter - The encounter to bill.
 * @param now - Clock, for tests.
 * @returns The Invoice and the ChargeItems it billed.
 */
export async function createKenyaEncounterInvoice(
  ctx: Pick<AuthenticatedRequestContext, 'repo' | 'profile'>,
  encounter: WithId<Encounter>,
  now: Date = new Date()
): Promise<KenyaInvoiceResult> {
  if (!billableEncounterStatuses.has(encounter.status)) {
    throw new OperationOutcomeError(badRequest(`A ${encounter.status} encounter cannot be billed`));
  }
  if (!encounter.subject?.reference?.startsWith('Patient/')) {
    throw new OperationOutcomeError(badRequest('The encounter has no patient'));
  }

  return ctx.repo.withTransaction(async () => {
    // R4 ChargeItem has no status search parameter, so filter after searching by encounter
    const charges = (
      await ctx.repo.searchResources<ChargeItem>({
        resourceType: 'ChargeItem',
        filters: [{ code: 'context', operator: Operator.EQUALS, value: getReferenceString(encounter) }],
        sortRules: [{ code: '_lastUpdated' }],
        count: 1000,
      })
    ).filter((c) => c.status === 'billable');
    if (!charges.length) {
      throw new OperationOutcomeError(badRequest('This encounter has no unbilled charges'));
    }
    const unpriced = charges.filter((c) => typeof c.priceOverride?.value !== 'number');
    if (unpriced.length) {
      const codes = unpriced.map((c) => c.code?.coding?.[0]?.code ?? c.code?.text ?? getReferenceString(c));
      throw new OperationOutcomeError(
        badRequest(`Set a price on these charges before billing: ${codes.join(', ')}`)
      );
    }
    const otherCurrency = charges.find((c) => (c.priceOverride?.currency ?? KenyaInvoiceCurrency) !== KenyaInvoiceCurrency);
    if (otherCurrency) {
      throw new OperationOutcomeError(badRequest(`Charges must be in ${KenyaInvoiceCurrency}`));
    }

    const { lineItem, total } = buildKenyaInvoiceLines(charges);
    const issued = now.toISOString();
    const invoice = await ctx.repo.createResource<Invoice>({
      resourceType: 'Invoice',
      status: 'issued',
      identifier: [{ system: KenyaInvoiceNumberSystem, value: newKenyaInvoiceNumber(now) }],
      subject: encounter.subject as Reference<Patient>,
      recipient: encounter.subject as Reference<Patient>,
      date: issued,
      issuer: encounter.serviceProvider,
      participant: ctx.profile
        ? [{ actor: ctx.profile as NonNullable<Invoice['participant']>[number]['actor'] }]
        : undefined,
      lineItem,
      totalNet: { value: total, currency: KenyaInvoiceCurrency },
      totalGross: { value: total, currency: KenyaInvoiceCurrency },
      // The encounter is not an Invoice element; it is recorded on every line's ChargeItem (context)
      note: [{ text: `Bill for ${getReferenceString(encounter)}`, time: issued }],
    });

    const billed: WithId<ChargeItem>[] = [];
    for (const charge of charges) {
      billed.push(await ctx.repo.updateResource<ChargeItem>({ ...charge, status: 'billed' }));
    }
    return { invoice, chargeItems: billed };
  });
}
