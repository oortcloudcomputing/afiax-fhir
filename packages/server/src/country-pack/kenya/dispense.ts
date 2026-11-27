// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Dispensing a Kenya e-prescription (ADR-016 step 2), on the server so it is checked and atomic:
// the prescription must be active and within its validity period; the quantity cannot exceed what is
// left; the MedicationDispense follows DHA's ke-medication-dispense profile (claimed only when it
// conforms); the running dispensed total is kept on the MedicationRequest, whose version is checked
// on update, so two pharmacists cannot fill the same prescription at once; a fully dispensed
// prescription becomes "completed" and its pharmacy Task is completed.
//
// Safety at the counter: the prescribing rules (allergy, interaction, pregnancy, critical lab) run
// again against the record as it stands now. A high-severity alert the prescriber already overrode
// shows their reason and asks nothing more; any other high alert needs the pharmacist's reason to
// proceed, recorded as a DetectedIssue naming the prescription and the dispense. Chemists in the
// Afiax Prescription Network (performer given) are not checked here: their dispense comes through
// afiax-services after the patient chose them, with no one to ask.

import type { KenyaCdsAlert, WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  getReferenceString,
  KenyaDepartmentSystem,
  KenyaErxMedicationDispenseProfile,
  normalizeKenyaPrescriptionCode,
  KenyaPrescriptionCodeSystem,
  KenyaCdsAlertCategorySystem,
  Operator,
  OperationOutcomeError,
} from '@medplum/core';
import type {
  Coding,
  DetectedIssue,
  Encounter,
  MedicationDispense,
  MedicationRequest,
  OperationOutcome,
  Organization,
  Patient,
  Practitioner,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import {
  checkKenyaMedicationRequest,
  KenyaCdsAlertIdentifierSystem,
  kenyaCdsAlertIdentifier,
  recordKenyaCdsAlerts,
} from './cds';

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
  /**
   * The pharmacy that dispensed, when it is not the caller: a chemist in the Afiax Prescription
   * Network dispenses through afiax-services, whose client would otherwise be recorded. An
   * Organization, usually named by its PPB premises licence (it lives in another project).
   */
  readonly performer?: Reference<Organization>;
  /** The pharmacist's reason to dispense despite a high-severity safety alert. */
  readonly safetyOverride?: string;
}

/** A safety alert at dispense, with the override already recorded for it, if any. */
export interface KenyaDispenseSafetyAlert extends KenyaCdsAlert {
  /** The recorded override, e.g. "Prescriber override: benefit outweighs risk". */
  readonly overridden?: string;
}

type SafetyContext = Pick<AuthenticatedRequestContext, 'project' | 'systemRepo'>;

/**
 * Runs the prescribing safety rules for a prescription about to be dispensed, and marks the
 * high-severity alerts someone already overrode.
 * @param ctx - The request context.
 * @param prescription - The MedicationRequest.
 * @returns The alerts, most severe first.
 */
export async function checkKenyaDispenseSafety(
  ctx: SafetyContext,
  prescription: WithId<MedicationRequest>
): Promise<KenyaDispenseSafetyAlert[]> {
  const alerts = await checkKenyaMedicationRequest(ctx.systemRepo, ctx.project.id, prescription);
  return Promise.all(
    alerts.map(async (alert): Promise<KenyaDispenseSafetyAlert> => {
      if (alert.severity !== 'high') {
        return alert;
      }
      const recorded = await ctx.systemRepo.searchOne<DetectedIssue>({
        resourceType: 'DetectedIssue',
        filters: [
          { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
          {
            code: 'identifier',
            operator: Operator.EQUALS,
            value: `${KenyaCdsAlertIdentifierSystem}|${kenyaCdsAlertIdentifier(prescription, alert)}`,
          },
        ],
      });
      const overridden = recorded?.mitigation?.find((m) => m.action?.text)?.action?.text;
      return overridden ? { ...alert, overridden } : alert;
    })
  );
}

/**
 * The high-severity alerts no one has overridden yet: these stop a dispense without a reason.
 * @param alerts - The alerts from checkKenyaDispenseSafety.
 * @returns The alerts that need the pharmacist's reason.
 */
export function unresolvedKenyaDispenseAlerts(alerts: readonly KenyaDispenseSafetyAlert[]): KenyaDispenseSafetyAlert[] {
  return alerts.filter((a) => a.severity === 'high' && !a.overridden);
}

function safetyRefusal(alerts: readonly KenyaCdsAlert[]): OperationOutcome {
  return {
    resourceType: 'OperationOutcome',
    issue: [
      ...alerts.map((alert) => ({
        severity: 'error' as const,
        code: 'business-rule' as const,
        details: {
          coding: [{ system: KenyaCdsAlertCategorySystem, code: alert.category }],
          text: `${alert.title}. ${alert.detail} ${alert.recommendation}`,
        },
        diagnostics: `Evidence: ${alert.evidence}`,
      })),
      {
        severity: 'information' as const,
        code: 'informational' as const,
        details: { text: 'To dispense anyway, record your reason (safetyOverride).' },
      },
    ],
  };
}

/**
 * Checks a dispensing pharmacy given to $kenya-dispense: an Organization, by reference or by
 * identifier, with a name for display.
 * @param performer - The performer from the operation input.
 * @returns The performer to record.
 */
function dispensingPharmacy(performer: Reference<Organization>): Reference<Organization> {
  const byReference = performer.reference?.startsWith('Organization/');
  const byIdentifier = performer.identifier?.system && performer.identifier.value;
  if (!byReference && !(byIdentifier && (performer.type === undefined || performer.type === 'Organization'))) {
    throw new OperationOutcomeError(badRequest('The performer must be the dispensing pharmacy (an Organization)'));
  }
  if (!performer.display?.trim()) {
    throw new OperationOutcomeError(badRequest('Give the dispensing pharmacy a name (performer.display)'));
  }
  return { ...performer, type: 'Organization', display: performer.display.trim() };
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
  ctx: Pick<AuthenticatedRequestContext, 'repo' | 'profile' | 'project' | 'systemRepo'>,
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
  const override = input.safetyOverride?.trim();
  const unresolved = input.performer ? [] : unresolvedKenyaDispenseAlerts(await checkKenyaDispenseSafety(ctx, prescription));
  if (unresolved.length > 0 && !override) {
    throw new OperationOutcomeError(safetyRefusal(unresolved));
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

  const result = await ctx.repo.withTransaction(async () => {
    const dispense: MedicationDispense = {
      resourceType: 'MedicationDispense',
      identifier: prescription.identifier?.filter((i) => i.system === KenyaPrescriptionCodeSystem),
      status: 'completed',
      type: { coding: [type] },
      medicationCodeableConcept: prescription.medicationCodeableConcept,
      subject: prescription.subject as Reference<Patient>,
      context: prescription.encounter,
      performer: [{ actor: input.performer ? dispensingPharmacy(input.performer) : (ctx.profile as Reference<Practitioner>) }],
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
  if (unresolved.length > 0 && override) {
    await recordKenyaCdsAlerts(ctx, prescription, prescription.subject as Reference<Patient>, unresolved, override, {
      by: 'Pharmacist',
      alsoImplicated: [getReferenceString(result.dispense)],
    });
  }
  return result;
}
