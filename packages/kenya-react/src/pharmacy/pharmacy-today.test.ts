// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationRequest, Task } from '@medplum/fhirtypes';
import type { QueueItem } from '../queues/queue-items';
import { formatWait, groupPharmacyOrders, minutesSince, summarisePharmacyToday, waitLevel } from './pharmacy-today';

const now = new Date('2026-11-27T10:00:00Z');
const ago = (minutes: number): string => new Date(now.getTime() - minutes * 60_000).toISOString();

function item(id: string, opts: Partial<Task> & { encounter?: string; minutes: number }): QueueItem {
  const { encounter, minutes, ...task } = opts;
  const order: MedicationRequest = {
    resourceType: 'MedicationRequest',
    id: `mr-${id}`,
    status: 'active',
    intent: 'order',
    subject: { reference: task.for?.reference ?? 'Patient/p1' },
    encounter: encounter ? { reference: encounter } : undefined,
  };
  return {
    task: {
      resourceType: 'Task',
      id,
      status: 'requested',
      intent: 'order',
      for: { reference: 'Patient/p1' },
      authoredOn: ago(minutes),
      ...task,
    },
    order,
  };
}

describe('pharmacy Today', () => {
  test('waits', () => {
    expect(minutesSince(ago(12), now)).toBe(12);
    expect(minutesSince(undefined, now)).toBe(0);
    expect(minutesSince(new Date(now.getTime() + 60_000).toISOString(), now)).toBe(0);
    expect([waitLevel(14), waitLevel(15), waitLevel(30)]).toEqual(['ok', 'long', 'very-long']);
    expect([formatWait(0), formatWait(12), formatWait(60), formatWait(65)]).toEqual([
      'just now',
      '12 min',
      '1 h',
      '1 h 5 min',
    ]);
  });

  test('one card per visit, urgent first, then longest waiting', () => {
    const groups = groupPharmacyOrders(
      [
        item('a1', { encounter: 'Encounter/e1', minutes: 20 }),
        item('a2', { encounter: 'Encounter/e1', minutes: 18, status: 'in-progress' }),
        item('b1', { encounter: 'Encounter/e2', minutes: 40, for: { reference: 'Patient/p2' } }),
        item('c1', { encounter: 'Encounter/e3', minutes: 2, priority: 'stat', for: { reference: 'Patient/p3' } }),
        // No visit: grouped by patient and day
        item('d1', { minutes: 5, for: { reference: 'Patient/p4' } }),
        item('d2', { minutes: 4, for: { reference: 'Patient/p4' } }),
      ],
      now
    );
    expect(groups.map((g) => g.key)).toEqual(['Encounter/e3', 'Encounter/e2', 'Encounter/e1', 'Patient/p4|2026-11-27']);
    const [stat, longest, visit, noVisit] = groups;
    expect(stat.priority).toBe('stat');
    expect(longest.waitLevel).toBe('very-long');
    expect(visit.items.map((i) => i.task.id)).toEqual(['a1', 'a2']);
    expect(visit.stage).toBe('preparing');
    expect(visit.waitMinutes).toBe(20);
    expect(noVisit.items).toHaveLength(2);
    expect(summarisePharmacyToday(groups)).toEqual({ newOrders: 3, preparing: 1, waitingLong: 2 });
  });
});
