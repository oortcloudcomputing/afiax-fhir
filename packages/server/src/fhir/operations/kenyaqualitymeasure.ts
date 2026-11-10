// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// POST Measure/$kenya-evaluate-measure: calculates a Kenya quality measure for a facility and
// period, saves the MeasureReport (Kenya Core profile) and a CSV export (DHA FUNC-QUAL-001).
import {
  AccessPolicyInteraction,
  allOk,
  badRequest,
  createReference,
  forbidden,
  OperationOutcomeError,
  resolveId,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { OperationDefinition, Organization, Reference } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import {
  buildKenyaMeasureCsv,
  evaluateKenyaQualityMeasure,
  KenyaQualityMeasures,
  saveKenyaMeasureExport,
} from '../../country-pack/kenya/quality-measures';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const kenyaEvaluateMeasureOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'measure-kenya-evaluate-measure',
  name: 'KenyaEvaluateMeasure',
  title: 'Calculate a Kenya quality measure for a facility and period (DHA FUNC-QUAL-001)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-evaluate-measure',
  resource: ['Measure'],
  system: false,
  type: true,
  instance: false,
  affectsState: true,
  parameter: [
    {
      use: 'in',
      name: 'measure',
      type: 'code',
      min: 0,
      max: '1',
      documentation: `Measure id. Default and currently only: ${KenyaQualityMeasures[0].id}`,
    },
    { use: 'in', name: 'facility', type: 'Reference', min: 1, max: '1' },
    { use: 'in', name: 'periodStart', type: 'date', min: 1, max: '1' },
    { use: 'in', name: 'periodEnd', type: 'date', min: 1, max: '1' },
    { use: 'out', name: 'measureReport', type: 'Reference', min: 1, max: '1' },
    {
      use: 'out',
      name: 'export',
      type: 'Reference',
      min: 1,
      max: '1',
      documentation: 'CSV export (DocumentReference)',
    },
    { use: 'out', name: 'numerator', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'denominator', type: 'integer', min: 1, max: '1' },
    { use: 'out', name: 'score', type: 'decimal', min: 0, max: '1', documentation: 'Proportion, 0 to 1' },
  ],
};

interface EvaluateParameters {
  readonly measure?: string;
  readonly facility: Reference<Organization>;
  readonly periodStart: string;
  readonly periodEnd: string;
}

/**
 * Handles POST Measure/$kenya-evaluate-measure. For staff who may create MeasureReports.
 * @param req - The FHIR request.
 * @returns References to the MeasureReport and its CSV export, with the counts and score.
 */
export async function kenyaEvaluateMeasureHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  if (!ctx.repo.supportsInteraction(AccessPolicyInteraction.CREATE, 'MeasureReport')) {
    throw new OperationOutcomeError(forbidden);
  }
  const params = parseInputParameters<EvaluateParameters>(kenyaEvaluateMeasureOperation, req);
  const definition = KenyaQualityMeasures.find((m) => m.id === (params.measure ?? KenyaQualityMeasures[0].id));
  if (!definition) {
    throw new OperationOutcomeError(
      badRequest(`Unknown measure. Available: ${KenyaQualityMeasures.map((m) => m.id).join(', ')}`)
    );
  }
  const facilityId = resolveId(params.facility);
  if (!facilityId || !params.facility.reference?.startsWith('Organization/')) {
    throw new OperationOutcomeError(badRequest('facility must reference an Organization'));
  }
  // Read as the caller, so their access policy decides which facilities they may report on
  const facility = await ctx.repo.readResource<Organization>('Organization', facilityId);

  let evaluation: Awaited<ReturnType<typeof evaluateKenyaQualityMeasure>>;
  try {
    evaluation = await evaluateKenyaQualityMeasure(ctx, definition, facility, {
      start: params.periodStart,
      end: params.periodEnd,
    });
  } catch (err) {
    if (err instanceof Error && /must (be|not)/.test(err.message)) {
      throw new OperationOutcomeError(badRequest(err.message));
    }
    throw err;
  }
  const { report, result } = evaluation;
  const csv = buildKenyaMeasureCsv(definition, facility, report, result);
  const exported = await saveKenyaMeasureExport(ctx, facility, report, csv, definition);
  const score = report.group?.[0]?.measureScore?.value;

  return [
    allOk,
    buildOutputParameters(kenyaEvaluateMeasureOperation, {
      measureReport: createReference(report),
      export: createReference(exported),
      numerator: result.numerator.length,
      denominator: result.denominator.length,
      ...(score === undefined ? {} : { score }),
    }),
  ];
}
