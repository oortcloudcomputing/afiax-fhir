// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya computerised provider order entry (DHA FUNC-CPOE-001): one call places an order in an
// active encounter, checks its code against KNHTS, routes it to the department queue (a FHIR Task
// for the department) and raises the billing entry (a ChargeItem). The order is written with the
// caller's repository, so access policies and the clinical decision support checks on
// MedicationRequest apply exactly as for any other write.
//
// Prescriptions follow the DHA Kenya ePrescription IG (ADR-016): each gets a urn:uuid and a short
// prescription code, the eRx category and a DHA generic-product coding. A structured dose (amount,
// unit, frequency, DHA route) makes it conform to ke-medication-request, and only then is the
// profile claimed. A free-text-only dose is still accepted, for older callers.

import type { KenyaErxCategoryCode, WithId } from '@medplum/core';
import {
  badRequest,
  buildKenyaDosage,
  buildKenyaPrescriptionIdentifiers,
  createReference,
  generateKenyaPrescriptionCode,
  getDhaGenericProductCoding,
  getKenyaDoseUnit,
  getKenyaErxCategoryConcept,
  getKenyaErxCategoryForEncounter,
  getKenyaErxConformanceGaps,
  getKenyaStructuredDoseError,
  KenyaDefaultPrescriptionValidityDays,
  KenyaErxCategories,
  KenyaErxMedicationRequestProfile,
  FhirTaskCodeSystem,
  getKenyaDepartmentConcept,
  getKenyaOrderCategory,
  getKenyaOrderCategoryConcept,
  getKenyaOrderCodeError,
  getKenyaOrderPrice,
  KenyaCdsOverrideExtensionUrl,
  KenyaHealthProductSystem,
  KenyaIchiSystem,
  KenyaInvestigationSystem,
  OperationOutcomeError,
} from '@medplum/core';
import type {
  ChargeItem,
  CodeableConcept,
  Coding,
  Dosage,
  Encounter,
  MedicationRequest,
  Patient,
  Reference,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedRequestContext } from '../../context';
import type { KnhtsLookupResult, KnhtsSource } from './knhts';
import { isKnhtsValidationEnabled, KnhtsSources, lookupKnhtsConcept } from './knhts';

export interface KenyaOrderInput {
  readonly category: string;
  readonly code: Coding;
  readonly priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  readonly note?: string;
  /**
   * Medication: dosage in words, e.g. "500 mg three times daily for 5 days". Optional with a
   * structured dose (then generated if absent); required without one.
   */
  readonly dosageText?: string;
  /** Medication, structured dose: amount per dose, e.g. 500. */
  readonly doseValue?: number;
  /** Medication, structured dose: a KenyaDoseUnits code, e.g. "mg" or "tablet". */
  readonly doseUnit?: string;
  /** Medication, structured dose: a KenyaFrequencies code, e.g. "TDS". */
  readonly frequency?: string;
  /** Medication, structured dose: a DHA route-of-administration code, e.g. "RT10025" (oral). */
  readonly route?: string;
  /** Medication: eRx category (outpatient, inpatient, discharge, community); from the encounter when absent. */
  readonly erxCategory?: string;
  /** Medication: quantity to dispense. */
  readonly quantity?: number;
  /** Medication: number of days supply. */
  readonly durationDays?: number;
  /** Medication: reason for going ahead despite a high-severity CDS alert. */
  readonly overrideReason?: string;
}

export interface KenyaOrderResult {
  readonly order: WithId<MedicationRequest | ServiceRequest>;
  readonly task: WithId<Task>;
  readonly chargeItem: WithId<ChargeItem>;
}

/** Encounter statuses in which orders may be placed. */
const activeEncounterStatuses = new Set<Encounter['status']>(['arrived', 'triaged', 'in-progress', 'onleave']);

const knhtsSourceBySystem: Record<string, KnhtsSource> = {
  [KenyaHealthProductSystem]: KnhtsSources.healthProducts,
  [KenyaInvestigationSystem]: KnhtsSources.investigations,
  [KenyaIchiSystem]: KnhtsSources.ichi,
};

/**
 * Places a Kenya order in an encounter: validates it, creates the order, the department Task and
 * the ChargeItem in one transaction.
 * @param ctx - The request context.
 * @param encounter - The encounter.
 * @param input - The order.
 * @param lookup - KNHTS lookup (for tests).
 * @returns The order, Task and ChargeItem.
 */
