// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { buildKenyaSchedulingParameters, ContentType, createReference, KenyaVisitTypeSystem } from '@medplum/core';
import type { Bundle, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';

const app = express();
let token: string;

const weekday = [
  { start: '08:00', end: '13:00' },
  { start: '14:00', end: '17:00' },
];

// Monday 30 November 2026 in Nairobi (UTC+3)
const day = { start: '2026-11-30T05:00:00Z', end: '2026-11-30T14:00:00Z' };

async function find(schedule: Schedule): Promise<Slot[]> {
  const res = await request(app)
    .get(
      `/fhir/R4/Schedule/${schedule.id}/$find?start=${day.start}&end=${day.end}&_count=100&service-type=${encodeURIComponent(`${KenyaVisitTypeSystem}|in-person`)}`
    )
    .set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return ((res.body as Bundle<Slot>).entry ?? []).map((e) => e.resource as Slot);
}

describe('Kenya clinic hours drive $find and $book (ADR-018 §B)', () => {
  let schedule: Schedule;

  beforeAll(async () => {
    await initApp(app, await loadTestConfig());
    token = (await createTestProject({ withAccessToken: true, membership: { admin: true } })).accessToken;
    const doctor: Practitioner = (
      await request(app)
        .post('/fhir/R4/Practitioner')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Practitioner',
          name: [{ given: ['Amina'], family: 'Otieno' }],
          // $find reads the time zone from the practitioner; Clinic hours sets it
          extension: [{ url: 'http://hl7.org/fhir/StructureDefinition/timezone', valueCode: 'Africa/Nairobi' }],
        })
    ).body;
    schedule = (
      await request(app)
        .post('/fhir/R4/Schedule')
        .set('Authorization', `Bearer ${token}`)
        .set('Content-Type', ContentType.FHIR_JSON)
        .send({
          resourceType: 'Schedule',
          active: true,
          actor: [createReference(doctor)],
          extension: [
            buildKenyaSchedulingParameters({
              days: { mon: weekday, tue: weekday },
              slotMinutes: 20,
              bufferMinutes: 5,
              visitTypes: ['in-person', 'video'],
              timeZone: 'Africa/Nairobi',
            }),
          ],
        })
    ).body;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('20-minute appointments every 25 minutes, in both stretches of the day, Nairobi time', async () => {
    const slots = await find(schedule);
    const starts = slots.map((s) => s.start);
    // 08:00–13:00: 12 slots (08:00 … 12:35); 14:00–17:00: 7 slots (14:00 … 16:30)
    expect(slots).toHaveLength(19);
    expect(starts.slice(0, 3)).toEqual(['2026-11-30T05:00:00.000Z', '2026-11-30T05:25:00.000Z', '2026-11-30T05:50:00.000Z']);
    expect(starts).toContain('2026-11-30T09:35:00.000Z');
    expect(starts).not.toContain('2026-11-30T10:00:00.000Z');
    expect(starts.at(-1)).toBe('2026-11-30T13:30:00.000Z');
    expect(new Date(slots[0].end).getTime() - new Date(slots[0].start).getTime()).toBe(20 * 60_000);
  });

  test('a booked appointment and leave take their time away', async () => {
    const book = await request(app)
      .post('/fhir/R4/Appointment/$book')
      .set('Authorization', `Bearer ${token}`)
      .send({
        resourceType: 'Parameters',
        parameter: [
          {
            name: 'slot',
            resource: {
              resourceType: 'Slot',
              schedule: createReference(schedule),
              start: '2026-11-30T05:25:00Z',
              end: '2026-11-30T05:45:00Z',
              status: 'free',
              serviceType: [{ coding: [{ system: KenyaVisitTypeSystem, code: 'in-person' }] }],
            },
          },
        ],
      });
    expect(book.status).toBe(201);
    expect((await find(schedule)).map((s) => s.start)).not.toContain('2026-11-30T05:25:00.000Z');

    // Leave for the afternoon
    const leave = await request(app)
      .post('/fhir/R4/Slot')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', ContentType.FHIR_JSON)
      .send({ resourceType: 'Slot', schedule: createReference(schedule), status: 'busy-unavailable', start: '2026-11-30T11:00:00Z', end: '2026-11-30T14:00:00Z', comment: 'Leave' });
    expect(leave.status).toBe(201);
    const after = await find(schedule);
    expect(after).toHaveLength(11);
    expect(after.every((s) => s.start < '2026-11-30T11:00:00Z')).toBe(true);
  });
});
