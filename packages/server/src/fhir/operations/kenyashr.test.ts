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
  closeKenyaShrVisit,
  getKenyaShrOpenVisits,
  getKenyaShrPatientRecords,
  refreshKenyaShrVisit,
  requestKenyaShrConsent,
  submitKenyaShrBundle,
  verifyKenyaShrConsent,
} from '../../country-pack/kenya/hie-shr';
import { addTestUser, withTestContext } from '../../test.setup';
import { getProjectSystemRepo } from '../repo';
import { KenyaShrVisitExtension } from './kenyashr';

jest.mock('../../country-pack/kenya/afyalink', () => ({
  ...jest.requireActual('../../country-pack/kenya/afyalink'),
  getKenyaAfyaLinkCredentials: jest.fn(),
}));

jest.mock('../../country-pack/kenya/hie-shr', () => ({
  ...jest.requireActual('../../country-pack/kenya/hie-shr'),
  getKenyaShrOpenVisits: jest.fn(),
  refreshKenyaShrVisit: jest.fn(),
  requestKenyaShrConsent: jest.fn(),
  verifyKenyaShrConsent: jest.fn(),
  closeKenyaShrVisit: jest.fn(),
  getKenyaShrPatientRecords: jest.fn(),
  submitKenyaShrBundle: jest.fn(),
}));

const app = express();
const credentials = {
  baseUrl: 'https://hie.example',
  clientId: 'id',
  clientSecret: 'secret',
  facilityId: 'FID-47-105963-0',
};
const CrId = 'CR7183053453471-2';

