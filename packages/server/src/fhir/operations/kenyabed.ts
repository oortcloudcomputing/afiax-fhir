// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Location, OperationDefinition, Parameters } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type { KenyaBedInput } from '../../country-pack/kenya/beds';
import { changeKenyaBed } from '../../country-pack/kenya/beds';
import { getProjectCountryPack } from '../../country-pack/registry';
import { parseInputParameters } from './utils/parameters';

export const kenyaBedOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'location-kenya-bed',
  name: 'KenyaBed',
  title: 'Bed board: admit, transfer, discharge, cleaned, close or reopen a bed (checked, version-checked)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-bed',
  resource: ['Location'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'action', type: 'code', min: 1, max: '1' },
    { use: 'in', name: 'patient', type: 'Reference', min: 0, max: '1' },
    { use: 'in', name: 'toBed', type: 'Reference', min: 0, max: '1' },
    { use: 'in', name: 'reason', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'bed', type: 'Reference', min: 1, max: '1' },
    { use: 'out', name: 'encounter', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'toBed', type: 'Reference', min: 0, max: '1' },
  ],
};

/**
 * Handles POST Location/:id/$kenya-bed (ADR-018 §C).
 * @param req - The FHIR request.
 * @returns The bed, and the Encounter for admit, transfer and discharge.
 */
export async function kenyaBedHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  const bed = await ctx.repo.readResource<Location>('Location', req.params.id);
  const input = parseInputParameters<KenyaBedInput>(kenyaBedOperation, req);
  const result = await changeKenyaBed(ctx, bed, input);
  const body: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'bed', valueReference: createReference(result.bed) },
      ...(result.encounter ? [{ name: 'encounter', valueReference: createReference(result.encounter) }] : []),
      ...(result.toBed ? [{ name: 'toBed', valueReference: createReference(result.toBed) }] : []),
    ],
  };
  return [allOk, body];
}
