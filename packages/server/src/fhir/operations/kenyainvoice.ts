// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Encounter, OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { createKenyaEncounterInvoice } from '../../country-pack/kenya/invoice';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters } from './utils/parameters';

export const kenyaInvoiceOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'encounter-kenya-invoice',
  name: 'KenyaInvoice',
  title: "Bill an encounter: issue an Invoice for its unbilled charges (Kenya)",
  status: 'active',
  kind: 'operation',
  code: 'kenya-invoice',
  resource: ['Encounter'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'out', name: 'invoice', type: 'Reference', min: 1, max: '1' },
    { use: 'out', name: 'total', type: 'Money', min: 1, max: '1' },
  ],
};

/**
 * Handles POST Encounter/:id/$kenya-invoice.
 * @param req - The FHIR request.
 * @returns A reference to the new Invoice and its total.
 */
export async function kenyaInvoiceHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  const encounter = await ctx.repo.readResource<Encounter>('Encounter', req.params.id);
  const { invoice } = await createKenyaEncounterInvoice(ctx, encounter);
  return [
    allOk,
    buildOutputParameters(kenyaInvoiceOperation, { invoice: createReference(invoice), total: invoice.totalGross }),
  ];
}
