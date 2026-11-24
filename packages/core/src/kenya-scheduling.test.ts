// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { KenyaClinicHours } from './kenya-scheduling';
import {
  buildKenyaSchedulingParameters,
  checkKenyaClinicHours,
  getKenyaClinicHours,
  summariseKenyaClinicHours,
} from './kenya-scheduling';

const weekday = [
  { start: '08:00', end: '13:00' },
  { start: '14:00', end: '17:00' },
];
const hours: KenyaClinicHours = {
  days: { mon: weekday, tue: weekday, wed: weekday, thu: weekday, fri: weekday, sat: [{ start: '09:00', end: '12:00' }] },
  slotMinutes: 20,
  bufferMinutes: 5,
  visitTypes: ['in-person', 'video'],
  timeZone: 'Africa/Nairobi',
};

describe('Kenya clinic hours (ADR-018 §B)', () => {
  test('round trip through the SchedulingParameters extension', () => {
    const ext = buildKenyaSchedulingParameters(hours);
    expect(ext.extension?.filter((e) => e.url === 'availability')).toHaveLength(11);
    expect(ext.extension).toContainEqual({ url: 'duration', valueDuration: { value: 20, unit: 'min' } });
    expect(ext.extension).toContainEqual({ url: 'alignmentInterval', valueDuration: { value: 25, unit: 'min' } });
    expect(getKenyaClinicHours({ resourceType: 'Schedule', actor: [], extension: [ext] })).toEqual(hours);
  });

  test('summary groups days with the same hours', () => {
    expect(summariseKenyaClinicHours(hours)).toBe('Mon–Fri 08:00–13:00, 14:00–17:00; Sat 09:00–12:00 · 20 min');
  });

  test('checks the hours', () => {
    expect(checkKenyaClinicHours(hours)).toEqual([]);
    expect(
      checkKenyaClinicHours({
        ...hours,
        slotMinutes: 3,
        visitTypes: [],
        days: { mon: [{ start: '10:00', end: '09:00' }, { start: '08:00', end: '12:00' }] },
      })
    ).toEqual([
      'Appointment length must be 5 to 240 minutes',
      'Choose at least one kind of visit',
      'mon: 08:00–12:00 and 10:00–09:00 overlap',
      'mon: 10:00 to 09:00 ends before it starts',
    ]);
    expect(checkKenyaClinicHours({ ...hours, days: {} })).toContain('Add working hours on at least one day');
    // 25-minute steps start at :00, :25, :50; not at :30
    expect(checkKenyaClinicHours({ ...hours, days: { mon: [{ start: '08:30', end: '12:00' }] } })).toEqual([
      'mon: appointments 25 minutes apart cannot start at 08:30; start on the hour or a multiple of 25 minutes after it',
    ]);
  });
});
