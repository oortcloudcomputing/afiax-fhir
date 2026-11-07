// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Invoice, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type { KenyaInvoicePaymentMethod } from '../../country-pack/kenya/invoice-payment';
import { KenyaReceiptNumberSystem, recordKenyaInvoicePayment } from '../../country-pack/kenya/invoice-payment';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const kenyaInvoicePaymentOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'invoice-kenya-payment',
  name: 'KenyaPayment',
  title: 'Record a patient payment against a bill: cash, card or M-Pesa (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-payment',
  resource: ['Invoice'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'method', type: 'code', min: 1, max: '1' },
    { use: 'in', name: 'amount', type: 'decimal', min: 1, max: '1' },
    { use: 'in', name: 'transactionRef', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'paymentNotice', type: 'Reference', min: 1, max: '1' },
    { use: 'out', name: 'receiptNumber', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'paid', type: 'Money', min: 1, max: '1' },
    { use: 'out', name: 'balance', type: 'Money', min: 1, max: '1' },
  ],
};

interface KenyaInvoicePaymentParameters {
  readonly method: KenyaInvoicePaymentMethod;
  readonly amount: number;
  readonly transactionRef?: string;
}

/**
 * Handles POST Invoice/:id/$kenya-payment.
 * @param req - The FHIR request.
 * @returns The PaymentNotice, its receipt number, the amount paid so far and the balance.
 */
export async function kenyaInvoicePaymentHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  const params = parseInputParameters<KenyaInvoicePaymentParameters>(kenyaInvoicePaymentOperation, req);
  const invoice = await ctx.repo.readResource<Invoice>('Invoice', req.params.id);
  const result = await recordKenyaInvoicePayment(ctx, invoice, params);
  const currency = result.paymentNotice.amount?.currency ?? 'KES';
  return [
    allOk,
    buildOutputParameters(kenyaInvoicePaymentOperation, {
      paymentNotice: createReference(result.paymentNotice),
      receiptNumber: result.paymentNotice.identifier?.find((i) => i.system === KenyaReceiptNumberSystem)?.value,
      paid: { value: result.paid, currency },
      balance: { value: result.balance, currency },
    }),
  ];
}
