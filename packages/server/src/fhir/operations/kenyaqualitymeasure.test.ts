// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference } from '@medplum/core';
import type {
  DocumentReference,
  Immunization,
  MeasureReport,
  Organization,
  Patient,
  Project,
} from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import {
  KenyaCoreMeasureProfile,
  KenyaCoreMeasureReportProfile,
  KenyaMcv1Coverage,
  KenyaVaccineAtcSystem,
} from '../../country-pack/kenya/quality-measures';
import { withTestContext } from '../../test.setup';
import { getProjectSystemRepo } from '../repo';

const app = express();

describe('Measure/$kenya-evaluate-measure (DHA FUNC-QUAL-001)', () => {
  let project: WithId<Project>;
  let token: string;
  let facility: WithId<Organization>;
  let otherFacility: WithId<Organization>;
  let vaccinatedDose: WithId<Immunization>;

  const post = async <T>(resource: T & { resourceType: string }): Promise<WithId<T>> => {
    const res = await request(app)
      .post(`/fhir/R4/${resource.resourceType}`)
      .set('Authorization', 'Bearer ' + token)
      .send(resource);
    expect(res.status).toBe(201);
    return res.body;
  };

  const child = (birthDate: string, org: WithId<Organization>): Promise<WithId<Patient>> =>
    post<Patient>({ resourceType: 'Patient', gender: 'female', birthDate, managingOrganization: createReference(org) });

  const vaccine = (
    patient: WithId<Patient>,
    code: string,
    display: string,
    date: string,
    status = 'completed'
  ): Promise<WithId<Immunization>> =>
    post<Immunization>({
      resourceType: 'Immunization',
      status: status as Immunization['status'],
      vaccineCode: { coding: [{ system: KenyaVaccineAtcSystem, code, display }] },
      patient: createReference(patient),
      occurrenceDateTime: date,
      protocolApplied: [{ series: 'KEPI', doseNumberPositiveInt: 1 }],
    });

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    const registered = await withTestContext(() =>
      registerNew({
        firstName: 'Quality',
        lastName: 'Officer',
        projectName: 'Kenya Quality Measure Project',
        email: `quality${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    token = registered.accessToken;
    project = await withTestContext(() =>
      getProjectSystemRepo(registered.project).updateResource<Project>({
        ...registered.project,
        setting: [{ name: 'countryPack', valueString: 'kenya' }],
      })
    );
    facility = await post<Organization>({ resourceType: 'Organization', name: 'Ahero Health Centre' });
    otherFacility = await post<Organization>({ resourceType: 'Organization', name: 'Nyando Dispensary' });

    // Period ends 2026-10-31: children born 2024-10-31 (exclusive) to 2025-10-31 (inclusive) are 12–23 months.
    const a = await child('2025-04-15', facility); // 18 months, MR1 at 9 months -> numerator
    vaccinatedDose = await vaccine(
      a,
      'J07BD53',
      'measles, combinations with rubella, live attenuated',
      '2026-01-15T09:00:00Z'
    );
    await child('2025-08-20', facility); // 14 months, no vaccine
    const c = await child('2025-02-10', facility); // 20 months, vaccinated after the period
    await vaccine(c, 'J07BD53', 'measles, combinations with rubella, live attenuated', '2026-11-05T09:00:00Z');
    const f = await child('2025-06-01', facility); // 16 months, recorded as not done
    await vaccine(
      f,
      'J07BD53',
      'measles, combinations with rubella, live attenuated',
      '2026-03-01T09:00:00Z',
      'not-done'
    );
    const g = await child('2025-09-25', facility); // 13 months, only BCG
    await vaccine(g, 'J07AN01', 'tuberculosis, live attenuated', '2025-09-26T09:00:00Z');
    const d = await child('2024-04-01', facility); // 30 months: too old
    await vaccine(d, 'J07BD53', 'measles, combinations with rubella, live attenuated', '2025-01-01T09:00:00Z');
    await child('2026-01-01', facility); // 10 months: too young
    const h = await child('2025-01-05', otherFacility); // other facility
    await vaccine(h, 'J07BD53', 'measles, combinations with rubella, live attenuated', '2025-10-05T09:00:00Z');
    expect(project.id).toBeDefined();
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const evaluate = (periodStart: string, periodEnd: string): request.Test =>
    request(app)
      .post('/fhir/R4/Measure/$kenya-evaluate-measure')
      .set('Authorization', 'Bearer ' + token)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'facility', valueReference: { reference: `Organization/${facility.id}` } },
          { name: 'periodStart', valueDate: periodStart },
          { name: 'periodEnd', valueDate: periodEnd },
        ],
      });

  const out = (res: request.Response, name: string): any =>
    res.body.parameter.find((p: { name: string }) => p.name === name);

  test('calculates MCV1 coverage from birth and vaccination dates', async () => {
    const res = await evaluate('2026-10-01', '2026-10-31');
    expect(res.status).toBe(200);
    expect(out(res, 'denominator').valueInteger).toBe(5);
    expect(out(res, 'numerator').valueInteger).toBe(1);
    expect(out(res, 'score').valueDecimal).toBe(0.2);

    const report = (
      await request(app)
        .get(`/fhir/R4/${out(res, 'measureReport').valueReference.reference}`)
        .set('Authorization', 'Bearer ' + token)
    ).body as MeasureReport;
    expect(report.meta?.profile).toContain(KenyaCoreMeasureReportProfile);
    expect(report).toMatchObject({
      status: 'complete',
      type: 'summary',
      measure: KenyaMcv1Coverage.url,
      period: { start: '2026-10-01', end: '2026-10-31' },
      reporter: { reference: `Organization/${facility.id}` },
    });
    const counts = Object.fromEntries(
      report.group?.[0]?.population?.map((p) => [p.code?.coding?.[0]?.code, p.count]) ?? []
    );
    expect(counts).toEqual({ 'initial-population': 5, denominator: 5, numerator: 1 });
    expect(report.evaluatedResource).toEqual([
      expect.objectContaining({ reference: `Immunization/${vaccinatedDose.id}` }),
    ]);
  });

  test('exports the report as CSV, de-identified', async () => {
    const res = await evaluate('2026-10-01', '2026-10-31');
    const doc = (
      await request(app)
        .get(`/fhir/R4/${out(res, 'export').valueReference.reference}`)
        .set('Authorization', 'Bearer ' + token)
    ).body as DocumentReference;
    expect(doc.content[0].attachment.contentType).toBe('text/csv');
    const csv = Buffer.from(doc.content[0].attachment.data as string, 'base64').toString('utf8');
    expect(csv).toContain('Coverage (%),20.0');
    expect(csv).toContain('Denominator,5');
    expect(csv).toContain('J07BD53 measles');
    // 5 children, each one line, no names or ids
    expect(
      csv
        .trim()
        .split('\n')
        .filter((l) => /^\d+,\d+,/.test(l))
    ).toHaveLength(5);
    expect(csv).not.toContain('Patient/');
  });

  test('creates the Kenya Core Measure once and reuses it', async () => {
    await evaluate('2026-01-01', '2026-12-31');
    const res = await request(app)
      .get(`/fhir/R4/Measure?url=${encodeURIComponent(KenyaMcv1Coverage.url)}`)
      .set('Authorization', 'Bearer ' + token);
    expect(res.body.entry).toHaveLength(1);
    expect(res.body.entry[0].resource.meta.profile).toContain(KenyaCoreMeasureProfile);
    expect(res.body.entry[0].resource.scoring.coding[0].code).toBe('proportion');
  });

  test('a period with no children in range gives no score', async () => {
    const res = await evaluate('2020-01-01', '2020-01-31');
    expect(res.status).toBe(200);
    expect(out(res, 'denominator').valueInteger).toBe(0);
    expect(out(res, 'score')).toBeUndefined();
  });

  test('rejects an invalid period', async () => {
    const res = await evaluate('2026-10-31', '2026-10-01');
    expect(res.status).toBe(400);
  });
});
