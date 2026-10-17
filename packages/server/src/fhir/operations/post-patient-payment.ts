// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Claim, OperationDefinition, Project, Reference } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import { getAuthenticatedContext } from '../../context';
import { getConfig } from '../../config/loader';
import type { KenyaPatientPaymentMethod } from '@medplum/core';
import { handlePostPatientPayment } from '../../country-pack/kenya/post-patient-payment';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const postPatientPaymentOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'claim-post-patient-payment',
  name: 'PostPatientPayment',
  title: 'Post Patient Payment',
  status: 'active',
  kind: 'operation',
  code: 'post-patient-payment',
  resource: ['Claim'],
  system: false,
  type: true,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'claim', type: 'Reference', min: 0, max: '1' },
    { use: 'in', name: 'method', type: 'code', min: 1, max: '1' },
    { use: 'in', name: 'amount', type: 'decimal', min: 1, max: '1' },
    { use: 'in', name: 'currency', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'phone', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'transactionRef', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'notes', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'status', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'correlationId', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'method', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'amount', type: 'decimal', min: 1, max: '1' },
    { use: 'out', name: 'currency', type: 'code', min: 1, max: '1' },
    { use: 'out', name: 'patientDue', type: 'decimal', min: 0, max: '1' },
    { use: 'out', name: 'message', type: 'string', min: 1, max: '1' },
    { use: 'out', name: 'erpNextPaymentEntry', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'checkoutRequestId', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'customerMessage', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'paymentRequestId', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'paymentUrl', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'paymentNoticeReference', type: 'Reference', min: 0, max: '1' },
    { use: 'out', name: 'task', type: 'Reference', min: 0, max: '1' },
  ],
};

const validMethods: KenyaPatientPaymentMethod[] = ['cash', 'card', 'mpesa-manual', 'mpesa-stk', 'afiax-pay'];

interface PostPatientPaymentParameters {
  readonly claim?: Reference<Claim>;
  readonly method?: string;
  readonly amount?: number;
  readonly currency?: string;
  readonly phone?: string;
  readonly transactionRef?: string;
  readonly notes?: string;
}

export async function postPatientPaymentHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  const params = parseInputParameters<PostPatientPaymentParameters>(postPatientPaymentOperation, req);

  // Resolve Claim.
  let claim: Claim & { id: string };
  if (req.params.id) {
    claim = await ctx.repo.readResource<Claim>('Claim', req.params.id) as Claim & { id: string };
  } else if (params.claim?.reference) {
    claim = await ctx.repo.readReference<Claim>(params.claim) as Claim & { id: string };
  } else {
    throw new OperationOutcomeError(badRequest('Must call this operation on a Claim instance or include a claim reference.'));
  }

  // Validate method.
  if (!params.method || !validMethods.includes(params.method as KenyaPatientPaymentMethod)) {
    throw new OperationOutcomeError(
      badRequest(`method must be one of: ${validMethods.join(', ')}. Got: "${params.method ?? ''}".`)
    );
  }

  if (params.amount === undefined || params.amount === null || params.amount <= 0) {
    throw new OperationOutcomeError(badRequest('amount must be a positive number.'));
  }

  const project = await ctx.systemRepo.readResource<Project>('Project', ctx.project.id) as Project & { id: string };
  // Callback URLs are built from server config, never from request headers, so a caller
  // cannot redirect payment gateway callbacks to a host they control.
  const baseUrl = getConfig().baseUrl.replace(/\/+$/, '');

  const result = await handlePostPatientPayment({
    ctx,
    claim,
    method: params.method as KenyaPatientPaymentMethod,
    amount: params.amount,
    currency: params.currency ?? 'KES',
    phone: params.phone,
    transactionRef: params.transactionRef,
    notes: params.notes,
    correlationId: randomUUID(),
    project,
    baseUrl,
  });

  return [allOk, buildOutputParameters(postPatientPaymentOperation, result)];
}
