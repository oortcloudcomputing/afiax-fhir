// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// POST /fhir/R4/$kenya-hie-callbacks (project admins, Kenya): registers this project's DHA HIE
// status callbacks with DHA, or lists what DHA has registered. See
// country-pack/kenya/hie-callbacks.ts for DHA's rules and kenya-hie/routes.ts for the receiver.
//
// register: creates (or reuses) the project's secret callback path, then registers one endpoint and
// its status_changed operation per entity type at DHA, with auth_type none. DHA allows one endpoint
// per entity type per facility, so registering twice fails at DHA; list first.
import { allOk, badRequest, forbidden, getKenyaHieEnvironment, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Project } from '@medplum/fhirtypes';
import { randomBytes } from 'node:crypto';
import { getConfig } from '../../config/loader';
import { getAuthenticatedContext } from '../../context';
import { getKenyaAfyaLinkCredentials } from '../../country-pack/kenya/afyalink';
import type { KenyaHieCallbackEntityType } from '../../country-pack/kenya/hie-callbacks';
import {
  KenyaHieCallbackEntityTypes,
  listKenyaHieCallbacks,
  registerKenyaHieCallbacks,
} from '../../country-pack/kenya/hie-callbacks';
import { getProjectCountryPack } from '../../country-pack/registry';
import { KenyaHieCallbackSecretName } from '../../kenya-hie/routes';
import { getGlobalSystemRepo } from '../repo';
import { callHie } from './kenyashavisit';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const kenyaHieCallbacksOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'kenya-hie-callbacks',
  name: 'KenyaHieCallbacks',
  title: 'Register or list DHA HIE status callbacks for this project (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-hie-callbacks',
  system: true,
  type: false,
  instance: false,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'action', type: 'code', min: 1, max: '1', documentation: 'register | list' },
    { use: 'in', name: 'facilityFrCode', type: 'string', min: 0, max: '1' },
    {
      use: 'in',
      name: 'entityType',
      type: 'code',
      min: 0,
      max: '*',
      documentation: 'claim | preauth | authorization (default: all three)',
    },
    { use: 'out', name: 'result', type: 'string', min: 1, max: '1', documentation: 'The DHA result, as JSON.' },
  ],
};

interface CallbackParameters {
  readonly action: string;
  readonly facilityFrCode?: string;
  readonly entityType?: string[] | string;
}

/**
 * The project's callback path secret: the stored one, or a new one saved as a project system secret.
 * @param project - The project.
 * @returns The secret.
 */
async function getOrCreateCallbackSecret(project: Project & { id: string }): Promise<string> {
  const existing = project.systemSecret?.find((s) => s.name === KenyaHieCallbackSecretName)?.valueString;
  if (existing) {
    return existing;
  }
  const secret = randomBytes(32).toString('hex');
  const repo = getGlobalSystemRepo();
  const current = await repo.readResource<Project>('Project', project.id);
  await repo.updateResource<Project>(
    {
      ...current,
      systemSecret: [
        ...(current.systemSecret ?? []).filter((s) => s.name !== KenyaHieCallbackSecretName),
        { name: KenyaHieCallbackSecretName, valueString: secret },
      ],
    },
    { ifMatch: current.meta?.versionId }
  );
  return secret;
}

/**
 * Handles POST /fhir/R4/$kenya-hie-callbacks.
 * @param req - The FHIR request.
 * @returns The DHA result as JSON. The receiving URLs contain the secret and are not returned.
 */
export async function kenyaHieCallbacksHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  if (!ctx.project.superAdmin && !ctx.membership.admin) {
    throw new OperationOutcomeError(forbidden);
  }
  const params = parseInputParameters<CallbackParameters>(kenyaHieCallbacksOperation, req);
  const credentials = getKenyaAfyaLinkCredentials(ctx.project);
  const facilityFrCode = params.facilityFrCode?.trim() || credentials.facilityId;
  if (!facilityFrCode) {
    throw new OperationOutcomeError(badRequest("facilityFrCode is required (the facility's FID-... code)"));
  }

  let result: unknown;
  if (params.action === 'list') {
    const listed = await callHie(() => listKenyaHieCallbacks(credentials, facilityFrCode));
    // DHA echoes base_url, which holds the secret path: never return it.
    const secret = ctx.project.systemSecret?.find((s) => s.name === KenyaHieCallbackSecretName)?.valueString;
    const json = JSON.stringify(listed ?? null);
    result = JSON.parse(secret ? json.split(secret).join('[secret]') : json);
  } else if (params.action === 'register') {
    const requested = (Array.isArray(params.entityType) ? params.entityType : [params.entityType])
      .filter((t): t is string => !!t)
      .map((t) => t.trim().toLowerCase());
    for (const t of requested) {
      if (!(KenyaHieCallbackEntityTypes as readonly string[]).includes(t)) {
        throw new OperationOutcomeError(badRequest('entityType must be claim, preauth or authorization'));
      }
    }
    const secret = await getOrCreateCallbackSecret(ctx.project);
    const serverBaseUrl = getConfig().baseUrl.replace(/\/+$/, '');
    const registrations = await callHie(() =>
      registerKenyaHieCallbacks(credentials, {
        baseUrl: `${serverBaseUrl}/kenya/hie/callbacks/${ctx.project.id}/${secret}`,
        facilityFrCode,
        environment: getKenyaHieEnvironment(ctx.project) === 'production' ? 'production' : 'sandbox',
        ...(requested.length ? { entityTypes: requested as KenyaHieCallbackEntityType[] } : {}),
      })
    );
    // The URLs hold the secret path; report only that they were registered.
    result = registrations.map(({ entityType, endpointId, operationId }) => ({ entityType, endpointId, operationId }));
  } else {
    throw new OperationOutcomeError(badRequest('action must be register or list'));
  }

  return [allOk, buildOutputParameters(kenyaHieCallbacksOperation, { result: JSON.stringify(result) })];
}