export async function placeKenyaOrder(
  ctx: Pick<AuthenticatedRequestContext, 'repo' | 'project' | 'profile'>,
  encounter: WithId<Encounter>,
  input: KenyaOrderInput,
  lookup: (source: KnhtsSource, code: string) => Promise<KnhtsLookupResult> = lookupKnhtsConcept
): Promise<KenyaOrderResult> {
  const category = getKenyaOrderCategory(input.category);
  if (!category) {
    throw new OperationOutcomeError(badRequest(`Unknown order category "${input.category}"`));
  }
  if (!activeEncounterStatuses.has(encounter.status)) {
    throw new OperationOutcomeError(
      badRequest(`Orders can only be placed in an active encounter; this encounter is ${encounter.status}`)
    );
  }
  if (!encounter.subject?.reference?.startsWith('Patient/')) {
    throw new OperationOutcomeError(badRequest('The encounter has no patient'));
  }
  const codeError = getKenyaOrderCodeError(category, input.code);
  if (codeError) {
    throw new OperationOutcomeError(badRequest(codeError));
  }
  const isMedication = category.resourceType === 'MedicationRequest';
  const structured =
    input.doseValue !== undefined || !!input.doseUnit || !!input.frequency || !!input.route;
  if (isMedication && structured) {
    const doseError = getKenyaStructuredDoseError({ ...input });
    if (doseError) {
      throw new OperationOutcomeError(badRequest(doseError));
    }
  }
  if (isMedication && !structured && !input.dosageText?.trim()) {
    throw new OperationOutcomeError(badRequest('A medication order needs dosage instructions'));
  }
  if (input.durationDays !== undefined && !(Number.isInteger(input.durationDays) && input.durationDays > 0)) {
    throw new OperationOutcomeError(badRequest('The duration must be a whole number of days'));
  }
  if (input.erxCategory && !KenyaErxCategories.some((c) => c.code === input.erxCategory)) {
    throw new OperationOutcomeError(
      badRequest(`Unknown prescription category "${input.erxCategory}"; use ${KenyaErxCategories.map((c) => c.code).join(', ')}`)
    );
  }
  if (input.quantity !== undefined && !(input.quantity > 0)) {
    throw new OperationOutcomeError(badRequest('Quantity must be greater than zero'));
  }

  // The code must exist in KNHTS; an outage of the national service must not stop care
  let display = input.code.display;
  if (isKnhtsValidationEnabled()) {
    const result = await lookup(knhtsSourceBySystem[category.codeSystem], input.code.code as string);
    if (result.status === 'not-found') {
      throw new OperationOutcomeError(badRequest(`Code ${input.code.code} is not in KNHTS ${category.display} codes`));
    }
    if (result.status === 'found') {
      display = result.display ?? display;
    }
  }
  const code: Coding = { system: category.codeSystem, code: input.code.code, display };
  const now = new Date().toISOString();
  const subject = encounter.subject as Reference<Patient>;
  const requester = ctx.profile as MedicationRequest['requester'];
  const priority = input.priority ?? 'routine';
  const note = input.note?.trim() ? [{ text: input.note.trim(), time: now }] : undefined;

  return ctx.repo.withTransaction(async () => {
    let order: WithId<MedicationRequest | ServiceRequest>;
    if (category.resourceType === 'MedicationRequest') {
      order = await ctx.repo.createResource<MedicationRequest>(
        buildKenyaMedicationRequest(input, encounter, {
          orderCategory: getKenyaOrderCategoryConcept(category),
          code,
          display,
          subject,
          requester,
          priority,
          note,
          now,
        })
      );
    } else {
      order = await ctx.repo.createResource<ServiceRequest>({
        resourceType: 'ServiceRequest',
        status: 'active',
        intent: 'order',
        priority,
        category: [getKenyaOrderCategoryConcept(category)],
        code: { coding: [code], text: display },
        subject,
        encounter: createReference(encounter),
        authoredOn: now,
        requester: requester,
        performerType: getKenyaDepartmentConcept(category.department),
        note,
      });
    }

    const task = await ctx.repo.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      priority,
      code: { coding: [{ system: FhirTaskCodeSystem, code: 'fulfill', display: 'Fulfill the focal request' }] },
      description: `${category.display}: ${display ?? code.code}`,
      focus: createReference(order),
      for: subject,
      encounter: createReference(encounter),
      authoredOn: now,
      requester: requester,
      performerType: [getKenyaDepartmentConcept(category.department)],
      businessStatus: { text: 'queued' },
    });

    const price = getKenyaOrderPrice(ctx.project.setting, code);
    const quantity = category.resourceType === 'MedicationRequest' ? (input.quantity ?? 1) : 1;
    const chargeItem = await ctx.repo.createResource<ChargeItem>({
      resourceType: 'ChargeItem',
      status: 'billable',
      code: { coding: [code], text: display },
      subject,
      context: createReference(encounter),
      occurrenceDateTime: now,
      enteredDate: now,
      enterer: ctx.profile as ChargeItem['enterer'],
      quantity: { value: quantity },
      priceOverride: price !== undefined ? { value: price * quantity, currency: 'KES' } : undefined,
      overrideReason: price !== undefined ? `Facility price list: KES ${price} each` : undefined,
      note:
        price === undefined
          ? [{ text: `No price on the facility price list for ${code.code}; price to be set at billing.`, time: now }]
          : undefined,
      // The order being billed (ChargeItem.service only takes performed events, not requests)
      supportingInformation: [createReference(order) as Reference],
    });

    return { order, task, chargeItem };
  });
}

