// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Claim, OperationDefinition, Organization, Project, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { handleRecordInsurancePayment } from '../../country-pack/kenya/record-insurance-payment';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const recordInsurancePaymentOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'claim-record-insurance-payment',
  name: 'RecordInsurancePayment',
  title: 'Record Private Insurer Payment',
  status: 'active',
  kind: 'operation',
  code: 'record-insurance-payment',
  resource: ['Claim'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'claim', type: 'Reference', min: 0, max: '1' },
    { use: 'in', name: 'insurerOrganization', type: 'Reference', min: 1, max: '1' },
    { use: 'in', name: 'approvalCode', type: 'string', min: 1, max: '1' },
    { use: 'in', name: 'approvedAmount', type: 'decimal', min: 1, max: '1' },
    { use: 'in', name: 'currency', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'notes', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'correlationId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'approvedAmount', type: 'decimal', min: 1, max: '1' },
    { use: 'out', name: 'currency', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'insurerName', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'patientDue', type: 'decimal', min: 0, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'erpNextPaymentEntry', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'claimResponseReference', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 0, max: '1' },
  ],
};

interface RecordInsurancePaymentParameters {
  readonly claim?: Reference<Claim>;
  readonly insurerOrganization?: Reference<Organization>;
  readonly approvalCode?: string;
  readonly approvedAmount?: number;
  readonly currency?: string;
  readonly notes?: string;
}

export async function recordInsurancePaymentHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<RecordInsurancePaymentParameters>(recordInsurancePaymentOperation, req);

  // Resolve Claim.
  let claim: Claim & { id: string };
  if (req.params.id) {
    claim = await ctx.repo.readResource<Claim>('Claim', req.params.id) as Claim & { id: string };
  } else if (params.claim?.reference) {
    claim = await ctx.repo.readReference<Claim>(params.claim) as Claim & { id: string };
  } else {
    throw new OperationOutcomeError(badRequest('Must call this operation on a Claim instance or include a claim reference.'));
  }

  // Resolve insurer Organization.
  if (!params.insurerOrganization?.reference) {
    throw new OperationOutcomeError(badRequest('insurerOrganization is required.'));
  }
  const insurerOrganization = await ctx.repo.readReference<Organization>(params.insurerOrganization) as Organization & { id: string };

  // Validate required inputs.
  if (!params.approvalCode) {
    throw new OperationOutcomeError(badRequest('approvalCode is required.'));
  }
  if (params.approvedAmount === undefined || params.approvedAmount === null) {
    throw new OperationOutcomeError(badRequest('approvedAmount is required.'));
  }

  // Load Project for ERPNext credentials.
  const project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id) as Project & { id: string };

  const result = await handleRecordInsurancePayment({
    ctx,
    claim,
    insurerOrganization,
    approvalCode: params.approvalCode,
    approvedAmount: params.approvedAmount,
    currency: params.currency ?? 'KES',
    notes: params.notes,
    correlationId: randomUUID(),
    project,
  });

  return [allOk, buildOutputParameters(recordInsurancePaymentOperation, result)];
}
