// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Condition, OperationDefinition, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { applyIdsrNotificationExtension, handleKenyaIdsrNotification } from '../../country-pack/kenya/idsr';
import { getAuthenticatedContext } from '../../context';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const reportIdsrNotificationOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'condition-report-idsr-notification',
  name: 'ReportIdsrNotification',
  title: 'Report IDSR Immediate Notification',
  status: 'active',
  kind: 'operation',
  code: 'report-idsr-notification',
  resource: ['Condition'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'condition', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'correlationId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'conditionCode', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'conditionDisplay', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'notifiedAt', type: 'dateTime', min: 1, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 0, max: '1' },
  ],
};

interface ReportIdsrNotificationParameters {
  readonly condition?: Reference<Condition>;
}

export async function reportIdsrNotificationHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const countryPack = getProjectCountryPack(ctx.project);
  if (!countryPack || countryPack.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }

  const condition = await getConditionForNotification(req);
  const correlationId = randomUUID();

  const result = await handleKenyaIdsrNotification({ ctx, condition, correlationId });

  if (result.conditionCode) {
    const updated = applyIdsrNotificationExtension(condition, result);
    await ctx.systemRepo.updateResource<Condition>(updated);
  }

  return [allOk, buildOutputParameters(reportIdsrNotificationOperation, result)];
}

async function getConditionForNotification(req: FhirRequest): Promise<Condition & { id: string }> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  if (id) {
    return ctx.repo.readResource<Condition>('Condition', id);
  }

  const params = parseInputParameters<ReportIdsrNotificationParameters>(reportIdsrNotificationOperation, req);
  if (params.condition?.reference) {
    return ctx.repo.readReference<Condition>(params.condition);
  }

  throw new OperationOutcomeError(
    badRequest('Must call this operation on a Condition instance or include a condition reference.')
  );
}