interface MedicationRequestContext {
  readonly orderCategory: CodeableConcept;
  readonly code: Coding;
  readonly display: string | undefined;
  readonly subject: Reference<Patient>;
  readonly requester: MedicationRequest['requester'];
  readonly priority: MedicationRequest['priority'];
  readonly note: MedicationRequest['note'];
  readonly now: string;
}

/**
 * Builds the prescription: DHA eRx identifiers, category and codings, the structured dose when
 * given, and the dispense request. Claims the ke-medication-request profile only when it conforms.
 * @param input - The order input (already validated).
 * @param encounter - The encounter.
 * @param c - The resolved code, patient, prescriber and times.
 * @returns The MedicationRequest to create.
 */
export function buildKenyaMedicationRequest(
  input: KenyaOrderInput,
  encounter: WithId<Encounter>,
  c: MedicationRequestContext
): MedicationRequest {
  const structured = input.doseValue !== undefined || !!input.doseUnit || !!input.frequency || !!input.route;
  const dosage: Dosage = structured
    ? buildKenyaDosage({
        doseValue: input.doseValue as number,
        doseUnit: input.doseUnit as string,
        frequency: input.frequency as string,
        route: input.route as string,
        durationDays: input.durationDays,
        text: input.dosageText,
      })
    : { text: input.dosageText?.trim() };
  const unit = structured ? getKenyaDoseUnit(input.doseUnit) : undefined;
  const erxCategory = (input.erxCategory as KenyaErxCategoryCode | undefined) ?? getKenyaErxCategoryForEncounter(encounter.class);
  const start = c.now.slice(0, 10);
  const end = new Date(Date.parse(c.now) + KenyaDefaultPrescriptionValidityDays * 86_400_000).toISOString().slice(0, 10);
  const dhaCoding = getDhaGenericProductCoding(c.code);

  const request: MedicationRequest = {
    resourceType: 'MedicationRequest',
    identifier: buildKenyaPrescriptionIdentifiers(randomUUID(), generateKenyaPrescriptionCode()),
    status: 'active',
    intent: 'order',
    priority: c.priority,
    category: [c.orderCategory, getKenyaErxCategoryConcept(erxCategory)],
    medicationCodeableConcept: { coding: dhaCoding ? [c.code, dhaCoding] : [c.code], text: c.display },
    subject: c.subject,
    encounter: createReference(encounter),
    authoredOn: c.now,
    requester: c.requester,
    dosageInstruction: [dosage],
    dispenseRequest: {
      validityPeriod: { start, end },
      numberOfRepeatsAllowed: 0,
      quantity: input.quantity
        ? {
            value: input.quantity,
            // A countable dose unit (tablets, capsules...) is also the dispensing unit
            ...(unit?.countable ? { unit: unit.code, system: 'http://unitsofmeasure.org', code: '1' } : {}),
          }
        : undefined,
      expectedSupplyDuration: input.durationDays
        ? { value: input.durationDays, unit: 'days', system: 'http://unitsofmeasure.org', code: 'd' }
        : undefined,
    },
    note: c.note,
    extension: input.overrideReason?.trim()
      ? [{ url: KenyaCdsOverrideExtensionUrl, valueString: input.overrideReason.trim() }]
      : undefined,
  };
  if (getKenyaErxConformanceGaps(request).length === 0) {
    request.meta = { profile: [KenyaErxMedicationRequestProfile] };
  }
  return request;
}
