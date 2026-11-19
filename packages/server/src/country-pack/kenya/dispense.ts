// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Dispensing a Kenya e-prescription (ADR-016 step 2), on the server so it is checked and atomic:
// the prescription must be active and within its validity period; the quantity cannot exceed what is
// left; the MedicationDispense follows DHA's ke-medication-dispense profile (claimed only when it
// conforms); the running dispensed total is kept on the MedicationRequest, whose version is checked
// on update, so two pharmacists cannot fill the same prescription at once; a fully dispensed
// prescription becomes "completed" and its pharmacy Task is completed.

import type { WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  getReferenceString,
  KenyaDepartmentSystem,
  KenyaErxMedicationDispenseProfile,
  normalizeKenyaPrescriptionCode,
  KenyaPrescriptionCodeSystem,
  Operator,
  OperationOutcomeError,
} from '@medplum/core';
import type {
  Coding,
  Encounter,
  MedicationDispense,
  MedicationRequest,
  Patient,
  Practitioner,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';

/** Running total dispensed against a prescription (MedicationRequest extension, valueDecimal). */
export const KenyaDispensedQuantityExtensionUrl = 'https://afiax.africa/fhir/StructureDefinition/kenya-erx-dispensed-quantity';

/** HL7 v3 pharmacy supply types (MedicationDispense.type). */
export const PharmacySupplyTypeSystem = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';

const SupplyTypes: Record<'FF' | 'FFP' | 'FFC', Coding> = {
  FF: { system: PharmacySupplyTypeSystem, code: 'FF', display: 'First Fill' },
  FFP: { system: PharmacySupplyTypeSystem, code: 'FFP', display: 'First Fill - Part Fill' },
  FFC: { system: PharmacySupplyTypeSystem, code: 'FFC', display: 'First Fill - Complete' },
};

export type KenyaPrescriptionState = 'valid' | 'not-yet-valid' | 'expired' | 'dispensed' | 'cancelled' | 'stopped';

export interface KenyaPrescriptionStatus {
  readonly state: KenyaPrescriptionState;
  /** Why it cannot be dispensed, in words, when it cannot. */
  readonly reason?: string;
  readonly prescribed?: number;
  readonly dispensed: number;
  /** What is left to dispense; undefined when no quantity was prescribed. */
  readonly remaining?: number;
}

/**
 * Returns the quantity already dispensed against a prescription.
 * @param request - The MedicationRequest.
 * @returns The total dispensed.
 */
export function getKenyaDispensedQuantity(request: MedicationRequest): number {
  return request.extension?.find((e) => e.url === KenyaDispensedQuantityExtensionUrl)?.valueDecimal ?? 0;
}

/**
 * Whether a prescription can be dispensed today, and how much is left.
 * @param request - The MedicationRequest.
 * @param today - Today's date (YYYY-MM-DD).
 * @returns The status.
 */
export function getKenyaPrescriptionStatus(request: MedicationRequest, today: string): KenyaPrescriptionStatus {
  const prescribed = request.dispenseRequest?.quantity?.value;
  const dispensed = getKenyaDispensedQuantity(request);
  const remaining = prescribed === undefined ? undefined : Math.max(prescribed - dispensed, 0);
  const base = { prescribed, dispensed, remaining };
  if (request.status === 'completed' || (remaining !== undefined && remaining <= 0)) {
    return { ...base, state: 'dispensed', reason: 'This prescription has already been dispensed in full' };
  }
  if (request.status === 'cancelled' || request.status === 'entered-in-error') {
    return { ...base, state: 'cancelled', reason: 'This prescription was cancelled by the prescriber' };
  }
  if (request.status !== 'active') {
    return { ...base, state: 'stopped', reason: `This prescription is ${request.status}, not active` };
  }
  const validity = request.dispenseRequest?.validityPeriod;
  if (validity?.start && today < validity.start.slice(0, 10)) {
    return { ...base, state: 'not-yet-valid', reason: `This prescription is valid from ${validity.start.slice(0, 10)}` };
  }
  if (validity?.end && today > validity.end.slice(0, 10)) {
    return { ...base, state: 'expired', reason: `This prescription expired on ${validity.end.slice(0, 10)}` };
  }
  return { ...base, state: 'valid' };
}

/**
 * Finds a prescription in the caller's project by its prescription code.
 * @param ctx - The request context (the caller's repository: access policies apply).
 * @param input - The code as typed or scanned.
 * @returns The prescription, or undefined if there is none.
 */
export async function findKenyaPrescriptionByCode(
  ctx: Pick<AuthenticatedRequestContext, 'repo'>,
  input: string
): Promise<WithId<MedicationRequest> | undefined> {
  const code = normalizeKenyaPrescriptionCode(input);
  if (!code) {
    throw new OperationOutcomeError(badRequest('That is not a prescription code. Codes look like RX-7KQ2-M9XD-3T.'));
  }
  return ctx.repo.searchOne<MedicationRequest>({
    resourceType: 'MedicationRequest',
    filters: [{ code: 'identifier', operator: Operator.EQUALS, value: `${KenyaPrescriptionCodeSystem}|${code}` }],
  });
}

export interface KenyaDispenseInput {
  /** Quantity handed over now; defaults to everything left. */
  readonly quantity?: number;
  readonly note?: string;
}

export interface KenyaDispenseResult {
  readonly dispense: WithId<MedicationDispense>;
  readonly prescription: WithId<MedicationRequest>;
  readonly status: KenyaPrescriptionStatus;
}

/**
 * Lists what a MedicationDispense lacks for DHA's ke-medication-dispense profile (required elements only).
 * @param dispense - The MedicationDispense.
 * @returns The missing elements; empty when it conforms.
 */
export function getKenyaErxDispenseGaps(dispense: MedicationDispense): string[] {
  const gaps: string[] = [];
  const coding = dispense.medicationCodeableConcept?.coding?.[0];
  if (!coding?.system || !coding.code || !coding.display) {
    gaps.push('medication[x].coding (system, code, display)');
  }
  if (!dispense.subject) {
    gaps.push('subject');
  }
  if (!dispense.performer?.length) {
    gaps.push('performer');
  }
  if (!dispense.location) {
    gaps.push('location');
  }
  if (!dispense.authorizingPrescription?.length) {
    gaps.push('authorizingPrescription');
  }
  if (!dispense.type) {
    gaps.push('type');
  }
  if (dispense.quantity?.value === undefined) {
    gaps.push('quantity');
  }
  return gaps;
}

/**
 * Dispenses a prescription: checks it, records the MedicationDispense, updates the running total
 * (version-checked) and completes the prescription and its pharmacy Task when nothing is left.
 * @param ctx - The request context.
 * @param prescription - The MedicationRequest.
 * @param input - Quantity and note.
 * @returns The dispense, the updated prescription and its status.
 */
export async function dispenseKenyaPrescription(
  ctx: Pick<AuthenticatedRequestContext, 'repo' | 'profile'>,
  prescription: WithId<MedicationRequest>,
  input: KenyaDispenseInput
): Promise<KenyaDispenseResult> {
  const now = new Date().toISOString();
  const status = getKenyaPrescriptionStatus(prescription, now.slice(0, 10));
  if (status.state !== 'valid') {
    throw new OperationOutcomeError(badRequest(status.reason ?? 'This prescription cannot be dispensed'));
  }
  const quantity = input.quantity ?? status.remaining ?? prescription.dispenseRequest?.quantity?.value ?? 1;
  if (!(quantity > 0)) {
    throw new OperationOutcomeError(badRequest('Quantity must be greater than zero'));
  }
  if (status.remaining !== undefined && quantity > status.remaining) {
    throw new OperationOutcomeError(badRequest(`Only ${status.remaining} left to dispense on this prescription`));
  }
  const dispensedTotal = status.dispensed + quantity;
  const complete = status.remaining === undefined || dispensedTotal >= (status.prescribed ?? 0);
  const firstFill = status.dispensed === 0;
  // First fill of everything (FF), a part (FFP), or the last part of a part-filled prescription (FFC)
  let type = SupplyTypes.FFP;
  if (complete) {
    type = firstFill ? SupplyTypes.FF : SupplyTypes.FFC;
  }

  const encounter = prescription.encounter
    ? await ctx.repo.readReference<Encounter>(prescription.encounter).catch(() => undefined)
    : undefined;
  const location = encounter?.location?.[0]?.location;

  return ctx.repo.withTransaction(async () => {
    const dispense: MedicationDispense = {
      resourceType: 'MedicationDispense',
      identifier: prescription.identifier?.filter((i) => i.system === KenyaPrescriptionCodeSystem),
      status: 'completed',
      type: { coding: [type] },
      medicationCodeableConcept: prescription.medicationCodeableConcept,
      subject: prescription.subject as Reference<Patient>,
      context: prescription.encounter,
      performer: [{ actor: ctx.profile as Reference<Practitioner> }],
      location,
      authorizingPrescription: [createReference(prescription)],
      quantity: { ...prescription.dispenseRequest?.quantity, value: quantity },
      daysSupply: prescription.dispenseRequest?.expectedSupplyDuration,
      dosageInstruction: prescription.dosageInstruction,
      whenPrepared: now,
      whenHandedOver: now,
      note: input.note?.trim() ? [{ text: input.note.trim(), time: now }] : undefined,
    };
    if (getKenyaErxDispenseGaps(dispense).length === 0) {
      dispense.meta = { profile: [KenyaErxMedicationDispenseProfile] };
    }

    // The running total, version-checked: a concurrent dispense of the same prescription fails here
    const updated = await ctx.repo.updateResource<MedicationRequest>(
      {
        ...prescription,
        status: complete ? 'completed' : prescription.status,
        extension: [
          ...(prescription.extension ?? []).filter((e) => e.url !== KenyaDispensedQuantityExtensionUrl),
          { url: KenyaDispensedQuantityExtensionUrl, valueDecimal: dispensedTotal },
        ],
      },
      { ifMatch: prescription.meta?.versionId }
    );
    const created = await ctx.repo.createResource<MedicationDispense>(dispense);

    if (complete) {
      const tasks = await ctx.repo.searchResources<Task>({
        resourceType: 'Task',
        filters: [
          { code: 'focus', operator: Operator.EQUALS, value: getReferenceString(prescription) },
          { code: 'performer', operator: Operator.EQUALS, value: `${KenyaDepartmentSystem}|pharmacy` },
          { code: 'status', operator: Operator.EQUALS, value: 'requested,accepted,in-progress' },
        ],
      });
      for (const task of tasks) {
        await ctx.repo.updateResource<Task>({
          ...task,
          status: 'completed',
          businessStatus: { text: 'Dispensed' },
          owner: task.owner ?? (ctx.profile as Task['owner']),
          lastModified: now,
          output: [{ type: { text: 'dispense' }, valueReference: createReference(created) }],
        });
      }
    }
    return {
      dispense: created,
      prescription: updated,
      status: getKenyaPrescriptionStatus(updated, now.slice(0, 10)),
    };
  });
}
