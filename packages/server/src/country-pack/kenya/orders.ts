// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya computerised provider order entry (DHA FUNC-CPOE-001): one call places an order in an
// active encounter, checks its code against KNHTS, routes it to the department queue (a FHIR Task
// for the department) and raises the billing entry (a ChargeItem). The order is written with the
// caller's repository, so access policies and the clinical decision support checks on
// MedicationRequest apply exactly as for any other write.

import type { WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
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
  Coding,
  Encounter,
  MedicationRequest,
  Patient,
  Reference,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import type { KnhtsLookupResult, KnhtsSource } from './knhts';
import { isKnhtsValidationEnabled, KnhtsSources, lookupKnhtsConcept } from './knhts';

export interface KenyaOrderInput {
  readonly category: string;
  readonly code: Coding;
  readonly priority?: 'routine' | 'urgent' | 'asap' | 'stat';
  readonly note?: string;
  /** Medication: free-text dosage, e.g. "500 mg three times daily for 5 days". */
  readonly dosageText?: string;
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
  if (category.resourceType === 'MedicationRequest' && !input.dosageText?.trim()) {
    throw new OperationOutcomeError(badRequest('A medication order needs dosage instructions'));
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
      order = await ctx.repo.createResource<MedicationRequest>({
        resourceType: 'MedicationRequest',
        status: 'active',
        intent: 'order',
        priority,
        category: [getKenyaOrderCategoryConcept(category)],
        medicationCodeableConcept: { coding: [code], text: display },
        subject,
        encounter: createReference(encounter),
        authoredOn: now,
        requester,
        dosageInstruction: [{ text: input.dosageText?.trim() }],
        dispenseRequest:
          input.quantity || input.durationDays
            ? {
                quantity: input.quantity ? { value: input.quantity } : undefined,
                expectedSupplyDuration: input.durationDays
                  ? { value: input.durationDays, unit: 'days', system: 'http://unitsofmeasure.org', code: 'd' }
                  : undefined,
              }
            : undefined,
        note,
        extension: input.overrideReason?.trim()
          ? [{ url: KenyaCdsOverrideExtensionUrl, valueString: input.overrideReason.trim() }]
          : undefined,
      });
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
