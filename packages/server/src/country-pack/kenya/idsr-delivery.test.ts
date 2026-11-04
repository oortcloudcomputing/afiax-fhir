// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { ContentType, createReference, KenyaIcd11System, sleep } from '@medplum/core';
import type { Bundle, Condition, Organization, Patient, Project, Task } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { sendEmail } from '../../email/email';
import { getGlobalSystemRepo } from '../../fhir/repo';
import { createTestProject, withTestContext } from '../../test.setup';
import { runWeeklyIdsrForProject } from '../../workers/kenya-surveillance';
import { retryFailedKenyaIdsrDeliveries } from './idsr-delivery';
import { buildKenyaJobContext } from './job-context';

jest.mock('../../email/email', () => ({ sendEmail: jest.fn(async () => undefined) }));

// Intercept only KHIS calls; everything else (e.g. KNHTS) uses the real fetch
let mockKhisAvailable = true;
const mockKhisCalls: { url: string; body: any }[] = [];
jest.mock('node-fetch', () => {
  const actual = jest.requireActual('node-fetch');
  const mockFetch = jest.fn(async (url: string, init?: { body?: string }) => {
    if (!url.includes('hiskenya')) {
      return actual(url, init);
    }
    mockKhisCalls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined });
    if (!mockKhisAvailable) {
      throw new Error('connect ECONNREFUSED');
    }
    const json = url.includes('/api/tracker')
      ? {
          status: 'OK',
          validationReport: { errorReports: [] },
          bundleReport: { typeReportMap: { EVENT: { objectReports: [{ uid: 'EvtUid12345' }] } } },
        }
      : { status: 'SUCCESS', importCount: { imported: 3, updated: 0 } };
    const text = JSON.stringify(json);
    return { ok: true, status: 200, json: async () => json, text: async () => text };
  });
  return Object.assign(mockFetch, { default: mockFetch, __esModule: true });
});

const app = express();
let accessToken: string;
let project: WithId<Project>;

const eventProgram = {
  program: 'IdsrProgUid1',
  programStage: 'IdsrStage001',
  dataElements: { disease: 'DeDisease01', icd11Code: 'DeIcd11Code', sex: 'DeSex000001', county: 'DeCounty001' },
};

function fhir(method: 'get' | 'post', path: string): request.Test {
  const req = method === 'get' ? request(app).get(`/fhir/R4/${path}`) : request(app).post(`/fhir/R4/${path}`);
  return req.set('Authorization', 'Bearer ' + accessToken).set('Content-Type', ContentType.FHIR_JSON);
}

async function createCholera(): Promise<Condition> {
  const patient = await fhir('post', 'Patient').send({
    resourceType: 'Patient',
    gender: 'female',
    birthDate: '1985-03-02',
    address: [{ use: 'home', state: 'Kisumu', district: 'Kisumu East' }],
  } satisfies Patient);
  const res = await fhir('post', 'Condition').send({
    resourceType: 'Condition',
    subject: createReference(patient.body),
    code: { coding: [{ system: KenyaIcd11System, code: '1A00', display: 'Cholera' }] },
    verificationStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
    },
    onsetDateTime: '2026-11-03',
  } satisfies Condition);
  expect(res.status).toBe(201);
  return res.body;
}

async function waitForNotificationTask(condition: Condition, businessStatus: string): Promise<Task | undefined> {
  for (let i = 0; i < 50; i++) {
    const res = await fhir('get', `Task?focus=Condition/${condition.id}`);
    const task = (res.body as Bundle<Task>).entry
      ?.map((e) => e.resource as Task)
      .find((t) => t.code?.coding?.[0]?.code === 'idsr-immediate-notification');
    if (task?.businessStatus?.text === businessStatus) {
      return task;
    }
    await sleep(100);
  }
  return undefined;
}

