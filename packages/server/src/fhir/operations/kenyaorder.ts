// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  allOk,
  badRequest,
  createReference,
  KenyaAllergyCodeSystem,
  KenyaHealthProductSystem,
  KenyaIcd11System,
  KenyaIchiSystem,
  KenyaInvestigationSystem,
  KenyaShaInterventionSystem,
  normalizeErrorString,
  OperationOutcomeError,
  serverError,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Coding, Encounter, OperationDefinition, ValueSet } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type { KnhtsSearchOptions, KnhtsSource } from '../../country-pack/kenya/knhts';
import { KnhtsSources, searchKnhtsConcepts } from '../../country-pack/kenya/knhts';
import type { KenyaOrderInput } from '../../country-pack/kenya/orders';
import { placeKenyaOrder } from '../../country-pack/kenya/orders';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const kenyaOrderOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'encounter-kenya-order',
  name: 'KenyaOrder',
  title: 'Place an order in an encounter: route it to the department and bill it (Kenya CPOE)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-order',
  resource: ['Encounter'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'category', type: 'code', min: 1, max: '1' },
    { use: 'in', name: 'code', type: 'Coding', min: 1, max: '1' },
    { use: 'in', name: 'priority', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'note', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'dosageText', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'quantity', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'durationDays', type: 'integer', min: 0, max: '1' },
    { use: 'in', name: 'overrideReason', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'order', type: 'Reference', min: 1, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 1, max: '1' },
    { use: 'out', name: 'chargeItem', type: 'Reference', min: 1, max: '1' },
  ],
};

/**
 * Handles POST Encounter/:id/$kenya-order.
 * @param req - The FHIR request.
 * @returns References to the order, its department Task and its ChargeItem.
 */
export async function kenyaOrderHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  const encounter = await ctx.repo.readResource<Encounter>('Encounter', req.params.id);
  const params = parseInputParameters<Omit<KenyaOrderInput, 'code'> & { code?: Coding }>(kenyaOrderOperation, req);
  if (!params.code) {
    throw new OperationOutcomeError(badRequest('Missing required parameter "code"'));
  }
  const result = await placeKenyaOrder(ctx, encounter, { ...params, code: params.code });
  return [
    allOk,
    buildOutputParameters(kenyaOrderOperation, {
      order: createReference(result.order),
      task: createReference(result.task),
      chargeItem: createReference(result.chargeItem),
    }),
  ];
}

/** What the order and allergy pickers search for, and where in KNHTS. */
const knhtsSearchKinds: Record<string, { source: KnhtsSource; system: string; options: KnhtsSearchOptions }> = {
  // Prescribe by generic name and strength (HPT generic concepts, GE...)
  medication: {
    source: KnhtsSources.healthProducts,
    system: KenyaHealthProductSystem,
    options: { codePrefixes: ['GE'] },
  },
  // Active ingredients (HPT AC...), for allergies
  ingredient: {
    source: KnhtsSources.healthProducts,
    system: KenyaHealthProductSystem,
    options: { codePrefixes: ['AC'] },
  },
  laboratory: {
    source: KnhtsSources.investigations,
    system: KenyaInvestigationSystem,
    options: { extras: { domain: 'Laboratory' }, codePrefixes: ['INV-'] },
  },
  radiology: {
    source: KnhtsSources.investigations,
    system: KenyaInvestigationSystem,
    options: { extras: { domain: 'Imaging' }, codePrefixes: ['INV-'] },
  },
  intervention: { source: KnhtsSources.ichi, system: KenyaIchiSystem, options: {} },
  allergy: { source: KnhtsSources.allergyCodes, system: KenyaAllergyCodeSystem, options: {} },
  diagnosis: { source: KnhtsSources.icd11, system: KenyaIcd11System, options: {} },
  // SHA benefit packages and interventions, for SHA claim lines
  'sha-intervention': { source: KnhtsSources.shaInterventions, system: KenyaShaInterventionSystem, options: {} },
};

/**
 * Handles GET $knhts-search?kind=medication&filter=amox: searches KNHTS for the order, allergy and
 * diagnosis pickers, and returns a ValueSet expansion.
 * @param req - The FHIR request.
 * @returns The ValueSet.
 */
export async function knhtsSearchHandler(req: FhirRequest): Promise<FhirResponse> {
  const kind = knhtsSearchKinds[String(req.query.kind ?? '')];
  if (!kind) {
    throw new OperationOutcomeError(
      badRequest(`Parameter "kind" must be one of: ${Object.keys(knhtsSearchKinds).join(', ')}`)
    );
  }
  const filter = String(req.query.filter ?? '').trim();
  if (filter.length < 2) {
    throw new OperationOutcomeError(badRequest('Parameter "filter" needs at least 2 characters'));
  }
  const count = Number(req.query.count ?? 20) || 20;
  let results;
  try {
    results = await searchKnhtsConcepts(kind.source, filter, { ...kind.options, count });
  } catch (err) {
    throw new OperationOutcomeError(serverError(new Error(`KNHTS is unavailable: ${normalizeErrorString(err)}`)));
  }
  const valueSet: ValueSet = {
    resourceType: 'ValueSet',
    status: 'active',
    expansion: {
      timestamp: new Date().toISOString(),
      contains: results.map((r) => ({ system: kind.system, code: r.code, display: r.display })),
    },
  };
  return [allOk, valueSet];
}
