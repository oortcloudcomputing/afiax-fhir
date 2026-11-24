// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Clinic hours (ADR-018 §B): a practitioner's weekly working hours, appointment length and the
// kinds of visit they take, as the SchedulingParameters extension on their Schedule that
// Schedule/$find and Appointment/$book read. Leave is a busy-unavailable Slot. Shared by the
// server and Afiax Provider's Clinic hours page.
import type { CodeableConcept, Extension, Schedule } from '@medplum/fhirtypes';

export const SchedulingParametersUrl = 'https://medplum.com/fhir/StructureDefinition/SchedulingParameters';
/** Kinds of visit (Afiax codes until DHA publishes appointment types). */
export const KenyaVisitTypeSystem = 'https://afiax.africa/fhir/CodeSystem/visit-type';
export const KenyaVisitTypes = {
  'in-person': 'In person',
  'follow-up': 'Follow-up',
  video: 'Video visit',
} as const;
export type KenyaVisitType = keyof typeof KenyaVisitTypes;
export const KenyaDefaultTimeZone = 'Africa/Nairobi';
/** On the practitioner: Schedule/$find and Appointment/$book read the time zone from it. */
export const TimeZoneExtensionUrl = 'http://hl7.org/fhir/StructureDefinition/timezone';

/**
 * Minutes between appointment starts: the length plus the gap, at most an hour ($find lines
 * appointments up from the start of each hour).
 * @param hours - The clinic hours.
 * @returns The minutes.
 */
export function getKenyaSlotStep(hours: Pick<KenyaClinicHours, 'slotMinutes' | 'bufferMinutes'>): number {
  return Math.min(hours.slotMinutes + hours.bufferMinutes, 60);
}

export type KenyaWeekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
export const KenyaWeekdays: readonly KenyaWeekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

/** "08:00" to "13:00": one stretch of working time on a day. */
export interface KenyaHoursRange {
  readonly start: string;
  readonly end: string;
}

export interface KenyaClinicHours {
  /** Working time per weekday; a day without ranges is a day off. */
  readonly days: Readonly<Partial<Record<KenyaWeekday, readonly KenyaHoursRange[]>>>;
  /** Appointment length in minutes. */
  readonly slotMinutes: number;
  /** Gap after each appointment, in minutes. */
  readonly bufferMinutes: number;
  readonly visitTypes: readonly KenyaVisitType[];
  readonly timeZone: string;
}

const toMinutes = (hhmm: string): number => {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm);
  if (!m) {
    throw new Error(`Not a time: ${hhmm}`);
  }
  return Number(m[1]) * 60 + Number(m[2]);
};
const toHhmm = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * Checks clinic hours: times in order, ranges that do not overlap, a sensible appointment length.
 * @param hours - The clinic hours.
 * @returns What is wrong, or an empty list.
 */
export function checkKenyaClinicHours(hours: KenyaClinicHours): string[] {
  const problems: string[] = [];
  if (!Number.isInteger(hours.slotMinutes) || hours.slotMinutes < 5 || hours.slotMinutes > 240) {
    problems.push('Appointment length must be 5 to 240 minutes');
  }
  if (!Number.isInteger(hours.bufferMinutes) || hours.bufferMinutes < 0 || hours.bufferMinutes > 60) {
    problems.push('The gap between appointments must be 0 to 60 minutes');
  }
  if (!hours.visitTypes.length) {
    problems.push('Choose at least one kind of visit');
  }
  for (const day of KenyaWeekdays) {
    const ranges = [...(hours.days[day] ?? [])].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
    ranges.forEach((r, i) => {
      if (toMinutes(r.end) <= toMinutes(r.start)) {
        problems.push(`${day}: ${r.start} to ${r.end} ends before it starts`);
      } else if (toMinutes(r.end) - toMinutes(r.start) < hours.slotMinutes) {
        problems.push(`${day}: ${r.start} to ${r.end} is shorter than one appointment`);
      }
      // $find starts appointments at minutes of the hour that are multiples of the step
      const step = getKenyaSlotStep(hours);
      if (toMinutes(r.start) % 60 % step !== 0) {
        problems.push(`${day}: appointments ${step} minutes apart cannot start at ${r.start}; start on the hour or a multiple of ${step} minutes after it`);
      }
      const next = ranges[i + 1];
      if (next && toMinutes(next.start) < toMinutes(r.end)) {
        problems.push(`${day}: ${r.start}–${r.end} and ${next.start}–${next.end} overlap`);
      }
    });
  }
  if (!KenyaWeekdays.some((d) => hours.days[d]?.length)) {
    problems.push('Add working hours on at least one day');
  }
  return problems;
}

