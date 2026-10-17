// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import {
  allOk,
  badRequest,
  buildKenyaNationalClaimSubmissionExtension,
  createReference,
  OperationOutcomeError,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { AuditEvent, Claim, OperationDefinition, Reference, Task } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildKenyaNationalClaimBundle } from '../../country-pack/kenya/submit-national-claim';
import {
  getKenyaShaClaimsCredentials,
  hasKenyaShaClaimsCredentials,
  submitKenyaShaClaimBundle,
} from '../../country-pack/kenya/sha';
import type { SubmitNationalClaimResult } from '../../country-pack/types';
import {
  AuditEventOutcome,
  createAuditEvent,
  OperationInteraction,
  RestfulOperationType,
} from '../../util/auditevent';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const requestPreauthorizationOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'claim-request-preauthorization',
  name: 'RequestPreauthorization',
  title: 'Request SHA Pre-Authorization',
  status: 'active',
  kind: 'operation',
  code: 'request-preauthorization',
  resource: ['Claim'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'claim', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'correlationId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'nextState', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'countryPack', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'shaClaimsEnvironment', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'submissionEndpoint', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'statusTrackingEndpoint', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'responseStatusCode', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'bundleId', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'bundleEntryCount', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'rawBundle', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'rawResponse', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 0, max: '1' },
  ],
};

interface RequestPreauthorizationParameters {
  readonly claim?: Reference<Claim>;
}

export async function requestPreauthorizationHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const countryPack = getProjectCountryPack(ctx.project);
  if (!countryPack || countryPack.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('Pre-authorization requires the Kenya country pack.'));
  }

  const claim = await getClaimForPreauth(req);
  const correlationId = randomUUID();
  const task = await createPreauthTask(claim, correlationId);
  const result = await requestKenyaPreauthorization(claim, correlationId);
  const updatedTask = await completePreauthTask(task, result);
  const updatedClaim = await persistPreauthResult(claim, updatedTask, result);
  await createPreauthAuditEvent(updatedTask, updatedClaim, result);

  return [allOk, buildOutputParameters(requestPreauthorizationOperation, { ...result, task: createReference(updatedTask) })];
}

async function getClaimForPreauth(req: FhirRequest): Promise<WithId<Claim>> {
  const ctx = getAuthenticatedContext();
  const { id } = req.params;
  if (id) {
    return ctx.repo.readResource<Claim>('Claim', id);
  }

  const params = parseInputParameters<RequestPreauthorizationParameters>(requestPreauthorizationOperation, req);
  if (params.claim?.reference) {
    return ctx.repo.readReference<Claim>(params.claim);
  }

  throw new OperationOutcomeError(badRequest('Must call this operation on a Claim instance or include a claim reference.'));
}

async function requestKenyaPreauthorization(
  claim: WithId<Claim>,
  correlationId: string
): Promise<SubmitNationalClaimResult> {
  const ctx = getAuthenticatedContext();

  // Build the bundle with Claim.use overridden to "preauthorization"
  const claimWithPreauth: WithId<Claim> = { ...claim, use: 'preauthorization' };
  const { bundle, bundleId, bundleEntryCount, shaClaimsEnvironment, submissionEndpoint, statusTrackingEndpoint } =
    await buildKenyaNationalClaimBundle({ ctx, claim: claimWithPreauth, correlationId });

  if (!hasKenyaShaClaimsCredentials(ctx.project)) {
    return {
      status: 'prepared',
      correlationId,
      message: 'SHA pre-authorization bundle prepared — credentials not yet configured.',
      nextState: 'ready-for-sha-preauth-transport',
      countryPack: 'kenya',
      shaClaimsEnvironment,
      submissionEndpoint,
      statusTrackingEndpoint,
      bundleId,
      bundleEntryCount,
      rawBundle: JSON.stringify(bundle, null, 2),
    };
  }

  try {
    const credentials = getKenyaShaClaimsCredentials(ctx.project);
    const submission = await submitKenyaShaClaimBundle(credentials, bundle, bundleId);
    return {
      status: 'submitted',
      correlationId,
      message: 'SHA pre-authorization bundle submitted successfully.',
      nextState: 'awaiting-sha-preauth-decision',
      countryPack: 'kenya',
      shaClaimsEnvironment,
      submissionEndpoint: submission.submissionEndpoint,
      statusTrackingEndpoint: submission.statusTrackingEndpoint,
      responseStatusCode: submission.responseStatusCode,
      bundleId,
      bundleEntryCount,
      rawBundle: JSON.stringify(bundle, null, 2),
      rawResponse: submission.rawResponse,
    };
  } catch (err) {
    return {
      status: 'error',
      correlationId,
      message: String(err),
      nextState: 'retry-or-review-sha-credentials',
      countryPack: 'kenya',
      shaClaimsEnvironment,
      submissionEndpoint,
      statusTrackingEndpoint,
    };
  }
}

