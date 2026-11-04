// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  ContentType,
  createReference,
  KenyaAllergyCodeSystem,
  KenyaCdsOverrideExtensionUrl,
  KenyaHealthProductSystem,
  sleep,
} from '@medplum/core';
import type {
  AllergyIntolerance,
  Bundle,
  DetectedIssue,
  MedicationRequest,
  Observation,
  OperationOutcome,
  Parameters,
  Patient,
} from '@medplum/fhirtypes';
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

const amoxicillin = {
  coding: [{ system: KenyaHealthProductSystem, code: 'PH12907', display: 'Amoxicillin 500 mg Oral Capsule' }],
};

function order(patient: Patient, medicationCodeableConcept = amoxicillin): MedicationRequest {
  return {
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: createReference(patient),
    medicationCodeableConcept,
  };
}

async function waitForIssues(query: string, count = 1): Promise<DetectedIssue[]> {
  for (let i = 0; i < 50; i++) {
    const res = await fhir('get', `DetectedIssue?${query}`);
    const issues = ((res.body as Bundle<DetectedIssue>).entry ?? []).map((e) => e.resource as DetectedIssue);
    if (issues.length >= count) {
      return issues;
    }
    await sleep(100);
  }
  return [];
}

describe('Kenya clinical decision support (DHA FUNC-CDS-001, FUNC-MED-001)', () => {
  let patient: Patient;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initApp(app, config);
    const kenya = await createTestProject({
      withAccessToken: true,
      membership: { admin: true },
      project: { name: 'Kenya CDS', setting: [{ name: 'countryPack', valueString: 'kenya' }] },
    });
    accessToken = kenya.accessToken;
    const other = await createTestProject({ withAccessToken: true, membership: { admin: true } });
    otherAccessToken = other.accessToken;

    const res = await fhir('post', 'Patient').send({
      resourceType: 'Patient',
      gender: 'female',
      birthDate: '1990-02-01',
    });
    patient = res.body;
    const allergy = await fhir('post', 'AllergyIntolerance').send({
      resourceType: 'AllergyIntolerance',
      patient: createReference(patient),
      criticality: 'high',
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
      },
      code: {
        coding: [{ system: KenyaAllergyCodeSystem, code: 'ORG-00001-CPT-0002015', display: 'Allergy to penicillin' }],
      },
    } satisfies AllergyIntolerance);
    expect(allergy.status).toBe(201);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('$cds-check reports the allergy before the order is saved', async () => {
    const res = await fhir('post', 'MedicationRequest/$cds-check').send(order(patient));
    expect(res.status).toBe(200);
    const alerts = (res.body as Parameters).parameter ?? [];
    expect(alerts).toHaveLength(1);
    const parts = Object.fromEntries((alerts[0].part ?? []).map((p) => [p.name, p.valueString ?? p.valueCode]));
    expect(parts).toMatchObject({ severity: 'high', category: 'allergy' });
    expect(parts.title).toContain('Allergy to penicillin');
  });

  test('prescribing amoxicillin to a penicillin-allergic patient is blocked', async () => {
    const res = await fhir('post', 'MedicationRequest').send(order(patient));
    expect(res.status).toBe(400);
    const outcome = res.body as OperationOutcome;
    expect(outcome.issue?.[0]?.details?.text).toContain('Allergy');
    expect(outcome.issue?.at(-1)?.details?.text).toContain(KenyaCdsOverrideExtensionUrl);
  });

  test('an override with a reason is accepted and recorded as a DetectedIssue', async () => {
    const res = await fhir('post', 'MedicationRequest').send({
      ...order(patient),
      extension: [
        { url: KenyaCdsOverrideExtensionUrl, valueString: 'Allergy de-labelled after negative oral challenge' },
      ],
    });
    expect(res.status).toBe(201);
    const [issue] = await waitForIssues(`implicated=MedicationRequest/${res.body.id}`);
    expect(issue).toMatchObject({ severity: 'high', patient: { reference: `Patient/${patient.id}` } });
    expect(issue.mitigation?.[0]?.action?.text).toContain('negative oral challenge');
  });

  test('an unrelated medicine is accepted; a later interacting order is flagged', async () => {
    const warfarin = { coding: [{ system: KenyaHealthProductSystem, code: 'AC10255', display: 'Warfarin' }] };
    expect((await fhir('post', 'MedicationRequest').send(order(patient, warfarin))).status).toBe(201);
    const ibuprofen = { coding: [{ system: KenyaHealthProductSystem, code: 'AC11019', display: 'Ibuprofen' }] };
    const res = await fhir('post', 'MedicationRequest').send(order(patient, ibuprofen));
    expect(res.status).toBe(400);
    expect((res.body as OperationOutcome).issue?.[0]?.details?.text).toContain('Interaction');
  });

  test('a critical vital sign raises a clinical alert', async () => {
    const res = await fhir('post', 'Observation').send({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: { coding: [{ system: 'http://loinc.org', code: '59408-5', display: 'Oxygen saturation' }] },
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: { value: 86, unit: '%', code: '%', system: 'http://unitsofmeasure.org' },
    } satisfies Observation);
    expect(res.status).toBe(201);
    const [issue] = await waitForIssues(`implicated=Observation/${res.body.id}`);
    expect(issue.code?.text).toContain('hypoxaemia');
    expect(issue.detail).toContain('NEWS2');
  });

  test('a high INR on warfarin raises a drug-lab alert', async () => {
    const res = await fhir('post', 'Observation').send({
      resourceType: 'Observation',
      status: 'final',
      subject: createReference(patient),
      code: { coding: [{ system: 'http://loinc.org', code: '6301-6', display: 'INR' }] },
      effectiveDateTime: new Date().toISOString(),
      valueQuantity: { value: 4.5, unit: '{INR}', code: '{INR}' },
    } satisfies Observation);
    const issues = await waitForIssues(`implicated=Observation/${res.body.id}`);
    expect(issues.map((i) => i.code?.coding?.[0]?.code)).toContain('drug-lab');
  });

  test('projects without the Kenya pack are not affected', async () => {
    const p = await fhir('post', 'Patient', otherAccessToken).send({ resourceType: 'Patient' });
    await fhir('post', 'AllergyIntolerance', otherAccessToken).send({
      resourceType: 'AllergyIntolerance',
      patient: createReference(p.body),
      code: { text: 'Penicillin' },
      clinicalStatus: {
        coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
      },
    });
    expect((await fhir('post', 'MedicationRequest', otherAccessToken).send(order(p.body))).status).toBe(201);
    expect((await fhir('post', 'MedicationRequest/$cds-check', otherAccessToken).send(order(p.body))).status).toBe(400);
  });
});
