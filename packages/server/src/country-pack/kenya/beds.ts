// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The bed board (ADR-018 §C): wards and beds are Locations in the facility's project. A ward has
// type "ward" and a ward type (ICU, HDU, general, ...); a bed has type "bed", is part of its ward,
// and its state is Location.operationalStatus (v2-0116): free (U), occupied (O), being cleaned (H)
// or closed (C). A patient in a bed is an inpatient Encounter (class IMP) whose active location is
// the bed. Every change goes through $kenya-bed, which checks the bed's state and version, so two
// nurses cannot put two patients in one bed.
import type { WithId } from '@medplum/core';
import { badRequest, createReference, getReferenceString, OperationOutcomeError, Operator } from '@medplum/core';
import type { Coding, Encounter, EncounterLocation, Location, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';

export const KenyaLocationKindSystem = 'https://afiax.africa/fhir/CodeSystem/location-kind';
export const KenyaWardTypeSystem = 'https://afiax.africa/fhir/CodeSystem/ward-type';
export const BedStatusSystem = 'http://terminology.hl7.org/CodeSystem/v2-0116';

export const KenyaWardTypes = {
  icu: 'ICU',
  hdu: 'HDU',
  general: 'General ward',
  maternity: 'Maternity',
  paediatric: 'Paediatric',
  isolation: 'Isolation',
} as const;
export type KenyaWardType = keyof typeof KenyaWardTypes;

export type KenyaBedState = 'U' | 'O' | 'H' | 'C';
const BedStateDisplay: Record<KenyaBedState, string> = { U: 'Unoccupied', O: 'Occupied', H: 'Housekeeping', C: 'Closed' };

export type KenyaBedAction = 'admit' | 'transfer' | 'discharge' | 'cleaned' | 'close' | 'reopen';

export interface KenyaBedInput {
  readonly action: KenyaBedAction;
  /** admit: the patient. */
  readonly patient?: Reference<Patient>;
  /** transfer: the free bed to move the patient to. */
  readonly toBed?: Reference<Location>;
  /** close: why (broken, staffing). */
  readonly reason?: string;
}

export interface KenyaBedResult {
  readonly bed: WithId<Location>;
  readonly encounter?: WithId<Encounter>;
  /** transfer: the bed the patient moved to. */
  readonly toBed?: WithId<Location>;
}

const kindCoding = (code: 'ward' | 'bed'): Coding => ({ system: KenyaLocationKindSystem, code, display: code === 'ward' ? 'Ward' : 'Bed' });
const stateCoding = (code: KenyaBedState): Coding => ({ system: BedStatusSystem, code, display: BedStateDisplay[code] });

/**
 * Whether a Location is a bed on the bed board.
 * @param l - The Location.
 * @returns True for a bed.
 */
export function isKenyaBed(l: Location): boolean {
  return !!l.type?.some((t) => t.coding?.some((c) => c.system === KenyaLocationKindSystem && c.code === 'bed'));
}

/**
 * A bed's state; a bed with none recorded is free.
 * @param bed - The bed.
 * @returns U (free), O (occupied), H (being cleaned) or C (closed).
 */
export function getKenyaBedState(bed: Location): KenyaBedState {
  const code = bed.operationalStatus?.system === BedStatusSystem ? bed.operationalStatus.code : undefined;
  return code === 'O' || code === 'H' || code === 'C' ? code : 'U';
}

/**
 * A new ward (no id).
 * @param name - What staff call it ("ICU 1", "Female medical ward").
 * @param wardType - ICU, HDU, general and so on.
 * @param partOf - The facility's Location, if the project has more than one.
 * @returns The Location.
 */
export function buildKenyaWard(name: string, wardType: KenyaWardType, partOf?: Reference<Location>): Location {
  return {
    resourceType: 'Location',
    status: 'active',
    mode: 'instance',
    name,
    type: [
      { coding: [kindCoding('ward')] },
      { coding: [{ system: KenyaWardTypeSystem, code: wardType, display: KenyaWardTypes[wardType] }] },
    ],
    physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'wa', display: 'Ward' }] },
    partOf,
  };
}

/**
 * A new bed in a ward (no id), free.
 * @param name - The bed's label ("Bed 3").
 * @param ward - Its ward.
 * @returns The Location.
 */
export function buildKenyaBed(name: string, ward: WithId<Location>): Location {
  return {
    resourceType: 'Location',
    status: 'active',
    mode: 'instance',
    name,
    type: [{ coding: [kindCoding('bed')] }],
    physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'bd', display: 'Bed' }] },
    operationalStatus: stateCoding('U'),
    partOf: createReference(ward),
  };
}

function refuse(message: string): never {
  throw new OperationOutcomeError(badRequest(message));
}

/**
 * The inpatient Encounter whose active location is this bed, if any.
 * @param ctx - The request context.
 * @param bed - The bed.
 * @returns The Encounter, or undefined.
 */
async function encounterIn(ctx: AuthenticatedRequestContext, bed: WithId<Location>): Promise<WithId<Encounter> | undefined> {
  const found = await ctx.repo.searchResources<Encounter>({
    resourceType: 'Encounter',
    filters: [
      { code: 'location', operator: Operator.EQUALS, value: getReferenceString(bed) },
      { code: 'status', operator: Operator.EQUALS, value: 'in-progress' },
    ],
    count: 5,
  });
  return found.find((e) => e.location?.some((l) => l.status === 'active' && l.location.reference === getReferenceString(bed)));
}