async function createPreauthTask(claim: WithId<Claim>, correlationId: string): Promise<WithId<Task>> {
  const ctx = getAuthenticatedContext();
  return ctx.systemRepo.createResource<Task>({
    resourceType: 'Task',
    meta: { project: ctx.project.id },
    intent: 'order',
    status: 'requested',
    authoredOn: new Date().toISOString(),
    requester: ctx.profile as Task['requester'],
    focus: createReference(claim),
    description: `SHA pre-authorization for Claim/${claim.id}`,
    code: { text: 'request-preauthorization' },
    businessStatus: { text: 'requested' },
    identifier: [{ system: 'https://afiax.africa/identifier/correlation-id', value: correlationId }],
  });
}

async function completePreauthTask(task: WithId<Task>, result: SubmitNationalClaimResult): Promise<WithId<Task>> {
  const ctx = getAuthenticatedContext();
  const end = new Date().toISOString();
  return ctx.systemRepo.updateResource<Task>({
    ...task,
    status: result.status === 'error' ? 'failed' : 'completed',
    businessStatus: { text: result.status },
    lastModified: end,
    executionPeriod: { start: task.authoredOn, end },
    output: [
      { type: { text: 'correlationId' }, valueString: result.correlationId },
      { type: { text: 'status' }, valueString: result.status },
      { type: { text: 'message' }, valueString: result.message },
      { type: { text: 'nextState' }, valueString: result.nextState },
      ...(result.bundleId ? [{ type: { text: 'bundleId' }, valueString: result.bundleId }] : []),
      ...(result.submissionEndpoint ? [{ type: { text: 'submissionEndpoint' }, valueString: result.submissionEndpoint }] : []),
      ...(result.statusTrackingEndpoint ? [{ type: { text: 'statusTrackingEndpoint' }, valueString: result.statusTrackingEndpoint }] : []),
      ...(result.responseStatusCode !== undefined ? [{ type: { text: 'responseStatusCode' }, valueInteger: result.responseStatusCode }] : []),
    ],
  });
}

async function persistPreauthResult(
  claim: WithId<Claim>,
  task: WithId<Task>,
  result: SubmitNationalClaimResult
): Promise<WithId<Claim>> {
  const ctx = getAuthenticatedContext();
  const submittedAt = new Date().toISOString();
  const preauthExtensionUrl = 'https://afiax.africa/fhir/StructureDefinition/kenya-sha-preauthorization';
  const extension = buildKenyaNationalClaimSubmissionExtension(result, submittedAt, createReference(task));
  // Store as a preauth-specific extension (different URL from claim submission)
  const preauthExtension = { ...extension, url: preauthExtensionUrl };
  const otherExtensions = claim.extension?.filter((ext) => ext.url !== preauthExtensionUrl) ?? [];

  return ctx.systemRepo.updateResource<Claim>({
    ...claim,
    extension: [...otherExtensions, preauthExtension],
  });
}

async function createPreauthAuditEvent(
  task: WithId<Task>,
  claim: WithId<Claim>,
  result: SubmitNationalClaimResult
): Promise<void> {
  const ctx = getAuthenticatedContext();
  const outcome = result.status === 'error' ? AuditEventOutcome.MajorFailure : AuditEventOutcome.Success;

  const auditEvent = createAuditEvent(RestfulOperationType, OperationInteraction, ctx.project.id, ctx.profile, undefined, outcome, {
    description: result.message,
    resource: createReference(task),
  });

  auditEvent.entity = [
    ...(auditEvent.entity ?? []),
    { what: createReference(claim) },
  ];

  await ctx.systemRepo.createResource<AuditEvent>(auditEvent);
}
