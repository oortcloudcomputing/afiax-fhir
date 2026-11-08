// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Claim, OperationDefinition, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { recordKenyaShaRemittance } from '../../country-pack/kenya/sha-remittance';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const kenyaShaRemittanceOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'paymentreconciliation-kenya-sha-remittance',
  name: 'KenyaShaRemittance',
  title: 'Record a payment SHA made for claims (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-sha-remittance',
  resource: ['PaymentReconciliation'],
  system: false,
  type: true,
  instance: false,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'paymentReference', type: 'string', min: 1, max: '1' },
    { use: 'in', name: 'paymentDate', type: 'date', min: 1, max: '1' },
    {
      use: 'in',
      name: 'line',
      min: 1,
      max: '*',
      part: [
        { use: 'in', name: 'claim', type: 'Reference', min: 1, max: '1' },
        { use: 'in', name: 'amount', type: 'decimal', min: 1, max: '1' },
      ],
    },
    { use: 'out', name: 'paymentReconciliation', type: 'Reference', min: 1, max: '1' },
    { use: 'out', name: 'total', type: 'Money', min: 1, max: '1' },
    {
      use: 'out',
      name: 'claim',
      min: 1,
      max: '*',
      part: [
        { use: 'out', name: 'claim', type: 'Reference', min: 1, max: '1' },
        { use: 'out', name: 'paid', type: 'Money', min: 1, max: '1' },
        { use: 'out', name: 'outstanding', type: 'Money', min: 1, max: '1' },
        { use: 'out', name: 'billStatus', type: 'code', min: 0, max: '1' },
      ],
    },
  ],
};

interface KenyaShaRemittanceParameters {
  readonly paymentReference: string;
  readonly paymentDate: string;
  readonly line: { claim: Reference<Claim>; amount: number }[];
}

/**
 * Handles POST PaymentReconciliation/$kenya-sha-remittance.
 * @param req - The FHIR request.
 * @returns The PaymentReconciliation, its total, and per claim what SHA paid and still owes.
 */
export async function kenyaShaRemittanceHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  const params = parseInputParameters<KenyaShaRemittanceParameters>(kenyaShaRemittanceOperation, req);
  const result = await recordKenyaShaRemittance(ctx, {
    paymentReference: params.paymentReference,
    paymentDate: params.paymentDate,
    lines: params.line,
  });
  return [
    allOk,
    buildOutputParameters(kenyaShaRemittanceOperation, {
      paymentReconciliation: createReference(result.reconciliation),
      total: result.reconciliation.paymentAmount,
      claim: result.claims.map((c) => ({
        claim: createReference(c.claim),
        paid: { value: c.paid, currency: 'KES' },
        outstanding: { value: c.outstanding, currency: 'KES' },
        billStatus: c.invoice?.status,
      })),
    }),
  ];
}