describe('IDSR reporting to KHIS', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const result = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: {
        name: 'Kisumu Test Hospital',
        setting: [
          { name: 'countryPack', valueString: 'kenya' },
          { name: 'kenyaKhisEnvironment', valueString: 'uat' },
          { name: 'kenyaKhisMoh505DataSetUid', valueString: 'Moh505Uid01' },
          {
            name: 'kenyaKhisDataElementMapping',
            valueString: JSON.stringify({ '1A00': { confirmed: 'CholeraConf' } }),
          },
          { name: 'kenyaKhisIdsrEventProgram', valueString: JSON.stringify(eventProgram) },
          { name: 'kenyaIdsrNotificationEmail', valueString: 'surveillance@kisumu.go.ke' },
        ],
        secret: [
          { name: 'kenyaKhisUsername', valueString: 'afiax' },
          { name: 'kenyaKhisPassword', valueString: 'secret' },
        ],
      },
    });
    accessToken = result.accessToken;
    project = result.project;
    await withTestContext(() =>
      getGlobalSystemRepo().createResource<Organization>({
        resourceType: 'Organization',
        meta: { project: project.id },
        name: 'Kisumu Test Hospital',
        identifier: [{ system: 'https://afiax.africa/kenya/identifier/mfl-code', value: '13023' }],
      })
    );
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(() => {
    mockKhisCalls.length = 0;
    mockKhisAvailable = true;
    (sendEmail as jest.Mock).mockClear();
  });

  test('Cholera diagnosis is sent to KHIS and the county in real time (DHA REP-IMM-001)', async () => {
    const condition = await createCholera();

    const task = await waitForNotificationTask(condition, 'reported');
    expect(task).toBeDefined();
    expect(task?.status).toBe('completed');
    expect(task?.output?.find((o) => o.type?.text === 'khisEventUid')?.valueString).toBe('EvtUid12345');

    const event = mockKhisCalls.find((c) => c.url.includes('/api/tracker'))?.body.events[0];
    expect(event).toMatchObject({ program: 'IdsrProgUid1', programStage: 'IdsrStage001', orgUnit: '13023' });
    expect(event.occurredAt).toBe('2026-11-03');
    expect(event.dataValues).toEqual(
      expect.arrayContaining([
        { dataElement: 'DeDisease01', value: 'Cholera' },
        { dataElement: 'DeIcd11Code', value: '1A00' },
        { dataElement: 'DeSex000001', value: 'female' },
        { dataElement: 'DeCounty001', value: 'Kisumu' },
      ])
    );

    expect(sendEmail).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ to: ['surveillance@kisumu.go.ke'], subject: expect.stringContaining('Cholera') })
    );
  });

  test('Failed KHIS delivery is retried', async () => {
    mockKhisAvailable = false;
    const condition = await createCholera();
    const failed = await waitForNotificationTask(condition, 'delivery-failed');
    expect(failed?.note?.at(-1)?.text).toContain('ECONNREFUSED');

    mockKhisAvailable = true;
    const result = await withTestContext(() => retryFailedKenyaIdsrDeliveries(buildKenyaJobContext(project)));
    expect(result.delivered).toBeGreaterThanOrEqual(1);
    expect(await waitForNotificationTask(condition, 'reported')).toBeDefined();
  });

  test('Weekly MOH 505 report is submitted automatically, once per week (DHA REP-IDSR-001)', async () => {
    // Monday 2026-11-09 covers the week 2026-11-02 to 2026-11-08, which includes the cholera cases above
    const monday = new Date('2026-11-09T03:00:00Z');
    const first = await withTestContext(() => runWeeklyIdsrForProject(project, monday));
    expect(first).toHaveLength(1);

    const push = mockKhisCalls.find((c) => c.url.includes('/api/dataValueSets'));
    expect(push?.body).toMatchObject({ dataSet: 'Moh505Uid01', orgUnit: '13023' });
    const cholera = push?.body.dataValues.find((v: { dataElement: string }) => v.dataElement === 'CholeraConf');
    expect(cholera.value).toBeGreaterThanOrEqual(2);

    // The export Task records KHIS's confirmation
    const tasks = await fhir('get', 'Task?code=https://afiax.africa/CodeSystem/kenya-task-type|khis-weekly-export');
    const exportTask = (tasks.body as Bundle<Task>).entry?.[0]?.resource;
    expect(exportTask?.status).toBe('completed');
    expect(exportTask?.output?.find((o) => o.type?.text === 'dhis2ImportStatus')?.valueString).toBe('SUCCESS');

    // A second run in the same week does not submit again
    mockKhisCalls.length = 0;
    const second = await withTestContext(() => runWeeklyIdsrForProject(project, monday));
    expect(second).toHaveLength(0);
    expect(mockKhisCalls).toHaveLength(0);
  });
});
