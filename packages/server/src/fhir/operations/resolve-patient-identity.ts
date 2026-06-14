// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Patient, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { getProjectCountryPack } from '../../country-pack/registry';
import { handleResolvePatientIdentity } from '../../country-pack/kenya/resolve-patient-identity';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const resolvePatientIdentityOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'patient-resolve-patient-identity',
  name: 'ResolvePatientIdentity',
  title: 'Resolve Patient Identity via DHA Client Registry',
  status: 'active',
  kind: 'operation',
  code: 'resolve-patient-identity',
  resource: ['Patient'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    {
      use: 'in', name: 'identificationType', type: 'string', min: 1, max: '1',
      documentation: 'Identification type used for the DHA lookup: National ID | Alien ID | Passport | Birth Certificate | Refugee ID',
    },
    {
      use: 'in', name: 'identificationNumber', type: 'string', min: 1, max: '1',
      documentation: 'The identification number matching the identificationType.',
    },
    {
      use: 'in', name: 'patient', type: 'Reference', min: 0, max: '1',
      documentation: 'Reference to the Patient. Omit when calling on a Patient instance.',
    },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'correlationId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'patientId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'identificationType', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'identificationNumber', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'clientRegistryId', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'fullName', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'dateOfBirth', type: 'date', min: 0, max: '1' },
    { use: 'out', name: 'gender', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'resolvedAt', type: 'dateTime', min: 1, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 0, max: '1' },
  ],
};

interface ResolvePatientIdentityParameters {
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly patient?: Reference<Patient>;
}

export async function resolvePatientIdentityHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const countryPack = getProjectCountryPack(ctx.project);
  if (!countryPack || countryPack.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }

  const params = parseInputParameters<ResolvePatientIdentityParameters>(resolvePatientIdentityOperation, req);

  const identificationType = params.identificationType?.trim();
  if (!identificationType) {
    throw new OperationOutcomeError(badRequest('identificationType is required.'));
  }

  const identificationNumber = params.identificationNumber?.trim();
  if (!identificationNumber) {
    throw new OperationOutcomeError(badRequest('identificationNumber is required.'));
  }

  const patient = await resolvePatient(req, params);
  const correlationId = randomUUID();

  const result = await handleResolvePatientIdentity({
    ctx,
    patient,
    identificationType,
    identificationNumber,
    correlationId,
  });

  return [allOk, buildOutputParameters(resolvePatientIdentityOperation, result)];
}

async function resolvePatient(
  req: FhirRequest,
  params: ResolvePatientIdentityParameters
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
