// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Patient, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { getProjectCountryPack } from '../../country-pack/registry';
import { handlePublishNationalRecord } from '../../country-pack/kenya/publish-national-record';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const publishNationalRecordOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'patient-publish-national-record',
  name: 'PublishNationalRecord',
  title: 'Publish Patient Record to Kenya SHR',
  status: 'active',
  kind: 'operation',
  code: 'publish-national-record',
  resource: ['Patient'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    {
      use: 'in', name: 'patient', type: 'Reference', min: 0, max: '1',
      documentation: 'Reference to the Patient. Omit when calling on a Patient instance.',
    },
    {
      use: 'in', name: 'includeActiveConditions', type: 'boolean', min: 0, max: '1',
      documentation: 'Include active Conditions in the published Bundle. Default: false.',
    },
    {
      use: 'in', name: 'includeRecentEncounters', type: 'boolean', min: 0, max: '1',
      documentation: 'Include the 20 most recent Encounters in the published Bundle. Default: false.',
    },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'correlationId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'patientId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'publicationId', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'endpoint', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'publishedAt', type: 'dateTime', min: 1, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'bundleEntryCount', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 0, max: '1' },
  ],
};

interface PublishNationalRecordParameters {
  readonly patient?: Reference<Patient>;
  readonly includeActiveConditions?: boolean;
  readonly includeRecentEncounters?: boolean;
}

export async function publishNationalRecordHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const countryPack = getProjectCountryPack(ctx.project);
  if (!countryPack || countryPack.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }

  const params = parseInputParameters<PublishNationalRecordParameters>(publishNationalRecordOperation, req);
  const patient = await resolvePatient(req, params);
  const correlationId = randomUUID();

  const result = await handlePublishNationalRecord({
    ctx,
    patient,
    correlationId,
    includeActiveConditions: params.includeActiveConditions ?? false,
    includeRecentEncounters: params.includeRecentEncounters ?? false,
  });

  return [allOk, buildOutputParameters(publishNationalRecordOperation, result)];
}

async function resolvePatient(
  req: FhirRequest,
  params: PublishNationalRecordParameters
): Promise<Patient & { id: string }> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  if (id) {
    return ctx.repo.readResource<Patient>('Patient', id);
  }
  if (params.patient?.reference) {
    return ctx.repo.readReference<Patient>(params.patient);
  }
  throw new OperationOutcomeError(
    badRequest('Must call this operation on a Patient instance or include a patient reference.')
  );
}
