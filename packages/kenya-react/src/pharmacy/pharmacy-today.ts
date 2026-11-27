// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The pharmacy workspace's Today view: the open pharmacy queue grouped into one card per patient
// visit (a prescription with three medicines is three queue Tasks but one patient at the counter),
// how long each has waited, and the day's counts.

import type { MedicationRequest, Task } from '@medplum/fhirtypes';
import type { QueueItem } from '../queues/queue-items';

/** Minutes after which an order counts as waiting long (amber), and very long (red). */
export const PharmacyWaitLongMinutes = 15;
export const PharmacyWaitVeryLongMinutes = 30;

export type PharmacyWaitLevel = 'ok' | 'long' | 'very-long';

/** new: nothing on it started yet; preparing: someone accepted at least one line. */
export type PharmacyOrderStage = 'new' | 'preparing';

export interface PharmacyOrderGroup {
  /** The visit (Encounter reference), else the patient and day. */
  readonly key: string;
  readonly items: readonly QueueItem[];
  readonly stage: PharmacyOrderStage;
  /** The most urgent priority of its lines. */
  readonly priority: NonNullable<Task['priority']>;
  /** When its oldest line was ordered. */
  readonly orderedAt?: string;
  readonly waitMinutes: number;
  readonly waitLevel: PharmacyWaitLevel;
}

export interface PharmacyTodaySummary {
  readonly newOrders: number;
  readonly preparing: number;
  readonly waitingLong: number;
}

const priorityRank: Record<NonNullable<Task['priority']>, number> = { stat: 0, asap: 1, urgent: 2, routine: 3 };

/**
 * Minutes since a time, never negative.
 * @param iso - The time.
 * @param now - Now.
 * @returns Whole minutes, or 0 when the time is missing.
 */
export function minutesSince(iso: string | undefined, now: Date): number {
  const at = Date.parse(iso ?? '');
  return Number.isNaN(at) ? 0 : Math.max(0, Math.floor((now.getTime() - at) / 60_000));
}

/**
 * How long a wait is, for its colour.
 * @param minutes - The wait.
 * @returns The level.
 */
export function waitLevel(minutes: number): PharmacyWaitLevel {
  if (minutes >= PharmacyWaitVeryLongMinutes) {
    return 'very-long';
  }
  return minutes >= PharmacyWaitLongMinutes ? 'long' : 'ok';
}

/**
 * A wait as people say it.
 * @param minutes - The wait.
 * @returns For example "just now", "12 min", "1 h 5 min".
 */
export function formatWait(minutes: number): string {
  if (minutes < 1) {
    return 'just now';
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const rest = minutes % 60;
  return rest ? `${Math.floor(minutes / 60)} h ${rest} min` : `${Math.floor(minutes / 60)} h`;
}

function groupKey(item: QueueItem): string {
  const encounter =
    item.task.encounter?.reference ?? (item.order as MedicationRequest | undefined)?.encounter?.reference;
  if (encounter) {
    return encounter;
  }
  const patient = item.task.for?.reference ?? item.patient?.id ?? item.task.id ?? '';
  return `${patient}|${(item.task.authoredOn ?? '').slice(0, 10)}`;
}

/**
 * Groups the open pharmacy queue into one card per patient visit, most urgent first, then the
 * longest waiting.
 * @param items - The open queue items.
 * @param now - Now.
 * @returns The groups.
 */
export function groupPharmacyOrders(items: readonly QueueItem[], now: Date): PharmacyOrderGroup[] {
  const byKey = new Map<string, QueueItem[]>();
  for (const item of items) {
    const key = groupKey(item);
    byKey.set(key, [...(byKey.get(key) ?? []), item]);
  }
  const groups = [...byKey.entries()].map(([key, lines]): PharmacyOrderGroup => {
    const sorted = [...lines].sort((a, b) => (a.task.authoredOn ?? '').localeCompare(b.task.authoredOn ?? ''));
    const orderedAt = sorted.find((i) => i.task.authoredOn)?.task.authoredOn;
    const priority = sorted
      .map((i) => i.task.priority ?? 'routine')
      .reduce<NonNullable<Task['priority']>>((best, p) => (priorityRank[p] < priorityRank[best] ? p : best), 'routine');
    const waitMinutes = minutesSince(orderedAt, now);
    return {
      key,
      items: sorted,
      stage: sorted.some((i) => i.task.status !== 'requested') ? 'preparing' : 'new',
      priority,
      orderedAt,
      waitMinutes,
      waitLevel: waitLevel(waitMinutes),
    };
  });
  return groups.sort(
    (a, b) => priorityRank[a.priority] - priorityRank[b.priority] || (a.orderedAt ?? '').localeCompare(b.orderedAt ?? '')
  );
}

/**
 * The day's counts for the tiles.
 * @param groups - The grouped open queue.
 * @returns Patients waiting with nothing started, patients being prepared, and those waiting long.
 */
export function summarisePharmacyToday(groups: readonly PharmacyOrderGroup[]): PharmacyTodaySummary {
  return {
    newOrders: groups.filter((g) => g.stage === 'new').length,
    preparing: groups.filter((g) => g.stage === 'preparing').length,
    waitingLong: groups.filter((g) => g.waitLevel !== 'ok').length,
  };
}

/**
 * Midnight today, local time, for "dispensed today".
 * @param now - Now.
 * @returns The ISO time.
 */
export function startOfToday(now: Date): string {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}
