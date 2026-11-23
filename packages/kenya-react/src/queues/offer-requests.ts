// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// What a chemist can do with each offer request of the Afiax Prescription Network (ADR-016 §3b),
// read from its offer Task (afiax-services src/erx/offers.ts writes them).

import type { Task } from '@medplum/fhirtypes';

/** The network's Task codes (afiax-services src/erx/network.ts). */
export const NetworkTaskCodeSystem = 'https://afiax.africa/erx/task';

/** What the chemist is shown about a request (never the patient's name until it is chosen). */
export interface OfferRequestView {
  readonly lines: readonly {
    readonly medication: { readonly text?: string; readonly display?: string; readonly code?: string };
    readonly dose?: string;
    readonly quantity?: number;
    readonly unit?: string;
  }[];
  readonly patient: { readonly gender?: string; readonly age?: number; readonly allergies: readonly string[] };
  readonly expiresAt: string;
  readonly distanceKm: number;
}

export type OfferStage = 'answer' | 'offered' | 'chosen' | 'ready' | 'closed';

export interface OfferCard {
  readonly id: string;
  readonly stage: OfferStage;
  readonly view?: OfferRequestView;
  readonly expiresAt?: string;
  readonly priceKes?: number;
  readonly readyMinutes?: number;
  /** Only on the chosen offer. */
  readonly patient?: { readonly name?: string; readonly phone?: string };
  /** Why it closed: collected, declined, another chemist, no answer in time. */
  readonly closed?: string;
  readonly at?: string;
  /** While chosen: until when the chemist holds it (ready by, or collected by); then it is released. */
  readonly holdUntil?: string;
}

function json<T>(value: string | undefined): T | undefined {
  try {
    return value ? (JSON.parse(value) as T) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * What a chemist can do with an offer Task now.
 * @param task - The offer Task (code offer, owned by the chemist's Organization).
 * @param now - The current time.
 * @returns The card.
 */
export function offerCard(task: Task, now: Date): OfferCard {
  const input = (name: string): string | undefined => task.input?.find((i) => i.type.text === name)?.valueString;
  const output = (name: string): number | undefined => {
    const o = task.output?.find((x) => x.type.text === name);
    return o?.valueDecimal ?? o?.valueInteger;
  };
  const view = json<OfferRequestView>(input('request'));
  const expiresAt = task.restriction?.period?.end ?? view?.expiresAt;
  const expired = !!expiresAt && now.getTime() > Date.parse(expiresAt);
  const base = {
    id: task.id as string,
    view,
    expiresAt,
    priceKes: output('price-kes'),
    readyMinutes: output('ready-minutes'),
    at: task.lastModified ?? task.authoredOn,
    holdUntil: task.executionPeriod?.end,
  };
  switch (task.status) {
    case 'requested':
      return expired ? { ...base, stage: 'closed', closed: 'Not answered in time' } : { ...base, stage: 'answer' };
    case 'received':
      return { ...base, stage: 'offered' };
    case 'accepted':
      return { ...base, stage: 'chosen', patient: json(input('patient')) };
    case 'in-progress':
      return { ...base, stage: 'ready', patient: json(input('patient')) };
    case 'completed':
      return { ...base, stage: 'closed', closed: 'Collected' };
    case 'rejected':
      return {
        ...base,
        stage: 'closed',
        closed: `You declined${task.statusReason?.text ? `: ${task.statusReason.text}` : ''}`,
      };
    default:
      return { ...base, stage: 'closed', closed: task.statusReason?.text ?? 'Closed' };
  }
}

const stageOrder: Record<OfferStage, number> = { answer: 0, chosen: 1, ready: 2, offered: 3, closed: 4 };

/**
 * Orders the cards: what needs an answer first (soonest to expire first), then chosen and ready
 * ones, then offers waiting for the patient, then the closed ones (newest first).
 * @param cards - The cards.
 * @returns The cards, sorted.
 */
export function sortOfferCards(cards: readonly OfferCard[]): OfferCard[] {
  return [...cards].sort(
    (a, b) =>
      stageOrder[a.stage] - stageOrder[b.stage] ||
      (a.stage === 'answer'
        ? (a.expiresAt ?? '').localeCompare(b.expiresAt ?? '')
        : (b.at ?? '').localeCompare(a.at ?? ''))
  );
}
