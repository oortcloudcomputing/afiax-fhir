// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import { getKenyaAfyaLinkCredentials, searchAfyaLinkClientRegistry } from '../../country-pack/kenya/afyalink';
import { addTestUser, withTestContext } from '../../test.setup';
import { getProjectSystemRepo } from '../repo';

jest.mock('../../country-pack/kenya/afyalink', () => ({
  ...jest.requireActual('../../country-pack/kenya/afyalink'),
  getKenyaAfyaLinkCredentials: jest.fn(),
  searchAfyaLinkClientRegistry: jest.fn(),
}));

const app = express();

describe('Patient/$kenya-registry-lookup', () => {
  let project: WithId<Project>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    const registered = await withTestContext(() =>
      registerNew({
        firstName: 'Registry',
        lastName: 'Admin',
        projectName: 'Kenya Registry Project',
        email: `registry${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    project = await withTestContext(() =>
      getProjectSystemRepo(registered.project).updateResource<Project>({
        ...registered.project,
        setting: [{ name: 'countryPack', valueString: 'kenya' }],
      })
    );
    (getKenyaAfyaLinkCredentials as jest.Mock).mockReturnValue({ baseUrl: 'https://hie.example' });
    (searchAfyaLinkClientRegistry as jest.Mock).mockResolvedValue({
      message: { found: 1, client_registry_id: 'CR123', first_name: 'Baraka' },
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const lookup = (token: string): request.Test =>
    request(app)
      .post('/fhir/R4/Patient/$kenya-registry-lookup')
      .set('Authorization', 'Bearer ' + token)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'identificationType', valueString: 'National ID' },
          { name: 'identificationNumber', valueString: '12345678' },
        ],
      });

  test('staff who may register patients can search the Client Registry', async () => {
    const frontDesk = await withTestContext(() =>
      addTestUser(project, { resourceType: 'AccessPolicy', resource: [{ resourceType: 'Patient' }] })
    );
    const res = await lookup(frontDesk.accessToken);
    expect(res.status).toBe(200);
    const result = JSON.parse(res.body.parameter.find((p: { name: string }) => p.name === 'result').valueString);
    expect(result.message.client_registry_id).toBe('CR123');
    expect(searchAfyaLinkClientRegistry).toHaveBeenCalledWith(
      { baseUrl: 'https://hie.example' },
      'National ID',
      '12345678'
    );
  });

  test('staff who cannot create patients are refused', async () => {
    const cashier = await withTestContext(() =>
      addTestUser(project, { resourceType: 'AccessPolicy', resource: [{ resourceType: 'Patient', readonly: true }] })
    );
    const res = await lookup(cashier.accessToken);
    expect(res.status).toBe(403);
  });
});
