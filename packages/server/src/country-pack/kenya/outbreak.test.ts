// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, KenyaIcd11System } from '@medplum/core';
import type { Condition, DocumentReference, Encounter, Organization, Patient, Project, Task } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import { sendEmail } from '../../email/email';
import { getProjectSystemRepo } from '../../fhir/repo';
import { withTestContext } from '../../test.setup';
import {
  getKenyaOutbreakRules,
  KenyaDocumentTypeSystem,
  KenyaOutbreakDefaultRules,
  KenyaPublicHealthEventReportCode,
  KenyaPublicHealthEventTaskCode,
  KenyaTaskTypeSystem,
  matchesKenyaOutbreakCode,
} from './outbreak';

jest.mock('../../email/email', () => ({
  ...jest.requireActual('../../email/email'),
  sendEmail: jest.fn(async () => undefined),
}));

// Diagnosis codes are validated against KNHTS on save; this test does not reach the network.
jest.mock('./knhts', () => ({
  ...jest.requireActual('./knhts'),
  isKnhtsValidationEnabled: () => false,
}));

describe('Kenya outbreak rules', () => {
  test('defaults to DHA REP-PHE-001: 5 measles cases in 3 days at a facility', () => {
    expect(getKenyaOutbreakRules({ setting: [] })).toEqual(KenyaOutbreakDefaultRules);
    expect(KenyaOutbreakDefaultRules[0]).toMatchObject({
      icd11: '1F03',
      threshold: 5,
      windowDays: 3,
      scope: 'facility',
    });
  });

  test('reads configured rules and drops invalid entries', () => {
    const project: Project = {
      resourceType: 'Project',
      setting: [
        {
          name: 'kenyaOutbreakRules',
          valueString: JSON.stringify([
            { id: 'cholera', icd11: '1A00', display: 'Cholera', threshold: 1, windowDays: 7, scope: 'county' },
            { icd11: '', threshold: 3, windowDays: 2 },
            { icd11: '1F03', threshold: 0, windowDays: 3 },
          ]),
        },
      ],
    };
    expect(getKenyaOutbreakRules(project)).toEqual([
      { id: 'cholera', icd11: '1A00', display: 'Cholera', threshold: 1, windowDays: 7, scope: 'county' },
    ]);
  });

  test('falls back to the defaults when the setting is not valid JSON', () => {
    const project: Project = {
      resourceType: 'Project',
      setting: [{ name: 'kenyaOutbreakRules', valueString: '{oops' }],
    };
    expect(getKenyaOutbreakRules(project)).toEqual(KenyaOutbreakDefaultRules);
  });

  test('matches a code, its subcategories and postcoordinated forms', () => {
    expect(matchesKenyaOutbreakCode('1F03', '1F03')).toBe(true);
    expect(matchesKenyaOutbreakCode('1F03.0', '1F03')).toBe(true);
    expect(matchesKenyaOutbreakCode('1F03&XN0Q9', '1F03')).toBe(true);
    expect(matchesKenyaOutbreakCode('1F030', '1F03')).toBe(false);
    expect(matchesKenyaOutbreakCode('1F04', '1F03')).toBe(false);
  });
});

