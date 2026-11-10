// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, KenyaClientRegistryIdSystem } from '@medplum/core';
import type { Encounter, Extension, Parameters, Patient, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import { getKenyaAfyaLinkCredentials } from '../../country-pack/kenya/afyalink';
import {
  cancelKenyaHiePreauth,
  createKenyaHiePreauth,
  getKenyaHiePreauth,
} from '../../country-pack/kenya/hie-preauths';
import { createKenyaHieOtpAuthorization, getKenyaHieAuthorizations } from '../../country-pack/kenya/hie-visit';
import { addTestUser, withTestContext } from '../../test.setup';
import { getProjectSystemRepo } from '../repo';
import { KenyaShaPreauthExtension } from './kenyashapreauth';
import { KenyaShaVisitExtension } from './kenyashavisit';

jest.mock('../../country-pack/kenya/afyalink', () => ({
  ...jest.requireActual('../../country-pack/kenya/afyalink'),
  getKenyaAfyaLinkCredentials: jest.fn(),
}));

jest.mock('../../country-pack/kenya/hie-preauths', () => ({
  ...jest.requireActual('../../country-pack/kenya/hie-preauths'),
  createKenyaHiePreauth: jest.fn(),
  getKenyaHiePreauth: jest.fn(),
  cancelKenyaHiePreauth: jest.fn(),
}));

jest.mock('../../country-pack/kenya/hie-visit', () => ({
  ...jest.requireActual('../../country-pack/kenya/hie-visit'),
  createKenyaHieOtpAuthorization: jest.fn(),
  getKenyaHieAuthorizations: jest.fn(),
}));

const app = express();
const credentials = { baseUrl: 'https://hie.example', clientId: 'id', clientSecret: 'secret' };
const CrId = 'CR9795515286992-5';

describe('Encounter SHA preauth operation (Kenya)', () => {
  let project: WithId<Project>;
  let token: string;
  let patient: WithId<Patient>;

  const newEncounter = (extension?: Extension): Promise<WithId<Encounter>> =>
    withTestContext(() =>
      getProjectSystemRepo(project).createResource<Encounter>({
        resourceType: 'Encounter',
        meta: { project: project.id },
        status: extension ? 'in-progress' : 'planned',
        class: { code: 'AMB' },
        subject: createReference(patient),
        ...(extension ? { extension: [extension] } : {}),
      })
    );

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    const registered = await withTestContext(() =>
      registerNew({
        firstName: 'Preauth',
        lastName: 'Admin',
        projectName: 'Kenya SHA Preauth Project',
        email: `preauth${randomUUID()}@example.com`,
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
    patient = await withTestContext(() =>
      getProjectSystemRepo(project).createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        name: [{ family: 'Wanjiru' }],
        identifier: [{ system: KenyaClientRegistryIdSystem, value: CrId }],
      })
    );
    const clinician = await withTestContext(() =>
      addTestUser(project, {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Encounter' }, { resourceType: 'Patient' }, { resourceType: 'Organization' }],
      })
    );
    token = clinician.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const call = (id: string, parameter: Parameters['parameter']): request.Test =>
    request(app)
      .post(`/fhir/R4/Encounter/${id}/$kenya-sha-preauth`)
      .set('Authorization', 'Bearer ' + token)
      .send({ resourceType: 'Parameters', parameter });

  const createParams = (interventionCode: string): Parameters['parameter'] => [
    { name: 'action', valueCode: 'create' },
    { name: 'interventionCode', valueString: interventionCode },
    { name: 'serviceStart', valueDateTime: '2026-12-01T08:00:00+03:00' },
    { name: 'serviceEnd', valueDateTime: '2026-12-01T12:00:00+03:00' },
    { name: 'unitPrice', valueDecimal: 45000 },
    { name: 'icdCode', valueString: 'DC10.0' },
    {
      name: 'doctor',
      part: [
        { name: 'identificationNumber', valueString: 'A00000' },
        { name: 'regulator', valueCode: 'KMPDC' },
      ],
    },
    { name: 'providerNotificationEmail', valueString: 'claims@example.com' },
    { name: 'form', valueCode: 'imaging' },
    { name: 'clinicalIndications', valueString: 'Persistent headache' },
  ];

  const preauthValue = async (id: string, url: string): Promise<Extension | undefined> => {
    const enc = (
      await request(app)
        .get(`/fhir/R4/Encounter/${id}`)
        .set('Authorization', 'Bearer ' + token)
    ).body as Encounter;
    return enc.extension?.find((e) => e.url === KenyaShaPreauthExtension.url)?.extension?.find((e) => e.url === url);
  };

  test('normal preauth uses the started visit consent token', async () => {
    const encounter = await newEncounter({
      url: KenyaShaVisitExtension.url,
      extension: [
        { url: KenyaShaVisitExtension.consentToken, valueString: 'VISITTOKEN' },
        { url: KenyaShaVisitExtension.serviceType, valueCode: 'OUTPATIENT' },
      ],
    });
    (createKenyaHiePreauth as jest.Mock).mockResolvedValueOnce({ id: '77', status: 'PENDING_DOCTOR_APPROVAL' });

    const res = await call(encounter.id, createParams('SHA-09-001'));
    expect(res.status).toBe(200);
    const [, consentToken, input, elective] = (createKenyaHiePreauth as jest.Mock).mock.calls[0];
    expect(consentToken).toBe('VISITTOKEN');
    expect(elective).toBe(false);
    expect(input).toMatchObject({
      interventionCode: 'SHA-09-001',
      unitPrices: [45000],
      icdCodes: ['DC10.0'],
      doctors: [
        {
          identificationNumber: 'A00000',
          identificationType: 'registration_number',
          regulator: 'KMPDC',
          isPrimary: true,
        },
      ],
      form: { kind: 'imaging', clinicalIndications: 'Persistent headache' },
    });
    expect((await preauthValue(encounter.id, KenyaShaPreauthExtension.preauthStatus))?.valueString).toBe(
      'PENDING_DOCTOR_APPROVAL'
    );

    const again = await call(encounter.id, createParams('SHA-09-001'));
    expect(again.status).toBe(400);
    expect(again.body.issue[0].details.text).toBe('A preauth has already been created for this encounter.');
  });

  test('elective preauth: pre-visit OTP authorization, then the preauth with its token', async () => {
    const encounter = await newEncounter();
    const noAuth = await call(encounter.id, createParams('SHA-19-074'));
    expect(noAuth.status).toBe(400);

    (createKenyaHieOtpAuthorization as jest.Mock).mockResolvedValueOnce({
      guid: 'auth-guid',
      token: 'PREVISIT',
      status: 'AUTHORIZED_PENDING_VISIT',
    });
    const auth = await call(encounter.id, [
      { name: 'action', valueCode: 'authorize-otp' },
      { name: 'serviceType', valueCode: 'outpatient' },
      { name: 'interventionCode', valueString: 'SHA-19-074' },
      { name: 'otp', valueString: '123456' },
    ]);
    expect(auth.status).toBe(200);
    expect(createKenyaHieOtpAuthorization).toHaveBeenCalledWith(credentials, {
      patientId: CrId,
      serviceType: 'OUTPATIENT',
      interventionCodes: ['SHA-19-074'],
      otp: '123456',
    });

    const otherIntervention = await call(encounter.id, createParams('SHA-01-001'));
    expect(otherIntervention.status).toBe(400);
    expect(otherIntervention.body.issue[0].details.text).toBe(
      'The pre-visit authorization is for SHA-19-074, not SHA-01-001.'
    );

    (createKenyaHiePreauth as jest.Mock).mockResolvedValueOnce({ id: '78', status: 'PENDING_DOCTOR_APPROVAL' });
    const res = await call(encounter.id, [
      ...(createParams('SHA-19-074') ?? []),
      { name: 'expectedServiceStartDate', valueDateTime: '2026-12-01T08:00:00+03:00' },
    ]);
    expect(res.status).toBe(200);
    const [, consentToken, input, elective] = (createKenyaHiePreauth as jest.Mock).mock.calls.at(-1);
    expect(consentToken).toBe('PREVISIT');
    expect(elective).toBe(true);
    expect(input.expectedServiceStartDate).toBe('2026-12-01T08:00:00+03:00');

    (getKenyaHiePreauth as jest.Mock).mockResolvedValueOnce({ id: '78', status: 'FINALISED' });
    const status = await call(encounter.id, [{ name: 'action', valueCode: 'status' }]);
    expect(status.status).toBe(200);
    expect(getKenyaHiePreauth).toHaveBeenCalledWith(credentials, 'PREVISIT');
    expect((await preauthValue(encounter.id, KenyaShaPreauthExtension.preauthStatus))?.valueString).toBe('FINALISED');

    (cancelKenyaHiePreauth as jest.Mock).mockResolvedValueOnce({ message: 'cancelled' });
    const cancel = await call(encounter.id, [{ name: 'action', valueCode: 'cancel' }]);
    expect(cancel.status).toBe(200);
    expect(cancelKenyaHiePreauth).toHaveBeenCalledWith(credentials, 'PREVISIT', 'SHA-19-074');
  });

  test('an elective preauth waits for the fingerprint authorization', async () => {
    const encounter = await newEncounter({
      url: KenyaShaPreauthExtension.url,
      extension: [
        { url: KenyaShaPreauthExtension.authorizationGuid, valueString: 'g1' },
        { url: KenyaShaPreauthExtension.authorizationToken, valueString: 'T1' },
        { url: KenyaShaPreauthExtension.authorizationStatus, valueString: 'PENDING' },
        { url: KenyaShaPreauthExtension.interventionCode, valueString: 'SHA-19-074' },
      ],
    });
    const early = await call(encounter.id, [
      ...(createParams('SHA-19-074') ?? []),
      { name: 'expectedServiceStartDate', valueDateTime: '2026-12-01T08:00:00+03:00' },
    ]);
    expect(early.status).toBe(400);
    expect(early.body.issue[0].details.text).toContain('AUTHORIZED_PENDING_VISIT');

    (getKenyaHieAuthorizations as jest.Mock).mockResolvedValueOnce([
      { guid: 'g1', token: 'T1', status: 'AUTHORIZED_PENDING_VISIT' },
    ]);
    const refreshed = await call(encounter.id, [{ name: 'action', valueCode: 'authorization-status' }]);
    expect(refreshed.status).toBe(200);
    expect(getKenyaHieAuthorizations).toHaveBeenCalledWith(credentials, { guid: 'g1' });
    expect((await preauthValue(encounter.id, KenyaShaPreauthExtension.authorizationStatus))?.valueString).toBe(
      'AUTHORIZED_PENDING_VISIT'
    );
  });

  test('refuses a preauth form DHA does not define', async () => {
    const encounter = await newEncounter({
      url: KenyaShaVisitExtension.url,
      extension: [{ url: KenyaShaVisitExtension.consentToken, valueString: 'V2' }],
    });
    const bad = await call(encounter.id, [
      ...(createParams('SHA-09-001') ?? []).filter((p) => p.name !== 'form'),
      { name: 'form', valueCode: 'dental' },
    ]);
    expect(bad.status).toBe(400);
    expect(bad.body.issue[0].details.text).toBe(
      'form must be one of normal, surgical, renal, oncology, optical, imaging'
    );
  });
});
