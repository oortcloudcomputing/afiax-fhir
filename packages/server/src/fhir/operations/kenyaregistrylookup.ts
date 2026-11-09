// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AccessPolicyInteraction, allOk, badRequest, forbidden, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { getKenyaAfyaLinkCredentials, searchAfyaLinkClientRegistry } from '../../country-pack/kenya/afyalink';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const kenyaRegistryLookupOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'patient-kenya-registry-lookup',
  name: 'KenyaRegistryLookup',
  title: 'Look up a person in the DHA Client Registry before registering them (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-registry-lookup',
  resource: ['Patient'],
  system: false,
  type: true,
  instance: false,
  affectsState: false,
  parameter: [
    { use: 'in', name: 'identificationType', type: 'string', min: 1, max: '1' },
    { use: 'in', name: 'identificationNumber', type: 'string', min: 1, max: '1' },
    {
      use: 'out',
      name: 'result',
      type: 'string',
      min: 1,
      max: '1',
      documentation: 'The Client Registry response, as JSON.',
    },
  ],
};

interface KenyaRegistryLookupParameters {
  readonly identificationType: string;
  readonly identificationNumber: string;
}

/**
 * Handles POST Patient/$kenya-registry-lookup: the DHA Client Registry search behind patient
 * registration. Open to staff (Practitioner profiles) who may create patients, for example front-desk
 * staff, unlike the admin-only lookup used by the setup screens. Patients are refused.
 * @param req - The FHIR request.
 * @returns The Client Registry response.
 */
export async function kenyaRegistryLookupHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  // Staff only: a patient account (even one allowed to write its own Patient) must not be able to
  // look up other people in the national registry
  const profileType = ctx.profile.reference?.split('/')[0];
  if (profileType !== 'Practitioner' || !ctx.repo.supportsInteraction(AccessPolicyInteraction.CREATE, 'Patient')) {
    throw new OperationOutcomeError(forbidden);
  }
  const params = parseInputParameters<KenyaRegistryLookupParameters>(kenyaRegistryLookupOperation, req);
  const identificationType = params.identificationType.trim();
  const identificationNumber = params.identificationNumber.trim();
  if (!identificationType || !identificationNumber) {
    throw new OperationOutcomeError(badRequest('identificationType and identificationNumber are required'));
  }
  const credentials = getKenyaAfyaLinkCredentials(ctx.project);
  const result = await searchAfyaLinkClientRegistry(credentials, identificationType, identificationNumber);
  return [allOk, buildOutputParameters(kenyaRegistryLookupOperation, { result: JSON.stringify(result) })];
}
