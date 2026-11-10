// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, Operator } from '@medplum/core';
import type { Communication, Encounter, Patient, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import { registerNew } from '../auth/register';
import { loadTestConfig } from '../config/loader';
import { getKenyaAfyaLinkCredentials } from '../country-pack/kenya/afyalink';
import { listKenyaHieCallbacks, registerKenyaHieCallbacks } from '../country-pack/kenya/hie-callbacks';
import { previewKenyaHieClaim } from '../country-pack/kenya/hie-claims';
import { getKenyaHiePreauth } from '../country-pack/kenya/hie-preauths';
import { KenyaShaPreauthExtension } from '../fhir/operations/kenyashapreauth';
import { KenyaShaConsentTokenSystem, KenyaShaVisitExtension } from '../fhir/operations/kenyashavisit';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { addTestUser, withTestContext } from '../test.setup';
import { KenyaHieCallbackEventSystem, KenyaHieCallbackSecretName } from './routes';

jest.mock('../country-pack/kenya/afyalink', () => ({
  ...jest.requireActual('../country-pack/kenya/afyalink'),
  getKenyaAfyaLinkCredentials: jest.fn(),
}));
jest.mock('../country-pack/kenya/hie-claims', () => ({
  ...jest.requireActual('../country-pack/kenya/hie-claims'),
  previewKenyaHieClaim: jest.fn(),
}));
jest.mock('../country-pack/kenya/hie-preauths', () => ({
  ...jest.requireActual('../country-pack/kenya/hie-preauths'),
  getKenyaHiePreauth: jest.fn(),
}));
jest.mock('../country-pack/kenya/hie-callbacks', () => ({
  ...jest.requireActual('../country-pack/kenya/hie-callbacks'),
  registerKenyaHieCallbacks: jest.fn(),
  listKenyaHieCallbacks: jest.fn(),
}));

const app = express();
const credentials = {
  baseUrl: 'https://hie.example',
  clientId: 'id',
  clientSecret: 'secret',
  facilityId: 'FID-47-105963-0',
};
const Secret = 'a'.repeat(64);

describe('DHA HIE status callbacks (Kenya)', () => {
  let project: WithId<Project>;
  let adminToken: string;
  let clinicianToken: string;
  let encounter: WithId<Encounter>;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    const registered = await withTestContext(() =>
      registerNew({
        firstName: 'Callback',
        lastName: 'Admin',
        projectName: 'Kenya HIE Callback Project',
        email: `callback${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    adminToken = registered.accessToken;
    project = await withTestContext(() =>
      getGlobalSystemRepo().updateResource<Project>({
        ...registered.project,
        setting: [{ name: 'countryPack', valueString: 'kenya' }],
        systemSecret: [{ name: KenyaHieCallbackSecretName, valueString: Secret }],
      })
    );
    (getKenyaAfyaLinkCredentials as jest.Mock).mockReturnValue(credentials);
    const repo = getProjectSystemRepo(project);
    const patient = await withTestContext(() =>
      repo.createResource<Patient>({ resourceType: 'Patient', meta: { project: project.id } })
    );
    encounter = await withTestContext(() =>
      repo.createResource<Encounter>({
        resourceType: 'Encounter',
        meta: { project: project.id },
        status: 'in-progress',
        class: { code: 'AMB' },
        subject: createReference(patient),
        identifier: [{ system: KenyaShaConsentTokenSystem, value: 'K5HLPJVDNV' }],
        extension: [
          {
            url: KenyaShaVisitExtension.url,
            extension: [
              { url: KenyaShaVisitExtension.consentToken, valueString: 'K5HLPJVDNV' },
              { url: KenyaShaVisitExtension.workflowState, valueString: 'SUBMITTED_PAYER' },
            ],
          },
          {
            url: KenyaShaPreauthExtension.url,
            extension: [{ url: KenyaShaPreauthExtension.preauthStatus, valueString: 'ACTIVE' }],
          },
        ],
      })
    );
    const clinician = await withTestContext(() =>
      addTestUser(project, { resourceType: 'AccessPolicy', resource: [{ resourceType: 'Encounter' }] })
    );
    clinicianToken = clinician.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const claimCallback = (toState: string, token = 'K5HLPJVDNV'): Record<string, string> => ({
    subject_guid: `guid-${toState}`,
    provider_claim_no: 'OP-21-26-1',
    from_state: 'SUBMITTED_PAYER',
    to_state: toState,
    facility_fr_code: 'FID-47-105963-0',
    entity_type: 'claim',
    timestamp: '2026-11-10T13:15:50.862762+00:00',
    consent_token: token,
  });

  const post = (body: object, secret = Secret, kind = 'claim-status', projectId?: string): request.Test =>
    request(app)
      .post(`/kenya/hie/callbacks/${projectId ?? project.id}/${secret}/${kind}`)
      .set('Content-Type', 'application/json')
      .send(body);

  const events = (key: string): Promise<Communication[]> =>
    withTestContext(() =>
      getProjectSystemRepo(project).searchResources<Communication>({
        resourceType: 'Communication',
        filters: [
          { code: '_project', operator: Operator.EQUALS, value: project.id },
          { code: 'identifier', operator: Operator.EQUALS, value: `${KenyaHieCallbackEventSystem}|${key}` },
        ],
      })
    );

  async function waitForNote(key: string): Promise<Communication> {
    for (let i = 0; i < 50; i++) {
      const [c] = await events(key);
      if (c?.note?.length) {
        return c;
      }
      await new Promise((r) => {
        setTimeout(r, 100);
      });
    }
    throw new Error('callback was not processed');
  }

  const readEncounter = async (): Promise<Encounter> =>
    withTestContext(() => getProjectSystemRepo(project).readResource<Encounter>('Encounter', encounter.id));

  test('a wrong secret or unknown project is a plain 404', async () => {
    expect((await post(claimCallback('APPROVED'), 'b'.repeat(64))).status).toBe(404);
    expect((await post(claimCallback('APPROVED'), Secret, 'claim-status', randomUUID())).status).toBe(404);
  });

  test('invalid payloads and a mismatched endpoint are refused', async () => {
    expect((await post({ subject_guid: 'x' })).status).toBe(400);
    expect((await post(claimCallback('APPROVED'), Secret, 'preauth-status')).status).toBe(400);
  });

  test('accepts, de-duplicates and records the state DHA confirms', async () => {
    (previewKenyaHieClaim as jest.Mock).mockResolvedValueOnce({ id: 'c1', workflow_state: 'APPROVED' });
    const first = await post(claimCallback('APPROVED'));
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ received: true });

    const c = await waitForNote('claim:guid-APPROVED:APPROVED');
    expect(c.note?.[0].text).toBe(
      'DHA confirms the claim is APPROVED (matches the callback); recorded on the encounter.'
    );
    expect(c.encounter?.reference).toBe(`Encounter/${encounter.id}`);
    expect(previewKenyaHieClaim).toHaveBeenCalledWith(credentials, 'K5HLPJVDNV');
    const visit = (await readEncounter()).extension?.find((e) => e.url === KenyaShaVisitExtension.url);
    expect(visit?.extension?.find((e) => e.url === KenyaShaVisitExtension.workflowState)?.valueString).toBe('APPROVED');
    // the consent token is untouched
    expect(visit?.extension?.find((e) => e.url === KenyaShaVisitExtension.consentToken)?.valueString).toBe(
      'K5HLPJVDNV'
    );

    const retry = await post(claimCallback('APPROVED'));
    expect(retry.body).toEqual({ received: true, duplicate: true });
    expect(await events('claim:guid-APPROVED:APPROVED')).toHaveLength(1);
  });

  test('a callback state is never applied as sent: DHA is re-read and its state recorded', async () => {
    (previewKenyaHieClaim as jest.Mock).mockResolvedValueOnce({ workflow_state: 'REJECTED' });
    await post(claimCallback('PAID'));
    const c = await waitForNote('claim:guid-PAID:PAID');
    expect(c.note?.[0].text).toContain("REJECTED (differs from the callback's PAID)");
  });

  test('when DHA cannot be read nothing changes', async () => {
    (getKenyaHiePreauth as jest.Mock).mockRejectedValueOnce(new Error('DHA unavailable'));
    await post(
      {
        subject_guid: 'pa-1',
        from_state: 'ACTIVE',
        to_state: 'FINALISED',
        facility_fr_code: 'FID-47-105963-0',
        entity_type: 'preauth',
        timestamp: '2026-11-10T13:10:16+00:00',
        consent_token: 'K5HLPJVDNV',
        notes: '',
      },
      Secret,
      'preauth-status'
    );
    const c = await waitForNote('preauth:pa-1:FINALISED');
    expect(c.note?.[0].text).toContain('Could not re-read the preauth from DHA, so nothing was changed');
    const preauth = (await readEncounter()).extension?.find((e) => e.url === KenyaShaPreauthExtension.url);
    expect(preauth?.extension?.find((e) => e.url === KenyaShaPreauthExtension.preauthStatus)?.valueString).toBe(
      'ACTIVE'
    );
  });

  test('a token no encounter holds is recorded but not linked', async () => {
    const res = await post(claimCallback('QUERIED', 'UNKNOWN'));
    expect(res.body).toEqual({ received: true });
    const c = await waitForNote('claim:guid-QUERIED:QUERIED');
    expect(c.note?.[0].text).toBe('No encounter holds this consent token.');
    expect(c.encounter).toBeUndefined();
  });

  test('registration: admins only, secret never returned', async () => {
    const denied = await request(app)
      .post('/fhir/R4/$kenya-hie-callbacks')
      .set('Authorization', 'Bearer ' + clinicianToken)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'action', valueCode: 'list' }] });
    expect(denied.status).toBe(403);

    (registerKenyaHieCallbacks as jest.Mock).mockResolvedValueOnce([
      { entityType: 'claim', endpointId: 'e1', operationId: 'o1', url: `https://x/${Secret}/claim-status` },
    ]);
    const res = await request(app)
      .post('/fhir/R4/$kenya-hie-callbacks')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({
        resourceType: 'Parameters',
        parameter: [
          { name: 'action', valueCode: 'register' },
          { name: 'entityType', valueCode: 'claim' },
        ],
      });
    expect(res.status).toBe(200);
    const [, input] = (registerKenyaHieCallbacks as jest.Mock).mock.calls[0];
    expect(input).toMatchObject({
      facilityFrCode: 'FID-47-105963-0',
      environment: 'sandbox',
      entityTypes: ['claim'],
    });
    expect(input.baseUrl).toMatch(new RegExp(`/kenya/hie/callbacks/${project.id}/${Secret}$`));
    expect(JSON.stringify(res.body)).not.toContain(Secret);

    (listKenyaHieCallbacks as jest.Mock).mockResolvedValueOnce([{ base_url: `https://x/${Secret}`, operations: [] }]);
    const list = await request(app)
      .post('/fhir/R4/$kenya-hie-callbacks')
      .set('Authorization', 'Bearer ' + adminToken)
      .send({ resourceType: 'Parameters', parameter: [{ name: 'action', valueCode: 'list' }] });
    expect(list.status).toBe(200);
    expect(JSON.stringify(list.body)).not.toContain(Secret);
    expect(JSON.stringify(list.body)).toContain('[secret]');
  });
});
