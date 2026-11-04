// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, createReference, normalizeErrorString, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Condition, OperationDefinition, Task } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { escalateKenyaIhrNotification, runKenyaIhrAssessment } from '../../country-pack/kenya/ihr';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const ihrAssessmentOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'condition-ihr-assessment',
  name: 'IhrAssessment',
  title: 'IHR (2005) Annex 2 assessment and WHO notification report',
  status: 'active',
  kind: 'operation',
  code: 'ihr-assessment',
  resource: ['Condition'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'seriousImpact', type: 'boolean', min: 0, max: '1' },
    { use: 'in', name: 'unusualOrUnexpected', type: 'boolean', min: 0, max: '1' },
    { use: 'in', name: 'internationalSpread', type: 'boolean', min: 0, max: '1' },
    { use: 'in', name: 'travelOrTradeRestrictions', type: 'boolean', min: 0, max: '1' },
    { use: 'in', name: 'travelHistory', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'controlMeasures', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'caseCount', type: 'integer', min: 0, max: '1' },
    { use: 'in', name: 'deathCount', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'category', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'disease', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'notifiable', type: 'boolean', min: 1, max: '1' },
    { use: 'out', name: 'yesCount', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'rationale', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'report', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'reportJson', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 0, max: '1' },
  ],
};

interface IhrAssessmentParameters {
  readonly seriousImpact?: boolean;
  readonly unusualOrUnexpected?: boolean;
  readonly internationalSpread?: boolean;
  readonly travelOrTradeRestrictions?: boolean;
  readonly travelHistory?: string;
  readonly controlMeasures?: string;
  readonly caseCount?: number;
  readonly deathCount?: number;
}

export const ihrEscalateOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'task-ihr-escalate',
  name: 'IhrEscalate',
  title: 'Advance an IHR notification to its next escalation stage',
  status: 'active',
  kind: 'operation',
  code: 'ihr-escalate',
  resource: ['Task'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'note', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'stage', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 1, max: '1' },
  ],
};

function requireKenya(): ReturnType<typeof getAuthenticatedContext> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  return ctx;
}

/**
 * Handles Condition/:id/$ihr-assessment.
 * @param req - The FHIR request.
 * @returns The IHR decision and, if notifiable, the report and escalation Task.
 */
export async function ihrAssessmentHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireKenya();
  // Read with the caller's repo so access policies apply
  const condition = await ctx.repo.readResource<Condition>('Condition', req.params.id);
  const params = parseInputParameters<IhrAssessmentParameters>(ihrAssessmentOperation, req);

  let result;
  try {
    result = await runKenyaIhrAssessment(ctx, condition, params, params);
  } catch (err) {
    throw new OperationOutcomeError(badRequest(normalizeErrorString(err)));
  }

  return [
    allOk,
    buildOutputParameters(ihrAssessmentOperation, {
      category: result.decision.category,
      disease: result.diseaseDisplay,
      notifiable: result.decision.notifiable,
      yesCount: result.decision.yesCount,
      rationale: result.decision.rationale,
      report: result.report ? createReference(result.report) : undefined,
      reportJson: result.reportJson,
      task: result.notificationTask ? createReference(result.notificationTask) : undefined,
    }),
  ];
}

/**
 * Handles Task/:id/$ihr-escalate.
 * @param req - The FHIR request.
 * @returns The new escalation stage.
 */
export async function ihrEscalateHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireKenya();
  const task = await ctx.repo.readResource<Task>('Task', req.params.id);
  const params = parseInputParameters<{ note?: string }>(ihrEscalateOperation, req);

  let updated;
  try {
    updated = await escalateKenyaIhrNotification(ctx, task, params.note);
  } catch (err) {
    throw new OperationOutcomeError(badRequest(normalizeErrorString(err)));
  }

  return [
    allOk,
    buildOutputParameters(ihrEscalateOperation, {
      stage: updated.businessStatus?.text,
      task: createReference(updated),
    }),
  ];
}