/**
 * The SchedulingParameters extension for clinic hours: one availability per stretch of time, the
 * appointment length, the gap after, the time zone and the kinds of visit.
 * @param hours - The clinic hours.
 * @returns The extension.
 */
export function buildKenyaSchedulingParameters(hours: KenyaClinicHours): Extension {
  const availability: Extension[] = [];
  for (const day of KenyaWeekdays) {
    for (const r of hours.days[day] ?? []) {
      availability.push({
        url: 'availability',
        valueTiming: {
          repeat: {
            dayOfWeek: [day],
            timeOfDay: [`${toHhmm(toMinutes(r.start))}:00`],
            duration: toMinutes(r.end) - toMinutes(r.start),
            durationUnit: 'min',
          },
        },
      });
    }
  }
  return {
    url: SchedulingParametersUrl,
    extension: [
      ...availability,
      { url: 'duration', valueDuration: { value: hours.slotMinutes, unit: 'min' } },
      // Appointments start on the hour and every appointment length after it
      { url: 'alignmentInterval', valueDuration: { value: getKenyaSlotStep(hours), unit: 'min' } },
      ...(hours.bufferMinutes ? [{ url: 'bufferAfter', valueDuration: { value: hours.bufferMinutes, unit: 'min' as const } }] : []),
      { url: 'timezone', valueCode: hours.timeZone },
      ...hours.visitTypes.map((code) => ({
        url: 'serviceType',
        valueCodeableConcept: { coding: [{ system: KenyaVisitTypeSystem, code, display: KenyaVisitTypes[code] }] } as CodeableConcept,
      })),
    ],
  };
}

/**
 * Reads clinic hours back from a Schedule (for editing); undefined when it has none.
 * @param schedule - The Schedule.
 * @returns The clinic hours.
 */
export function getKenyaClinicHours(schedule: Schedule): KenyaClinicHours | undefined {
  const ext = schedule.extension?.find((e) => e.url === SchedulingParametersUrl);
  if (!ext) {
    return undefined;
  }
  const days: Partial<Record<KenyaWeekday, KenyaHoursRange[]>> = {};
  let slotMinutes = 30;
  let bufferMinutes = 0;
  let timeZone = KenyaDefaultTimeZone;
  const visitTypes: KenyaVisitType[] = [];
  for (const e of ext.extension ?? []) {
    if (e.url === 'availability') {
      const rep = e.valueTiming?.repeat;
      const start = rep?.timeOfDay?.[0];
      const minutes = rep?.durationUnit === 'h' ? (rep.duration ?? 0) * 60 : (rep?.duration ?? 0);
      for (const day of (rep?.dayOfWeek ?? []) as KenyaWeekday[]) {
        if (start) {
          (days[day] ??= []).push({ start: start.slice(0, 5), end: toHhmm(toMinutes(start) + minutes) });
        }
      }
    } else if (e.url === 'duration' && e.valueDuration?.value) {
      slotMinutes = e.valueDuration.value;
    } else if (e.url === 'bufferAfter' && e.valueDuration?.value) {
      bufferMinutes = e.valueDuration.value;
    } else if (e.url === 'timezone' && e.valueCode) {
      timeZone = e.valueCode;
    } else if (e.url === 'serviceType') {
      const code = e.valueCodeableConcept?.coding?.find((c) => c.system === KenyaVisitTypeSystem)?.code;
      if (code && code in KenyaVisitTypes) {
        visitTypes.push(code as KenyaVisitType);
      }
    }
  }
  for (const day of KenyaWeekdays) {
    days[day]?.sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  }
  return { days, slotMinutes, bufferMinutes, timeZone, visitTypes };
}

/**
 * A short line for lists: "Mon–Fri 08:00–13:00, 14:00–17:00 · 20 min".
 * @param hours - The clinic hours.
 * @returns The summary.
 */
export function summariseKenyaClinicHours(hours: KenyaClinicHours): string {
  const label = (d: KenyaWeekday): string => d.charAt(0).toUpperCase() + d.slice(1);
  // Runs of consecutive days with the same hours: { first, last, text }
  const groups: { first: KenyaWeekday; last: KenyaWeekday; text: string }[] = [];
  for (const d of KenyaWeekdays) {
    const text = (hours.days[d] ?? []).map((r) => `${r.start}–${r.end}`).join(', ');
    if (!text) {
      continue;
    }
    const prev = groups.at(-1);
    if (prev?.text === text && KenyaWeekdays[KenyaWeekdays.indexOf(prev.last) + 1] === d) {
      prev.last = d;
    } else {
      groups.push({ first: d, last: d, text });
    }
  }
  const parts = groups.map((g) => `${label(g.first)}${g.last === g.first ? '' : `–${label(g.last)}`} ${g.text}`);
  return `${parts.join('; ') || 'No hours'} · ${hours.slotMinutes} min`;
}
