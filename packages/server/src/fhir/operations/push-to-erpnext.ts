// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Claim, OperationDefinition, Project, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { handlePushToErpNext } from '../../country-pack/kenya/push-to-erpnext';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const pushToErpNextOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'claim-push-to-erpnext',
  name: 'PushToErpNext',
  title: 'Push Claim to ERPNext (idempotent retry)',
  status: 'active',
  kind: 'operation',
  code: 'push-to-erpnext',
  resource: ['Claim'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'claim', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'invoiceSynced', type: 'boolean', min: 1, max: '1' },
    { use: 'out', name: 'paymentsSynced', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'paymentsFailed', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'patientDue', type: 'decimal', min: 0, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
  ],
};

interface PushToErpNextParameters {
  readonly claim?: Reference<Claim>;
}

export async function pushToErpNextHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<PushToErpNextParameters>(pushToErpNextOperation, req);

  let claim: Claim & { id: string };
  if (req.params.id) {
    claim = await ctx.repo.readResource<Claim>('Claim', req.params.id) as Claim & { id: string };
  } else if (params.claim?.reference) {
    claim = await ctx.repo.readReference<Claim>(params.claim) as Claim & { id: string };
  } else {
    throw new OperationOutcomeError(badRequest('Must call this operation on a Claim instance or include a claim reference.'));
  }

  const project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id) as Project & { id: string };
  const result = await handlePushToErpNext(ctx.systemRepo, claim, project);

  return [allOk, buildOutputParameters(pushToErpNextOperation, result)];
}
