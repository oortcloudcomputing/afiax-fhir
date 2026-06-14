// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError, toKhisWeekPeriod } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { handleKhisWeeklyExport } from '../../country-pack/kenya/khis-export';
import { getAuthenticatedContext } from '../../context';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const khisWeeklyExportOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'system-khis-weekly-export',
  name: 'KhisWeeklyExport',
  title: 'KHIS MOH 505 Weekly Aggregate Export',
  status: 'active',
  kind: 'operation',
  code: 'khis-weekly-export',
  system: true,
  type: false,
  instance: false,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'period', type: 'string', min: 0, max: '1',
      documentation: 'DHIS2 ISO week period (e.g. 2026W24). Defaults to current week.' },
    { use: 'in', name: 'facilityId', type: 'string', min: 1, max: '1',
      documentation: 'Organization resource ID of the reporting facility.' },
    { use: 'in', name: 'dryRun', type: 'boolean', min: 0, max: '1',
      documentation: 'If true, aggregate and validate without pushing to KHIS.' },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'correlationId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'period', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'facilityId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'facilityOrgUnit', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'conditionCount', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'dataValueCount', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'dhis2ImportStatus', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'dhis2ImportCount', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'exportedAt', type: 'dateTime', min: 1, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'documentReference', type: 'Reference', min: 0, max: '1' },
  ],
};

interface KhisWeeklyExportParameters {
  readonly period?: string;
  readonly facilityId?: string;
  readonly dryRun?: boolean;
}

export async function khisWeeklyExportHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const countryPack = getProjectCountryPack(ctx.project);
  if (!countryPack || countryPack.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }

  const params = parseInputParameters<KhisWeeklyExportParameters>(khisWeeklyExportOperation, req);

  const facilityId = params.facilityId?.trim();
  if (!facilityId) {
    throw new OperationOutcomeError(badRequest('facilityId is required.'));
  }

  const period = params.period?.trim() || toKhisWeekPeriod(new Date());
  if (!/^\d{4}W\d{2}$/.test(period)) {
    throw new OperationOutcomeError(badRequest(`Invalid period format "${period}". Expected YYYYWnn (e.g. 2026W24).`));
  }

  const correlationId = randomUUID();
  const result = await handleKhisWeeklyExport({
    ctx,
    period,
    facilityId,
    correlationId,
    dryRun: params.dryRun ?? false,
  });

  return [allOk, buildOutputParameters(khisWeeklyExportOperation, result)];
}
