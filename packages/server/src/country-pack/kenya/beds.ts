// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The bed board (ADR-018 §C): wards and beds are Locations in the facility's project. A ward has
// type "ward" and a ward type (ICU, HDU, general, ...); a bed has type "bed", is part of its ward,
// and its state is Location.operationalStatus (v2-0116): free (U), occupied (O), being cleaned (H)
// or closed (C). A patient in a bed is an inpatient Encounter (class IMP) whose active location is
// the bed. Every change goes through $kenya-bed, which checks the bed's state and version, so two
// nurses cannot put two patients in one bed.
import type { KenyaBedState, WithId } from '@medplum/core';
import {
  badRequest,
  createReference,
  forbidden,
  getKenyaBedHold,
  getKenyaBedState,
  KenyaBedHoldExtension,
  KenyaBedHoldMs,
  getReferenceString,
  isKenyaLocationKind,
  KenyaBedStateDisplay,
  KenyaBedStatusSystem,
  OperationOutcomeError,
  Operator,
} from '@medplum/core';
import type { AccessPolicy, Coding, Encounter, EncounterLocation, Location, Patient, Practitioner, Reference } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';

export type KenyaBedAction = 'admit' | 'transfer' | 'discharge' | 'cleaned' | 'close' | 'reopen' | 'hold' | 'release';

/** Staff roles that may hold a bed for a referral (user decision 2026-11-24), besides project admins. */
const HoldRoles = ['clinician', 'facility-admin'];
const StaffRoleSystem = 'https://afiax.africa/kenya/staff-role';

export interface KenyaBedInput {
  readonly action: KenyaBedAction;
  /** admit: the patient. */
  readonly patient?: Reference<Patient>;
  /** transfer: the free bed to move the patient to. */
  readonly toBed?: Reference<Location>;
  /** close: why (broken, staffing). */
  readonly reason?: string;
  /** hold: the referral it is held for; admit: the referral a held bed is admitted for. */
  readonly referral?: string;
  /** hold: until when (default 2 hours from now). */
  readonly until?: string;
  /** hold: who it is held for ("Referral from ..."). */
  readonly display?: string;
}

export interface KenyaBedResult {
  readonly bed: WithId<Location>;
  readonly encounter?: WithId<Encounter>;
  /** transfer: the bed the patient moved to. */
  readonly toBed?: WithId<Location>;
}

const stateCoding = (code: KenyaBedState): Coding => ({ system: KenyaBedStatusSystem, code, display: KenyaBedStateDisplay[code] });
const isKenyaBed = (l: Location): boolean => isKenyaLocationKind(l, 'bed');
export { getKenyaBedState, isKenyaBed };

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
 * Whether the caller may hold or release beds for referrals: a project admin, or staff whose
 * access policy is the clinician or facility-admin role.
 * @param ctx - The request context.
 * @returns True when allowed.
 */
async function mayHoldBeds(ctx: AuthenticatedRequestContext): Promise<boolean> {
  if (ctx.membership.admin || ctx.project.superAdmin) {
    return true;
  }
  const policies = [ctx.membership.accessPolicy, ...(ctx.membership.access ?? []).map((a) => a.policy)].filter(
    (p): p is Reference<AccessPolicy> => !!p?.reference
  );
  const systemRepo = ctx.repo.getSystemRepo();
  for (const ref of policies) {
    const policy = await systemRepo.readReference<AccessPolicy>(ref).catch(() => undefined);
    if (policy?.meta?.tag?.some((t) => t.system === StaffRoleSystem && HoldRoles.includes(t.code ?? ''))) {
      return true;
    }
  }
  return false;
}

/**
 * Sets or clears a bed's hold, refusing if someone changed the bed since it was read.
 * @param ctx - The request context.
 * @param bed - The bed, as read.
 * @param hold - The hold, or undefined to clear it.
 * @returns The updated bed.
 */
async function setHold(
  ctx: AuthenticatedRequestContext,
  bed: WithId<Location>,
  hold: { referral: string; until: string; display?: string } | undefined
): Promise<WithId<Location>> {
  const extension = (bed.extension ?? []).filter((e) => e.url !== KenyaBedHoldExtension);
  if (hold) {
    extension.push({
      url: KenyaBedHoldExtension,
      extension: [
        { url: 'referral', valueString: hold.referral },
        { url: 'until', valueDateTime: hold.until },
        ...(hold.display ? [{ url: 'display', valueString: hold.display }] : []),
      ],
    });
  }
  return ctx.repo.updateResource<Location>(
    { ...bed, extension: extension.length ? extension : undefined },
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
        const hold = getKenyaBedHold(bed);
        if (hold && hold.referral !== input.referral) {
          refuse(`${name} is held for a referral until ${hold.until}. Choose another bed, or release the hold.`);
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
        // A held bed's hold ends when its referred patient is admitted
        const unheld = hold ? await setHold(ctx, bed, undefined) : bed;
        const occupied = await setState(ctx, unheld, 'O');
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
        if (getKenyaBedHold(bed)) {
          refuse(`${name} is held for a referral. Release the hold first.`);
        }
        return { bed: await setState(ctx, bed, 'C', input.reason) };
      case 'reopen':
        if (state !== 'C') {
          refuse(`${name} is not closed`);
        }
        return { bed: await setState(ctx, bed, 'U') };
      case 'hold': {
        if (!(await mayHoldBeds(ctx))) {
          throw new OperationOutcomeError(forbidden);
        }
        if (state !== 'U') {
          refuse(`${name} is not free`);
        }
        const current = getKenyaBedHold(bed);
        if (current && current.referral !== input.referral) {
          refuse(`${name} is already held for another referral`);
        }
        if (!input.referral?.trim()) {
          refuse('Say which referral the bed is held for');
        }
        const until = input.until && Date.parse(input.until) > Date.now() ? input.until : new Date(Date.now() + KenyaBedHoldMs).toISOString();
        return { bed: await setHold(ctx, bed, { referral: input.referral.trim(), until, display: input.display?.trim() || undefined }) };
      }
      case 'release':
        if (!(await mayHoldBeds(ctx))) {
          throw new OperationOutcomeError(forbidden);
        }
        return { bed: await setHold(ctx, bed, undefined) };
      default:
        return refuse('Unknown bed action');
    }
  });
}