describe('Kenya outbreak detection on Condition save (REP-PHE-001)', () => {
  const app = express();
  let project: WithId<Project>;
  let token: string;
  let facilityA: WithId<Organization>;
  let facilityB: WithId<Organization>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    const registered = await withTestContext(() =>
      registerNew({
        firstName: 'Surveillance',
        lastName: 'Officer',
        projectName: 'Kenya Outbreak Project',
        email: `outbreak${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    token = registered.accessToken;
    project = await withTestContext(() =>
      getProjectSystemRepo(registered.project).updateResource<Project>({
        ...registered.project,
        setting: [
          { name: 'countryPack', valueString: 'kenya' },
          { name: 'kenyaOutbreakAlertEmails', valueString: 'dsru@example.go.ke, county-surveillance@example.go.ke' },
        ],
      })
    );
    const repo = getProjectSystemRepo(project);
    facilityA = await withTestContext(() =>
      repo.createResource<Organization>({
        resourceType: 'Organization',
        meta: { project: project.id },
        name: 'Ahero Health Centre',
      })
    );
    facilityB = await withTestContext(() =>
      repo.createResource<Organization>({
        resourceType: 'Organization',
        meta: { project: project.id },
        name: 'Nyando Dispensary',
      })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    (sendEmail as jest.Mock).mockClear();
  });

  async function post<T>(resource: T & { resourceType: string }): Promise<WithId<T>> {
    const res = await request(app)
      .post(`/fhir/R4/${resource.resourceType}`)
      .set('Authorization', 'Bearer ' + token)
      .send(resource);
    expect(res.status).toBe(201);
    return res.body;
  }

  async function measlesCase(
    facility: WithId<Organization>,
    hoursAgo: number,
    verification = 'confirmed'
  ): Promise<WithId<Condition>> {
    const patient = await post<Patient>({
      resourceType: 'Patient',
      gender: 'female',
      birthDate: '2022-03-01',
      address: [{ state: 'Kisumu', district: 'Nyando', city: 'Ahero' }],
    });
    const encounter = await post<Encounter>({
      resourceType: 'Encounter',
      status: 'finished',
      class: { code: 'AMB' },
      subject: createReference(patient),
      serviceProvider: createReference(facility),
    });
    return post<Condition>({
      resourceType: 'Condition',
      subject: createReference(patient),
      encounter: createReference(encounter),
      verificationStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: verification }],
      },
      code: { coding: [{ system: KenyaIcd11System, code: '1F03', display: 'Measles' }] },
      onsetDateTime: new Date(Date.now() - hoursAgo * 3600 * 1000).toISOString(),
    });
  }

  async function events(): Promise<WithId<Task>[]> {
    const res = await request(app)
      .get(`/fhir/R4/Task?code=${KenyaTaskTypeSystem}|${KenyaPublicHealthEventTaskCode}`)
      .set('Authorization', 'Bearer ' + token);
    return (res.body.entry ?? []).map((e: { resource: WithId<Task> }) => e.resource);
  }

  async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs = 8000): Promise<T> {
    const start = Date.now();
    for (;;) {
      const value = await check();
      if (value !== undefined) {
        return value;
      }
      if (Date.now() - start > timeoutMs) {
        throw new Error('timed out waiting');
      }
      await new Promise((resolve) => {
        setTimeout(resolve, 200);
      });
    }
  }

  test('4 cases do not raise an event; the 5th within 3 days does, with a report and an alert', async () => {
    // A refuted case and a case 4 days ago do not count.
    await measlesCase(facilityA, 2, 'refuted');
    await measlesCase(facilityA, 96);
    for (const hoursAgo of [60, 40, 20, 10]) {
      await measlesCase(facilityA, hoursAgo);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
    expect(await events()).toHaveLength(0);

    const fifth = await measlesCase(facilityA, 1);
    const [event] = await waitFor(async () => {
      const found = await events();
      return found.length > 0 ? found : undefined;
    });

    expect(event).toMatchObject({ status: 'requested', priority: 'urgent', businessStatus: { text: 'alert-sent' } });
    expect(event.input).toHaveLength(5);
    expect(event.focus?.reference).toBe(`Condition/${fifth.id}`);
    expect(event.description).toContain('Measles (ICD-11 1F03): 5 cases in 3 day(s) at Ahero Health Centre');

    expect(sendEmail).toHaveBeenCalledTimes(1);
    const mail = (sendEmail as jest.Mock).mock.calls[0][1];
    expect(mail.to).toEqual(['dsru@example.go.ke', 'county-surveillance@example.go.ke']);
    expect(mail.subject).toContain('[PUBLIC HEALTH ALERT] Measles: 5 cases in 3 day(s), Ahero Health Centre');
    expect(mail.text).not.toContain('Patient/');

    const reportRef = event.output?.[0]?.valueReference?.reference as string;
    const report = (
      await request(app)
        .get(`/fhir/R4/${reportRef}`)
        .set('Authorization', 'Bearer ' + token)
    ).body as DocumentReference;
    expect(report.type?.coding?.[0]).toMatchObject({
      system: KenyaDocumentTypeSystem,
      code: KenyaPublicHealthEventReportCode,
    });
    const content = JSON.parse(Buffer.from(report.content[0].attachment.data as string, 'base64').toString('utf8'));
    expect(content).toMatchObject({
      disease: 'Measles',
      icd11Code: '1F03',
      caseCount: 5,
      confirmedCount: 5,
      place: 'Ahero Health Centre',
    });
    expect(content.cases[0]).toMatchObject({ caseNumber: 1, sex: 'female', county: 'Kisumu', subCounty: 'Nyando' });
    expect(content.cases[0]).not.toHaveProperty('name');
  });

  test('a further case joins the open event without a second alert', async () => {
    await measlesCase(facilityA, 0.5);
    const [event] = await waitFor(async () => {
      const found = await events();
      return found.length === 1 && (found[0].input?.length ?? 0) === 6 ? found : undefined;
    });
    expect(event.input).toHaveLength(6);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('cases saved at the same moment raise a single event', async () => {
    const facilityC = await withTestContext(() =>
      getProjectSystemRepo(project).createResource<Organization>({
        resourceType: 'Organization',
        meta: { project: project.id },
        name: 'Kombewa Sub-County Hospital',
      })
    );
    await Promise.all([1, 2, 3, 4, 5, 6].map((hoursAgo) => measlesCase(facilityC, hoursAgo)));
    const found = await waitFor(async () => {
      const all = (await events()).filter((e) => e.description?.includes('Kombewa'));
      return all.length > 0 ? all : undefined;
    });
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
    const settled = (await events()).filter((e) => e.description?.includes('Kombewa'));
    expect(found.length).toBe(1);
    expect(settled).toHaveLength(1);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  test('cases at another facility are counted separately', async () => {
    for (const hoursAgo of [5, 4, 3, 2]) {
      await measlesCase(facilityB, hoursAgo);
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1500);
    });
    expect((await events()).filter((e) => e.description?.includes('Nyando'))).toHaveLength(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
