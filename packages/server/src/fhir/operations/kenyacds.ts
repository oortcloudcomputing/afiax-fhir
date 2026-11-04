// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { KenyaCdsAlert } from '@medplum/core';
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { MedicationRequest, OperationDefinition, Parameters, ParametersParameter } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import { checkKenyaMedicationRequest } from '../../country-pack/kenya/cds';
import { getProjectCountryPack } from '../../country-pack/registry';

export const kenyaCdsCheckOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'medicationrequest-cds-check',
  name: 'KenyaCdsCheck',
  title: 'Check a draft medication order against the patient record (Kenya CDS)',
  status: 'active',
  kind: 'operation',
  code: 'cds-check',
  resource: ['MedicationRequest'],
  system: false,
  type: true,
  instance: false,
  affectsState: false,
  parameter: [
    { use: 'in', name: 'resource', type: 'MedicationRequest', min: 1, max: '1' },
    {
      use: 'out',
      name: 'alert',
      type: 'string',
      min: 0,
      max: '*',
      documentation:
        'One per alert; parts: id, severity, category, title, detail, recommendation, evidence, implicated.',
    },
  ],
};

function alertToParameter(alert: KenyaCdsAlert): ParametersParameter {
  return {
    name: 'alert',
    part: [
      { name: 'id', valueString: alert.id },
      { name: 'severity', valueCode: alert.severity },
      { name: 'category', valueCode: alert.category },
      { name: 'title', valueString: alert.title },
      { name: 'detail', valueString: alert.detail },
      { name: 'recommendation', valueString: alert.recommendation },
      { name: 'evidence', valueString: alert.evidence },
      ...alert.implicated.map((reference) => ({ name: 'implicated', valueReference: { reference } })),
    ],
  };
}

/**
 * Handles POST MedicationRequest/$cds-check: returns the CDS alerts a draft order would trigger,
 * without saving it. Accepts a Parameters body with a "resource" parameter, or the MedicationRequest
 * itself.
 * @param req - The FHIR request.
 * @returns Parameters with one "alert" per alert.
 */
export async function kenyaCdsCheckHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  const body = req.body as Parameters | MedicationRequest | undefined;
  const request =
    body?.resourceType === 'Parameters'
      ? (body.parameter?.find((p) => p.name === 'resource')?.resource as MedicationRequest | undefined)
      : body;
  if (request?.resourceType !== 'MedicationRequest') {
    throw new OperationOutcomeError(badRequest('Expected a MedicationRequest'));
  }
  if (!request.subject?.reference) {
    throw new OperationOutcomeError(badRequest('MedicationRequest.subject is required'));
  }
  // The caller must be able to read the patient
  await ctx.repo.readReference(request.subject);

  const alerts = await checkKenyaMedicationRequest(ctx.systemRepo, ctx.project.id, request);
  return [allOk, { resourceType: 'Parameters', parameter: alerts.map(alertToParameter) }];
}
