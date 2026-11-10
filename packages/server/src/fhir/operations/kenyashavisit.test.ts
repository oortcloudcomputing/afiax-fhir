// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, KenyaClientRegistryIdSystem } from '@medplum/core';
import type { Encounter, Organization, Parameters, Patient, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import type { HieResult } from '../../country-pack/kenya/afyalink';
import { getKenyaAfyaLinkCredentials } from '../../country-pack/kenya/afyalink';
import { getKenyaHieInterventions, getKenyaHieUtilization } from '../../country-pack/kenya/hie-coverage';
import {
  createKenyaHieBiometricsAuthorization,
  getKenyaHiePatientContacts,
  KenyaHieRequestError,
  sendKenyaHieVisitOtp,
  startKenyaHieVisit,
} from '../../country-pack/kenya/hie-visit';
import { addTestUser, withTestContext } from '../../test.setup';
import { getProjectSystemRepo } from '../repo';
import { KenyaShaVisitClaimIdSystem, KenyaShaVisitExtension } from './kenyashavisit';

jest.mock('../../country-pack/kenya/afyalink', () => ({
  ...jest.requireActual('../../country-pack/kenya/afyalink'),
  getKenyaAfyaLinkCredentials: jest.fn(),
}));

jest.mock('../../country-pack/kenya/hie-coverage', () => ({
  ...jest.requireActual('../../country-pack/kenya/hie-coverage'),
  getKenyaHieInterventions: jest.fn(),
  getKenyaHieUtilization: jest.fn(),
}));

jest.mock('../../country-pack/kenya/hie-visit', () => ({
  ...jest.requireActual('../../country-pack/kenya/hie-visit'),
  getKenyaHiePatientContacts: jest.fn(),
  sendKenyaHieVisitOtp: jest.fn(),
  createKenyaHieBiometricsAuthorization: jest.fn(),
  getKenyaHieAuthorizations: jest.fn(),
  rejectKenyaHieAuthorization: jest.fn(),
  startKenyaHieVisit: jest.fn(),
}));

const app = express();
const credentials = { baseUrl: 'https://hie.example', clientId: 'id', clientSecret: 'secret' };

describe('Encounter SHA visit operations (Kenya)', () => {
  let project: WithId<Project>;
  let clinicianToken: string;
  let readOnlyToken: string;
  let encounter: WithId<Encounter>;
  let noCrEncounter: WithId<Encounter>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    const registered = await withTestContext(() =>
      registerNew({
        firstName: 'Visit',
        lastName: 'Admin',
        projectName: 'Kenya SHA Visit Project',
        email: `visit${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    project = await withTestContext(() =>
      getProjectSystemRepo(registered.project).updateResource<Project>({
        ...registered.project,
        setting: [{ name: 'countryPack', valueString: 'kenya' }],
      })
    );
    (getKenyaAfyaLinkCredentials as jest.Mock).mockReturnValue(credentials);

    const repo = getProjectSystemRepo(project);
    const facility = await withTestContext(() =>
      repo.createResource<Organization>({
        resourceType: 'Organization',
        meta: { project: project.id },
        name: 'Test Facility',
        identifier: [{ system: 'https://afiax.africa/kenya/identifier/mfl-code', value: 'FID-47-105963-0' }],
      })
    );
    const patient = await withTestContext(() =>
      repo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        name: [{ given: ['Amina'], family: 'Otieno' }],
        identifier: [{ system: KenyaClientRegistryIdSystem, value: 'CR9795515286992-5' }],
      })
    );
    const unresolved = await withTestContext(() =>
      repo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        name: [{ family: 'Unknown' }],
      })
    );
    encounter = await withTestContext(() =>
      repo.createResource<Encounter>({
        resourceType: 'Encounter',
        meta: { project: project.id },
        status: 'in-progress',
        class: { code: 'AMB' },
        subject: createReference(patient),
        serviceProvider: createReference(facility),
      })
    );
    noCrEncounter = await withTestContext(() =>
      repo.createResource<Encounter>({
        resourceType: 'Encounter',
        meta: { project: project.id },
        status: 'in-progress',
        class: { code: 'AMB' },
        subject: createReference(unresolved),
      })
    );

    const clinician = await withTestContext(() =>
      addTestUser(project, {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Encounter' }, { resourceType: 'Patient' }, { resourceType: 'Organization' }],
      })
    );
    clinicianToken = clinician.accessToken;
    const readOnly = await withTestContext(() =>
      addTestUser(project, {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Encounter', readonly: true },
          { resourceType: 'Patient', readonly: true },
        ],
      })
    );
    readOnlyToken = readOnly.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const call = (token: string, id: string, operation: string, parameter: Parameters['parameter']): request.Test =>
    request(app)
      .post(`/fhir/R4/Encounter/${id}/$${operation}`)
      .set('Authorization', 'Bearer ' + token)
      .send({ resourceType: 'Parameters', parameter });

  const resultOf = (res: request.Response): unknown =>
    JSON.parse(res.body.parameter.find((p: { name: string }) => p.name === 'result').valueString);

  test('lists the patient contacts by Client Registry ID', async () => {
    (getKenyaHiePatientContacts as jest.Mock).mockResolvedValueOnce([{ id: 1, value: '+254714***898' }]);

    const res = await call(clinicianToken, encounter.id, 'kenya-visit-consent', [
      { name: 'action', valueCode: 'contacts' },
    ]);
    expect(res.status).toBe(200);
    expect(resultOf(res)).toEqual([{ id: 1, value: '+254714***898' }]);
    expect(getKenyaHiePatientContacts).toHaveBeenCalledWith(credentials, 'CR9795515286992-5');
  });

  test('sends the OTP for the intervention codes and chosen contact', async () => {
    (sendKenyaHieVisitOtp as jest.Mock).mockResolvedValueOnce({ message: 'OTP sent' });

    const res = await call(clinicianToken, encounter.id, 'kenya-visit-consent', [
      { name: 'action', valueCode: 'send-otp' },
      { name: 'interventionCode', valueString: 'SHA-12-001' },
      { name: 'contactId', valueInteger: 1 },
    ]);
    expect(res.status).toBe(200);
    expect(sendKenyaHieVisitOtp).toHaveBeenCalledWith(credentials, {
      patientId: 'CR9795515286992-5',
      interventionCodes: ['SHA-12-001'],
      contactId: 1,
    });
  });

  test("uses the facility's FR code and name for fingerprint consent", async () => {
    (createKenyaHieBiometricsAuthorization as jest.Mock).mockResolvedValueOnce({ guid: 'g-1', status: 'PENDING' });

    const res = await call(clinicianToken, encounter.id, 'kenya-visit-consent', [
      { name: 'action', valueCode: 'authorize-biometrics' },
      { name: 'serviceType', valueCode: 'outpatient' },
      { name: 'interventionCode', valueString: 'SHA-12-001' },
      { name: 'agentId', valueString: '12345678' },
      { name: 'workStationId', valueString: 'ws-1' },
      { name: 'deviceOs', valueString: 'windows' },
    ]);
    expect(res.status).toBe(200);
    expect(createKenyaHieBiometricsAuthorization).toHaveBeenCalledWith(credentials, {
      patientId: 'CR9795515286992-5',
      serviceType: 'OUTPATIENT',
      interventionCodes: ['SHA-12-001'],
      agentId: '12345678',
      workStationId: 'ws-1',
      deviceOs: 'windows',
      facilityFrCode: 'FID-47-105963-0',
      facilityName: 'Test Facility',
    });
  });

  test('returns DHA validation errors as 400 with the DHA message', async () => {
    const failure: HieResult = { status: 400, ok: false, body: { message: 'invalid intervention' }, text: '' };
    (sendKenyaHieVisitOtp as jest.Mock).mockRejectedValueOnce(new KenyaHieRequestError('send OTP', failure));

    const res = await call(clinicianToken, encounter.id, 'kenya-visit-consent', [
      { name: 'action', valueCode: 'send-otp' },
      { name: 'interventionCode', valueString: 'BAD' },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toContain('invalid intervention');
  });

  test('refuses an unknown action', async () => {
    const res = await call(clinicianToken, encounter.id, 'kenya-visit-consent', [
      { name: 'action', valueCode: 'teleport' },
    ]);
    expect(res.status).toBe(400);
  });

  test('requires the Client Registry ID on the patient', async () => {
    const res = await call(clinicianToken, noCrEncounter.id, 'kenya-visit-consent', [
      { name: 'action', valueCode: 'contacts' },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toContain('no DHA Client Registry ID');
  });

  test('refuses staff who cannot update the encounter', async () => {
    const res = await call(readOnlyToken, encounter.id, 'kenya-visit-consent', [
      { name: 'action', valueCode: 'contacts' },
    ]);
    expect(res.status).toBe(403);
  });

  test('starts the visit and records it on the encounter, once', async () => {
    (startKenyaHieVisit as jest.Mock).mockResolvedValueOnce({
      claimId: '991',
      consentToken: 'ZLXNV8CUJR',
      authorizationGuid: 'g-2',
      visitNumber: 'V-1',
      serviceType: 'OUTPATIENT',
      workflowState: 'OPEN',
      schemeName: 'SHIF',
      interventions: [],
    });

    const res = await call(clinicianToken, encounter.id, 'kenya-start-visit', [
      { name: 'serviceType', valueCode: 'OUTPATIENT' },
      { name: 'interventionCode', valueString: 'SHA-12-001' },
      { name: 'otp', valueString: '123456' },
      { name: 'practitionerIdentificationNumber', valueString: 'A1' },
      { name: 'practitionerRegulator', valueCode: 'KMPDC' },
    ]);
    expect(res.status).toBe(200);
    expect(startKenyaHieVisit).toHaveBeenCalledWith(credentials, {
      patientId: 'CR9795515286992-5',
      serviceType: 'OUTPATIENT',
      interventionCodes: ['SHA-12-001'],
      otp: '123456',
      practitioner: { identificationType: 'registration_number', identificationNumber: 'A1', regulator: 'KMPDC' },
    });

    const reference = res.body.parameter.find((p: { name: string }) => p.name === 'encounter').valueReference;
    expect(reference.reference).toBe(`Encounter/${encounter.id}`);
    const updated = await withTestContext(() =>
      getProjectSystemRepo(project).readResource<Encounter>('Encounter', encounter.id)
    );
    expect(updated.identifier).toContainEqual({ system: KenyaShaVisitClaimIdSystem, value: '991' });
    const visit = updated.extension?.find((e) => e.url === KenyaShaVisitExtension.url);
    const value = (url: string): unknown => {
      const child = visit?.extension?.find((e) => e.url === url);
      return child?.valueString ?? child?.valueCode;
    };
    expect(value(KenyaShaVisitExtension.consentToken)).toBe('ZLXNV8CUJR');
    expect(value(KenyaShaVisitExtension.claimId)).toBe('991');
    expect(value(KenyaShaVisitExtension.consentMethod)).toBe('otp');
    expect(value(KenyaShaVisitExtension.serviceType)).toBe('OUTPATIENT');
    expect(value(KenyaShaVisitExtension.interventionCode)).toBe('SHA-12-001');

    const again = await call(clinicianToken, encounter.id, 'kenya-start-visit', [
      { name: 'serviceType', valueCode: 'OUTPATIENT' },
      { name: 'interventionCode', valueString: 'SHA-12-001' },
      { name: 'otp', valueString: '123456' },
    ]);
    expect(again.status).toBe(400);
    expect(again.body.issue[0].details.text).toContain('already been started');
    expect(startKenyaHieVisit).toHaveBeenCalledTimes(1);
  });

  test('refuses an unknown service type', async () => {
    const res = await call(clinicianToken, noCrEncounter.id, 'kenya-start-visit', [
      { name: 'serviceType', valueCode: 'SPA' },
      { name: 'interventionCode', valueString: 'X' },
      { name: 'otp', valueString: '1' },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toContain('serviceType must be one of');
  });

  test('looks up the interventions for the visit type from the encounter class', async () => {
    (getKenyaHieInterventions as jest.Mock).mockResolvedValueOnce({ count: 1, results: [{ code: 'SHA-19-404' }] });

    const res = await call(clinicianToken, encounter.id, 'kenya-sha-coverage', [
      { name: 'action', valueCode: 'interventions' },
      { name: 'subBenefitCode', valueString: 'SHA-19-SC-13' },
      { name: 'page', valueInteger: 2 },
    ]);
    expect(res.status).toBe(200);
    expect(resultOf(res)).toEqual({ visitType: 'OP', count: 1, results: [{ code: 'SHA-19-404' }] });
    expect(getKenyaHieInterventions).toHaveBeenCalledWith(credentials, 'CR9795515286992-5', {
      visitType: 'OP',
      subBenefitCode: 'SHA-19-SC-13',
      page: 2,
    });
  });

  test('reads the utilization of one intervention for an inpatient visit', async () => {
    (getKenyaHieUtilization as jest.Mock).mockResolvedValueOnce([{ code: 'SHA-18-005', limitAvailableAmount: 140 }]);

    const res = await call(clinicianToken, encounter.id, 'kenya-sha-coverage', [
      { name: 'action', valueCode: 'utilization' },
      { name: 'visitType', valueCode: 'ip' },
      { name: 'interventionCode', valueString: 'SHA-18-005' },
    ]);
    expect(res.status).toBe(200);
    expect(resultOf(res)).toEqual({ visitType: 'IP', results: [{ code: 'SHA-18-005', limitAvailableAmount: 140 }] });
    expect(getKenyaHieUtilization).toHaveBeenCalledWith(credentials, 'CR9795515286992-5', 'SHA-18-005');
  });

  test('refuses an unknown coverage action or visit type', async () => {
    const action = await call(clinicianToken, encounter.id, 'kenya-sha-coverage', [{ name: 'action', valueCode: 'x' }]);
    expect(action.status).toBe(400);
    const visitType = await call(clinicianToken, encounter.id, 'kenya-sha-coverage', [
      { name: 'action', valueCode: 'benefits' },
      { name: 'visitType', valueCode: 'MR' },
    ]);
    expect(visitType.status).toBe(400);
    expect(visitType.body.issue[0].details.text).toBe('visitType must be OP or IP');
  });
});
