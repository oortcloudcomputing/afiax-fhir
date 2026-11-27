// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, createReference, notFound, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { MedicationRequest, OperationDefinition, Parameters, ParametersParameter, Patient } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type {
  KenyaDispenseInput,
  KenyaDispenseSafetyAlert,
  KenyaPrescriptionStatus,
} from '../../country-pack/kenya/dispense';
import {
  checkKenyaDispenseSafety,
  dispenseKenyaPrescription,
  findKenyaPrescriptionByCode,
  getKenyaPrescriptionStatus,
} from '../../country-pack/kenya/dispense';
import { getProjectCountryPack } from '../../country-pack/registry';
import { parseInputParameters } from './utils/parameters';

export const kenyaDispenseOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'medicationrequest-kenya-dispense',
  name: 'KenyaDispense',
  title: 'Dispense a prescription: checked, DHA ke-medication-dispense, version-checked running total',
  status: 'active',
  kind: 'operation',
  code: 'kenya-dispense',
  resource: ['MedicationRequest'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'quantity', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'note', type: 'string', min: 0, max: '1' },
    // The dispensing pharmacy when it is not the caller (Afiax Prescription Network chemists)
    { use: 'in', name: 'performer', type: 'Reference', min: 0, max: '1' },
    // The pharmacist's reason to dispense despite a high-severity safety alert
    { use: 'in', name: 'safetyOverride', type: 'string', min: 0, max: '1' },
  ],
};

function requireKenya(): ReturnType<typeof getAuthenticatedContext> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  return ctx;
}

function statusParameters(status: KenyaPrescriptionStatus): ParametersParameter[] {
  const out: ParametersParameter[] = [
    { name: 'state', valueCode: status.state },
    { name: 'dispensed', valueDecimal: status.dispensed },
  ];
  if (status.reason) {
    out.push({ name: 'reason', valueString: status.reason });
  }
  if (status.prescribed !== undefined) {
    out.push({ name: 'prescribed', valueDecimal: status.prescribed });
  }
  if (status.remaining !== undefined) {
    out.push({ name: 'remaining', valueDecimal: status.remaining });
  }
  return out;
}

function alertParameter(alert: KenyaDispenseSafetyAlert): ParametersParameter {
  const part: ParametersParameter[] = [
    { name: 'id', valueString: alert.id },
    { name: 'severity', valueCode: alert.severity },
    { name: 'category', valueCode: alert.category },
    { name: 'title', valueString: alert.title },
    { name: 'detail', valueString: alert.detail },
    { name: 'recommendation', valueString: alert.recommendation },
    { name: 'evidence', valueString: alert.evidence },
  ];
  if (alert.overridden) {
    part.push({ name: 'overridden', valueString: alert.overridden });
  }
  return { name: 'alert', part };
}

/**
 * Handles GET MedicationRequest/:id/$kenya-dispense-check: before dispensing, whether the
 * prescription can be dispensed and the safety alerts against the record as it stands now (each
 * high one with the override already recorded for it, if any).
 * @param req - The FHIR request.
 * @returns The status and the alerts.
 */
export async function kenyaDispenseCheckHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireKenya();
  const prescription = await ctx.repo.readResource<MedicationRequest>('MedicationRequest', req.params.id);
  const alerts = await checkKenyaDispenseSafety(ctx, prescription);
  const body: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      ...statusParameters(getKenyaPrescriptionStatus(prescription, new Date().toISOString().slice(0, 10))),
      ...alerts.map(alertParameter),
    ],
  };
  return [allOk, body];
}

/**
 * Handles POST MedicationRequest/:id/$kenya-dispense.
 * @param req - The FHIR request.
 * @returns The dispense, the prescription and what is left.
 */
export async function kenyaDispenseHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireKenya();
  const prescription = await ctx.repo.readResource<MedicationRequest>('MedicationRequest', req.params.id);
  const input = parseInputParameters<KenyaDispenseInput>(kenyaDispenseOperation, req);
  const result = await dispenseKenyaPrescription(ctx, prescription, input);
  const body: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'dispense', valueReference: createReference(result.dispense) },
      { name: 'prescription', valueReference: createReference(result.prescription) },
      ...statusParameters(result.status),
    ],
  };
  return [allOk, body];
}

/**
 * Handles GET MedicationRequest/$kenya-prescription-lookup?code=RX-...: finds a prescription by the
 * code on the printed prescription, and says whether it can be dispensed. Searches the caller's
 * project with the caller's access (between facilities: ADR-016 step 2b).
 * @param req - The FHIR request.
 * @returns The prescription, its patient and its status.
 */
export async function kenyaPrescriptionLookupHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = requireKenya();
  const code = String(req.query.code ?? '').trim();
  if (!code) {
    throw new OperationOutcomeError(badRequest('Missing required parameter "code"'));
  }
  const prescription = await findKenyaPrescriptionByCode(ctx, code);
  if (!prescription) {
    throw new OperationOutcomeError(notFound);
  }
  const patient = prescription.subject?.reference?.startsWith('Patient/')
    ? await ctx.repo.readReference<Patient>(prescription.subject as { reference: string }).catch(() => undefined)
    : undefined;
  const body: Parameters = {
    resourceType: 'Parameters',
    parameter: [
      { name: 'prescription', resource: prescription },
      ...(patient ? [{ name: 'patient', resource: patient }] : []),
      ...statusParameters(getKenyaPrescriptionStatus(prescription, new Date().toISOString().slice(0, 10))),
    ],
  };
  return [allOk, body];
}
