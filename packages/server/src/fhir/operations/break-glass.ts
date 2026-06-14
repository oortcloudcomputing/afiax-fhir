// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Patient, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { handleBreakGlassAccess } from '../../country-pack/kenya/break-glass';
import { getAuthenticatedContext } from '../../context';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const breakGlassOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'patient-break-glass',
  name: 'BreakGlass',
  title: 'Break-glass Emergency Access Declaration',
  status: 'active',
  kind: 'operation',
  code: 'break-glass',
  resource: ['Patient'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    {
      use: 'in', name: 'reason', type: 'string', min: 1, max: '1',
      documentation: 'Clinical reason justifying emergency access. Recorded in the audit trail and security alert.',
    },
    {
      use: 'in', name: 'durationHours', type: 'integer', min: 0, max: '1',
      documentation: 'Duration in hours for which access is declared. Minimum 1, maximum 24. Default 4.',
    },
    {
      use: 'in', name: 'patient', type: 'Reference', min: 0, max: '1',
      documentation: 'Reference to the Patient. Omit when calling on a Patient instance.',
    },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'correlationId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'patientId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'declaredAt', type: 'dateTime', min: 1, max: '1' },
    { use: 'out', name: 'expiresAt', type: 'dateTime', min: 1, max: '1' },
    { use: 'out', name: 'durationHours', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'flag', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'alertSent', type: 'boolean', min: 1, max: '1' },
  ],
};

interface BreakGlassParameters {
  readonly reason?: string;
  readonly durationHours?: number;
  readonly patient?: Reference<Patient>;
}

export async function breakGlassHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const countryPack = getProjectCountryPack(ctx.project);
  if (!countryPack || countryPack.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }

  const params = parseInputParameters<BreakGlassParameters>(breakGlassOperation, req);

  const reason = params.reason?.trim();
  if (!reason) {
    throw new OperationOutcomeError(badRequest('reason is required and must not be blank.'));
  }

  const patient = await resolvePatient(req, params);
  const correlationId = randomUUID();

  const result = await handleBreakGlassAccess({
    ctx,
    patient,
    reason,
    durationHours: params.durationHours,
    correlationId,
  });

  return [allOk, buildOutputParameters(breakGlassOperation, result)];
}

async function resolvePatient(
  req: FhirRequest,
  params: BreakGlassParameters
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
