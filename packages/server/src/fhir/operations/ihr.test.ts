// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  createReference,
  KenyaIcd11System,
  KenyaIhrAssessmentTaskCode,
  KenyaIhrNotificationTaskCode,
  KenyaIhrTaskTypeSystem,
  sleep,
} from '@medplum/core';
import type { Bundle, Condition, DocumentReference, Parameters, Patient, Task } from '@medplum/fhirtypes';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { loadTestConfig } from '../../config/loader';
import { createTestProject } from '../../test.setup';

const app = express();
let accessToken: string;
let otherAccessToken: string;

function fhir(method: 'get' | 'post', path: string, token = accessToken): request.Test {
  const req = method === 'get' ? request(app).get(`/fhir/R4/${path}`) : request(app).post(`/fhir/R4/${path}`);
  return req.set('Authorization', 'Bearer ' + token).set('Content-Type', ContentType.FHIR_JSON);
}

async function createPatient(): Promise<Patient & { id: string }> {
  const res = await fhir('post', 'Patient').send({
    resourceType: 'Patient',
    name: [{ given: ['John'], family: 'Doe' }],
    gender: 'male',
    birthDate: '1990-01-15',
    address: [{ use: 'home', state: 'Nairobi', country: 'KE' }],
  } satisfies Patient);
  expect(res.status).toBe(201);
  return res.body;
}

async function createCondition(patient: Patient & { id: string }, code: string, display: string): Promise<Condition> {
  const res = await fhir('post', 'Condition').send({
    resourceType: 'Condition',
    subject: createReference(patient),
    code: { coding: [{ system: KenyaIcd11System, code, display }], text: display },
    verificationStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status', code: 'confirmed' }],
    },
    onsetDateTime: '2026-11-01',
  } satisfies Condition);
  expect(res.status).toBe(201);
  return res.body;
}

// The IHR flag runs after the write returns, so poll for its Task
async function waitForIhrTask(condition: Condition, code: string): Promise<Task | undefined> {
  for (let i = 0; i < 50; i++) {
    const res = await fhir('get', `Task?focus=Condition/${condition.id}&code=${KenyaIhrTaskTypeSystem}|${code}`);
    const task = (res.body as Bundle<Task>).entry?.[0]?.resource;
    if (task) {
      return task;
    }
    await sleep(100);
  }
  return undefined;
}

function output(body: Parameters, name: string): NonNullable<Parameters['parameter']>[number] | undefined {
  return body.parameter?.find((p) => p.name === name);
}