/**
 * Changes the bed's state, refusing if someone changed the bed since it was read.
 * @param ctx - The request context.
 * @param bed - The bed, as read.
 * @param state - The new state.
 * @param reason - Why, when closing.
 * @returns The updated bed.
 */
async function setState(
  ctx: AuthenticatedRequestContext,
  bed: WithId<Location>,
  state: KenyaBedState,
  reason?: string
): Promise<WithId<Location>> {
  return ctx.repo.updateResource<Location>(
    {
      ...bed,
      operationalStatus: stateCoding(state),
      // Why a bed is closed, shown on the board; cleared when it reopens
      description: state === 'C' ? reason?.trim() || 'Closed' : undefined,
    },
    { ifMatch: bed.meta?.versionId }
  );
}

/**
 * Admits, transfers or discharges a patient, or changes a bed's state, checking the bed first.
 * @param ctx - The request context.
 * @param bed - The bed.
 * @param input - What to do.
 * @returns The bed, and the Encounter for patient moves.
 */
export async function changeKenyaBed(
  ctx: AuthenticatedRequestContext,
  bed: WithId<Location>,
  input: KenyaBedInput
): Promise<KenyaBedResult> {
  if (!isKenyaBed(bed)) {
    refuse('That location is not a bed');
  }
  const state = getKenyaBedState(bed);
  const now = new Date().toISOString();
  const name = bed.name ?? 'This bed';

  return ctx.repo.withTransaction(async () => {
    switch (input.action) {
      case 'admit': {
        if (state !== 'U') {
          refuse(`${name} is not free`);
        }
        const patientRef = input.patient?.reference;
        if (!patientRef?.startsWith('Patient/')) {
          refuse('Choose the patient to admit');
        }
        const patient = await ctx.repo.readResource<Patient>('Patient', patientRef.split('/')[1]);
        const already = await ctx.repo.searchResources<Encounter>({
          resourceType: 'Encounter',
          filters: [
            { code: 'subject', operator: Operator.EQUALS, value: getReferenceString(patient) },
            { code: 'status', operator: Operator.EQUALS, value: 'in-progress' },
            { code: 'class', operator: Operator.EQUALS, value: 'IMP' },
          ],
          count: 1,
        });
        if (already.length) {
          refuse('This patient is already admitted. Transfer them instead.');
        }
        const occupied = await setState(ctx, bed, 'O');
        const encounter = await ctx.repo.createResource<Encounter>({
          resourceType: 'Encounter',
          status: 'in-progress',
          class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'IMP', display: 'inpatient encounter' },
          subject: createReference(patient),
          period: { start: now },
          location: [{ location: createReference(occupied), status: 'active', period: { start: now } }],
          // Who admitted the patient, when a practitioner did
          participant: ctx.profile?.reference?.startsWith('Practitioner/')
            ? [{ individual: ctx.profile as Reference<Practitioner> }]
            : undefined,
        });
        return { bed: occupied, encounter };
      }
      case 'transfer':
      case 'discharge': {
        if (state !== 'O') {
          refuse(`${name} has no patient`);
        }
        const encounter = await encounterIn(ctx, bed);
        if (!encounter) {
          refuse(`No admitted patient was found in ${name}`);
        }
        const closeHere = (l: EncounterLocation): EncounterLocation =>
          l.status === 'active' && l.location.reference === getReferenceString(bed)
            ? { ...l, status: 'completed', period: { ...l.period, end: now } }
            : l;
        if (input.action === 'discharge') {
          const done = await ctx.repo.updateResource<Encounter>({
            ...encounter,
            status: 'finished',
            period: { ...encounter.period, end: now },
            location: (encounter.location ?? []).map(closeHere),
          });
          const cleaning = await setState(ctx, bed, 'H');
          return { bed: cleaning, encounter: done };
        }
        const toId = input.toBed?.reference?.startsWith('Location/') ? input.toBed.reference.split('/')[1] : undefined;
        if (!toId || toId === bed.id) {
          refuse('Choose the bed to move the patient to');
        }
        const target = await ctx.repo.readResource<Location>('Location', toId);
        if (!isKenyaBed(target)) {
          refuse('That location is not a bed');
        }
        if (getKenyaBedState(target) !== 'U') {
          refuse(`${target.name ?? 'That bed'} is not free`);
        }
        const occupied = await setState(ctx, target, 'O');
        const moved = await ctx.repo.updateResource<Encounter>({
          ...encounter,
          location: [
            ...(encounter.location ?? []).map(closeHere),
            { location: createReference(occupied), status: 'active', period: { start: now } },
          ],
        });
        const cleaning = await setState(ctx, bed, 'H');
        return { bed: cleaning, encounter: moved, toBed: occupied };
      }
      case 'cleaned':
        if (state !== 'H') {
          refuse(`${name} is not waiting to be cleaned`);
        }
        return { bed: await setState(ctx, bed, 'U') };
      case 'close':
        if (state === 'O') {
          refuse(`${name} has a patient. Transfer or discharge them first.`);
        }
        return { bed: await setState(ctx, bed, 'C', input.reason) };
      case 'reopen':
        if (state !== 'C') {
          refuse(`${name} is not closed`);
        }
        return { bed: await setState(ctx, bed, 'U') };
      default:
        return refuse('Unknown bed action');
    }
  });
}
