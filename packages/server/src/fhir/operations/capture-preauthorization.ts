// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Coverage, OperationDefinition, Organization, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { handleCapturePreauthorization } from '../../country-pack/kenya/capture-preauthorization';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const capturePreauthorizationOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'coverage-capture-preauthorization',
  name: 'CapturePreauthorization',
  title: 'Capture Private Insurance Pre-Authorization',
  status: 'active',
  kind: 'operation',
  code: 'capture-preauthorization',
  resource: ['Coverage'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'coverage', type: 'Reference', min: 0, max: '1' },
    { use: 'in', name: 'insurerOrganization', type: 'Reference', min: 1, max: '1' },
    { use: 'in', name: 'preauthorizationCode', type: 'string', min: 1, max: '1' },
    { use: 'in', name: 'approvedAmount', type: 'decimal', min: 1, max: '1' },
    { use: 'in', name: 'currency', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'validFrom', type: 'date', min: 0, max: '1' },
    { use: 'in', name: 'validTo', type: 'date', min: 0, max: '1' },
    { use: 'in', name: 'approvedProcedures', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'notes', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'correlationId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'preauthorizationCode', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'approvedAmount', type: 'decimal', min: 1, max: '1' },
    { use: 'out', name: 'currency', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'insurerName', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'validFrom', type: 'date', min: 0, max: '1' },
    { use: 'out', name: 'validTo', type: 'date', min: 0, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'claimReference', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'claimResponseReference', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 0, max: '1' },
  ],
};

interface CapturePreauthorizationParameters {
  readonly coverage?: Reference<Coverage>;
  readonly insurerOrganization?: Reference<Organization>;
  readonly preauthorizationCode?: string;
  readonly approvedAmount?: number;
  readonly currency?: string;
  readonly validFrom?: string;
  readonly validTo?: string;
  readonly approvedProcedures?: string;
  readonly notes?: string;
}

export async function capturePreauthorizationHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<CapturePreauthorizationParameters>(capturePreauthorizationOperation, req);

  // Resolve Coverage.
  let coverage: Coverage & { id: string };
  if (req.params.id) {
    coverage = await ctx.repo.readResource<Coverage>('Coverage', req.params.id) as Coverage & { id: string };
  } else if (params.coverage?.reference) {
    coverage = await ctx.repo.readReference<Coverage>(params.coverage) as Coverage & { id: string };
  } else {
    throw new OperationOutcomeError(badRequest('Must call this operation on a Coverage instance or include a coverage reference.'));
  }

  // Resolve insurer Organization.
  if (!params.insurerOrganization?.reference) {
    throw new OperationOutcomeError(badRequest('insurerOrganization is required.'));
  }
  const insurerOrganization = await ctx.repo.readReference<Organization>(params.insurerOrganization) as Organization & { id: string };

  // Validate required inputs.
  if (!params.preauthorizationCode) {
    throw new OperationOutcomeError(badRequest('preauthorizationCode is required.'));
  }
  if (params.approvedAmount === undefined || params.approvedAmount === null) {
    throw new OperationOutcomeError(badRequest('approvedAmount is required.'));
  }

  const result = await handleCapturePreauthorization({
    ctx,
    coverage,
    insurerOrganization,
    preauthorizationCode: params.preauthorizationCode,
    approvedAmount: params.approvedAmount,
    currency: params.currency ?? 'KES',
    validFrom: params.validFrom,
    validTo: params.validTo,
    approvedProcedures: params.approvedProcedures,
    notes: params.notes,
    correlationId: randomUUID(),
  });

  return [allOk, buildOutputParameters(capturePreauthorizationOperation, result)];
}