describe('IHR (2005) notification', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    ({ accessToken } = await createTestProject({
      withAccessToken: true,
      project: { name: 'Afiax Test Hospital', setting: [{ name: 'countryPack', valueString: 'kenya' }] },
      membership: { admin: true },
    }));
    ({ accessToken: otherAccessToken } = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
    }));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Novel coronavirus: flagged, assessed, reported and escalated to WHO (DHA REP-IHR-001)', async () => {
    const patient = await createPatient();
    const condition = await createCondition(patient, 'RA01', 'COVID-19');

    // 1-2. The system flags it as needing IHR assessment
    const assessmentTask = await waitForIhrTask(condition, KenyaIhrAssessmentTaskCode);
    expect(assessmentTask).toBeDefined();
    expect(assessmentTask?.businessStatus?.text).toBe('assessment-required');
    expect(assessmentTask?.description).toContain('48 hours');

    // 3. Run the Annex 2 decision instrument and generate the report
    const res = await fhir('post', `Condition/${condition.id}/$ihr-assessment`).send({
      resourceType: 'Parameters',
      parameter: [
        { name: 'seriousImpact', valueBoolean: true },
        { name: 'unusualOrUnexpected', valueBoolean: true },
        { name: 'internationalSpread', valueBoolean: true },
        { name: 'travelOrTradeRestrictions', valueBoolean: false },
        { name: 'travelHistory', valueString: 'Arrived from abroad via JKIA on 2026-10-28' },
        { name: 'controlMeasures', valueString: 'Isolated; 12 contacts listed for follow-up' },
      ],
    } satisfies Parameters);
    expect(res.status).toBe(200);
    expect(output(res.body, 'notifiable')?.valueBoolean).toBe(true);
    expect(output(res.body, 'category')?.valueCode).toBe('decision-instrument');
    expect(output(res.body, 'yesCount')?.valueInteger).toBe(3);

    // 4. The report carries the WHO IHR elements and no direct identifiers
    const report = JSON.parse(output(res.body, 'reportJson')?.valueString as string);
    expect(report).toMatchObject({
      reportingState: 'Kenya',
      reportingFacility: 'Afiax Test Hospital',
      event: {
        disease: 'COVID-19 / novel coronavirus',
        icd11Code: 'RA01',
        verificationStatus: 'confirmed',
        onsetDate: '2026-11-01',
        county: 'Nairobi',
        caseCount: 1,
        deathCount: 0,
      },
      caseDemographics: { sex: 'male', deceased: false },
      exposureAndTravelHistory: 'Arrived from abroad via JKIA on 2026-10-28',
      riskAssessment: { notifiable: true },
    });
    expect(report.caseDemographics.ageYears).toBeGreaterThanOrEqual(36);
    expect(report.nationalFocalPoint).toContain('National IHR Focal Point');
    expect(report.escalationPathway).toHaveLength(4);
    const reportText = JSON.stringify(report);
    expect(reportText).not.toContain('John');
    expect(reportText).not.toContain('Doe');

    const docRef = await fhir('get', output(res.body, 'report')?.valueReference?.reference as string);
    expect((docRef.body as DocumentReference).content?.[0]?.attachment?.contentType).toBe('application/json');

    // The assessment Task is closed with the outcome
    const closed = await fhir('get', `Task/${assessmentTask?.id}`);
    expect(closed.body.status).toBe('completed');
    expect(closed.body.businessStatus.text).toBe('notifiable');

    // 5. Escalation pathway: County -> National IHR Focal Point -> WHO
    const taskRef = output(res.body, 'task')?.valueReference?.reference as string;
    const stages = [];
    for (let i = 0; i < 3; i++) {
      const esc = await fhir('post', `${taskRef}/$ihr-escalate`).send({
        resourceType: 'Parameters',
        parameter: [{ name: 'note', valueString: `step ${i + 1}` }],
      });
      expect(esc.status).toBe(200);
      stages.push(output(esc.body, 'stage')?.valueCode);
    }
    expect(stages).toStrictEqual(['county-notified', 'nfp-notified', 'who-notified']);

    const done = await fhir('get', taskRef);
    expect(done.body.status).toBe('completed');
    expect(done.body.note).toHaveLength(3);

    // No step after WHO
    const extra = await fhir('post', `${taskRef}/$ihr-escalate`).send({ resourceType: 'Parameters' });
    expect(extra.status).toBe(400);

    // A second notification for the same Condition is refused
    const again = await fhir('post', `Condition/${condition.id}/$ihr-assessment`).send({
      resourceType: 'Parameters',
      parameter: [
        { name: 'seriousImpact', valueBoolean: true },
        { name: 'internationalSpread', valueBoolean: true },
      ],
    });
    expect(again.status).toBe(400);
  });

  test('Always-notifiable disease (SARS) is reported without an assessment step', async () => {
    const patient = await createPatient();
    const condition = await createCondition(patient, '1D65', 'Severe acute respiratory syndrome');

    const task = await waitForIhrTask(condition, KenyaIhrNotificationTaskCode);
    expect(task).toBeDefined();
    expect(task?.businessStatus?.text).toBe('awaiting-county');
    expect(task?.output?.[0]?.valueReference?.reference).toMatch(/^DocumentReference\//);

    const assessment = await fhir(
      'get',
      `Task?focus=Condition/${condition.id}&code=${KenyaIhrTaskTypeSystem}|${KenyaIhrAssessmentTaskCode}`
    );
    expect(assessment.body.entry ?? []).toHaveLength(0);
  });

  test('Fewer than two criteria: not notifiable, no report', async () => {
    const patient = await createPatient();
    const condition = await createCondition(patient, '1A00', 'Cholera');
    await waitForIhrTask(condition, KenyaIhrAssessmentTaskCode);

    const res = await fhir('post', `Condition/${condition.id}/$ihr-assessment`).send({
      resourceType: 'Parameters',
      parameter: [{ name: 'seriousImpact', valueBoolean: true }],
    });
    expect(res.status).toBe(200);
    expect(output(res.body, 'notifiable')?.valueBoolean).toBe(false);
    expect(output(res.body, 'report')).toBeUndefined();
  });

  test('Non-IHR condition is not flagged but can still be assessed as an unusual event', async () => {
    const patient = await createPatient();
    const condition = await createCondition(patient, 'CA04', 'Acute pharyngitis');
    await sleep(500);
    const tasks = await fhir('get', `Task?focus=Condition/${condition.id}`);
    expect(tasks.body.entry ?? []).toHaveLength(0);

    const res = await fhir('post', `Condition/${condition.id}/$ihr-assessment`).send({
      resourceType: 'Parameters',
      parameter: [
        { name: 'unusualOrUnexpected', valueBoolean: true },
        { name: 'internationalSpread', valueBoolean: true },
      ],
    });
    expect(output(res.body, 'category')?.valueCode).toBe('other-event');
    expect(output(res.body, 'notifiable')?.valueBoolean).toBe(true);
  });

  test('Requires the Kenya country pack', async () => {
    const patient = await createPatient();
    const condition = await createCondition(patient, 'RA01', 'COVID-19');
    const res = await fhir('post', `Condition/${condition.id}/$ihr-assessment`, otherAccessToken).send({
      resourceType: 'Parameters',
    });
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toContain('Kenya country pack');
  });
});