describe('Encounter Shared Health Record operation (Kenya)', () => {
  let project: WithId<Project>;
  let token: string;
  let patient: WithId<Patient>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    const registered = await withTestContext(() =>
      registerNew({
        firstName: 'Shr',
        lastName: 'Admin',
        projectName: 'Kenya SHR Project',
        email: `shr${randomUUID()}@example.com`,
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
        identifier: [{ system: KenyaClientRegistryIdSystem, value: CrId }],
      })
    );
    const clinician = await withTestContext(() =>
      addTestUser(project, {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Encounter' }, { resourceType: 'Patient' }, { resourceType: 'Practitioner' }],
      })
    );
    token = clinician.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const newEncounter = (): Promise<WithId<Encounter>> =>
    withTestContext(() =>
      getProjectSystemRepo(project).createResource<Encounter>({
        resourceType: 'Encounter',
        meta: { project: project.id },
        status: 'in-progress',
        class: { code: 'IMP' },
        subject: createReference(patient),
      })
    );

  const call = (id: string, parameter: Parameters['parameter']): request.Test =>
    request(app)
      .post(`/fhir/R4/Encounter/${id}/$kenya-shr`)
      .set('Authorization', 'Bearer ' + token)
      .send({ resourceType: 'Parameters', parameter });

  const resultOf = (res: request.Response): any =>
    JSON.parse(res.body.parameter.find((p: { name: string }) => p.name === 'result').valueString);

  const shrValue = async (id: string, url: string): Promise<string | undefined> => {
    const enc = (
      await request(app)
        .get(`/fhir/R4/Encounter/${id}`)
        .set('Authorization', 'Bearer ' + token)
    ).body as Encounter;
    return enc.extension
      ?.find((e) => e.url === KenyaShrVisitExtension.url)
      ?.extension?.find((e: Extension) => e.url === url)?.valueString;
  };

  test('consent, verify, read and close; the token is never returned', async () => {
    const encounter = await newEncounter();
    const noConsent = await call(encounter.id, [
      { name: 'action', valueCode: 'records' },
      { name: 'resources', valueString: 'Condition' },
      { name: 'practitionerId', valueString: 'PUID-1' },
    ]);
    expect(noConsent.status).toBe(400);

    (requestKenyaShrConsent as jest.Mock).mockResolvedValueOnce({
      consentId: 'VCR-1',
      consentStatus: 'Pending',
      otpRecord: 'r1',
    });
    const requested = await call(encounter.id, [{ name: 'action', valueCode: 'request-consent' }]);
    expect(requested.status).toBe(200);
    expect((requestKenyaShrConsent as jest.Mock).mock.calls[0][1]).toMatchObject({
      crId: CrId,
      facilityFrCode: 'FID-47-105963-0',
      visitType: 'IP',
    });

    (verifyKenyaShrConsent as jest.Mock).mockResolvedValueOnce({
      consentId: 'VCR-1',
      consentStatus: 'Approved',
      visitId: 'v1',
      consentToken: 'SECRET-TOKEN',
    });
    const verified = await call(encounter.id, [
      { name: 'action', valueCode: 'verify' },
      { name: 'otp', valueString: '14384' },
    ]);
    expect(verified.status).toBe(200);
    expect(verifyKenyaShrConsent).toHaveBeenCalledWith(credentials, 'VCR-1', { otpRecord: 'r1', otp: '14384' });
    expect(resultOf(verified)).toMatchObject({ visitId: 'v1', tokenIssued: true });
    expect(JSON.stringify(verified.body)).not.toContain('SECRET-TOKEN');

    (getKenyaShrPatientRecords as jest.Mock).mockResolvedValueOnce({ resourceType: 'Bundle', type: 'searchset' });
    const records = await call(encounter.id, [
      { name: 'action', valueCode: 'records' },
      { name: 'resources', valueString: 'Condition,Observation' },
      { name: 'practitionerId', valueString: 'PUID-0000443-3' },
    ]);
    expect(records.status).toBe(200);
    expect(getKenyaShrPatientRecords).toHaveBeenCalledWith(credentials, 'SECRET-TOKEN', {
      crId: CrId,
      practitionerId: 'PUID-0000443-3',
      resources: ['Condition', 'Observation'],
    });

    // Publishing a bundle for another patient is refused before DHA is called
    const otherPatient = await call(encounter.id, [
      { name: 'action', valueCode: 'publish' },
      {
        name: 'bundle',
        resource: {
          resourceType: 'Bundle',
          id: 'b1',
          type: 'collection',
          entry: [
            { resource: { resourceType: 'Condition', id: 'c1', subject: { reference: 'Patient/CR-OTHER' } } as any },
          ],
        },
      },
    ]);
    expect(otherPatient.status).toBe(400);
    expect(submitKenyaShrBundle).not.toHaveBeenCalled();

    (closeKenyaShrVisit as jest.Mock).mockResolvedValueOnce({ consentId: 'VCR-1', otpRecord: 'close-r' });
    expect((await call(encounter.id, [{ name: 'action', valueCode: 'close' }])).status).toBe(200);
    expect(await shrValue(encounter.id, KenyaShrVisitExtension.closeOtpRecord)).toBe('close-r');

    (verifyKenyaShrConsent as jest.Mock).mockResolvedValueOnce({ consentId: 'VCR-1', endDate: '2026-11-10' });
    const closed = await call(encounter.id, [
      { name: 'action', valueCode: 'verify-close' },
      { name: 'otp', valueString: '55555' },
    ]);
    expect(closed.status).toBe(200);
    expect(verifyKenyaShrConsent).toHaveBeenLastCalledWith(credentials, 'VCR-1', {
      otpRecord: 'close-r',
      otp: '55555',
    });
    expect(await shrValue(encounter.id, KenyaShrVisitExtension.endDate)).toBe('2026-11-10');
    expect(await shrValue(encounter.id, KenyaShrVisitExtension.consentToken)).toBeUndefined();

    const afterClose = await call(encounter.id, [{ name: 'action', valueCode: 'refresh' }]);
    expect(afterClose.status).toBe(400);
  });

  test('an open visit at the facility is reused with a refreshed token', async () => {
    const encounter = await newEncounter();
    (getKenyaShrOpenVisits as jest.Mock).mockResolvedValueOnce(['open-1']);
    (refreshKenyaShrVisit as jest.Mock).mockResolvedValueOnce({ consentToken: 'T2' });
    const res = await call(encounter.id, [{ name: 'action', valueCode: 'open-visits' }]);
    expect(res.status).toBe(200);
    expect(resultOf(res)).toEqual({ visits: ['open-1'], adopted: 'open-1', tokenIssued: true });
    expect(refreshKenyaShrVisit).toHaveBeenCalledWith(credentials, 'open-1');
    expect(await shrValue(encounter.id, KenyaShrVisitExtension.visitId)).toBe('open-1');

    const again = await call(encounter.id, [{ name: 'action', valueCode: 'request-consent' }]);
    expect(again.status).toBe(400);
  });
});
