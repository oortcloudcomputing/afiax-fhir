// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Coverage, Invoice, OperationDefinition, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type { KenyaClaimIntervention } from '../../country-pack/kenya/claim-from-invoice';
import { createKenyaClaimFromInvoice, KenyaClaimNumberSystem } from '../../country-pack/kenya/claim-from-invoice';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const kenyaClaimOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'invoice-kenya-claim',
  name: 'KenyaClaim',
  title: 'Make an SHA claim (DHA eClaims) from a bill (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-claim',
  resource: ['Invoice'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'coverage', type: 'Reference', min: 1, max: '1' },
    {
      use: 'in',
      name: 'intervention',
      min: 1,
      max: '*',
      part: [
        { use: 'in', name: 'code', type: 'code', min: 1, max: '1' },
        { use: 'in', name: 'quantity', type: 'decimal', min: 0, max: '1' },
        { use: 'in', name: 'unitPrice', type: 'decimal', min: 0, max: '1' },
        { use: 'in', name: 'category', type: 'code', min: 0, max: '1' },
      ],
    },
    { use: 'in', name: 'preAuthRef', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'claim', type: 'Reference', min: 1, max: '1' },
    { use: 'out', name: 'claimNumber', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'claimed', type: 'Money', min: 1, max: '1' },
    { use: 'out', name: 'patientShare', type: 'Money', min: 1, max: '1' },
  ],
};

interface KenyaClaimParameters {
  readonly coverage: Reference<Coverage>;
  readonly intervention: KenyaClaimIntervention[];
  readonly preAuthRef?: string;
}

/**
 * Handles POST Invoice/:id/$kenya-claim.
 * @param req - The FHIR request.
 * @returns The new Claim, its number, the amount claimed and the patient's share.
 */
export async function kenyaClaimHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  const params = parseInputParameters<KenyaClaimParameters>(kenyaClaimOperation, req);
  const invoice = await ctx.repo.readResource<Invoice>('Invoice', req.params.id);
  const result = await createKenyaClaimFromInvoice(ctx, invoice, {
    coverage: params.coverage,
    interventions: params.intervention,
    preAuthRef: params.preAuthRef,
  });
  return [
    allOk,
    buildOutputParameters(kenyaClaimOperation, {
      claim: createReference(result.claim),
      claimNumber: result.claim.identifier?.find((i) => i.system === KenyaClaimNumberSystem)?.value,
      claimed: { value: result.claimed, currency: 'KES' },
      patientShare: { value: result.patientShare, currency: 'KES' },
    }),
  ];
}
