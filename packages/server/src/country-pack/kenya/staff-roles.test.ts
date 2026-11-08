// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getReferenceString } from '@medplum/core';
import type { AccessPolicy, ProjectMembership, Reference, UserConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import { generateAccessToken } from '../../oauth/keys';
import { tryLogin } from '../../oauth/utils';
import { withTestContext } from '../../test.setup';
import { KenyaStaffRoleOption, KenyaStaffRoles } from './staff-roles';

const app = express();

interface RoleRow {
  code: string;
  display: string;
  admin: boolean;
  userConfiguration: Reference<UserConfiguration>;
  accessPolicy?: Reference<AccessPolicy>;
}

describe('Kenya staff roles', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
  });

  afterAll(async () => {
    await shutdownApp();
  });

  async function kenyaProject(): Promise<{ projectId: string; accessToken: string }> {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Wanjiru',
        lastName: 'Kamau',
        projectName: 'Kenya Roles Project',
        email: `wanjiru${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    const res = await request(app)
      .post('/admin/projects/' + project.id + '/settings')
      .set('Authorization', 'Bearer ' + accessToken)
      .send([{ name: 'countryPack', valueString: 'kenya' }]);
    expect(res.status).toBe(200);
    return { projectId: project.id, accessToken };
  }

  test('every non-admin role has an access policy; front desk and cashier get no clinical types', () => {
    for (const role of KenyaStaffRoles) {
      if (role.admin) {
        expect(role.resources).toBeUndefined();
      } else {
        expect(role.resources?.length).toBeGreaterThan(0);
      }
    }
    for (const code of ['front-desk', 'cashier']) {
      const types = KenyaStaffRoles.find((r) => r.code === code)?.resources?.map((r) => r.resourceType) ?? [];
      for (const clinicalType of ['Condition', 'Observation', 'MedicationRequest', 'DocumentReference']) {
        expect(types).not.toContain(clinicalType);
      }
    }
  });

  test('requires the Kenya country pack', async () => {
    const { project, accessToken } = await withTestContext(() =>
      registerNew({
        firstName: 'Other',
        lastName: 'Country',
        projectName: 'Non-Kenya Project',
        email: `other${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    const res = await request(app)
      .post('/admin/projects/' + project.id + '/kenya/staff-roles')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(res.status).toBe(400);
  });

  test('seeds roles idempotently, and a front-desk member gets its menu and policy', async () => {
    const { projectId, accessToken } = await kenyaProject();

    const first = await request(app)
      .post('/admin/projects/' + projectId + '/kenya/staff-roles')
      .set('Authorization', 'Bearer ' + accessToken);
    expect(first.status).toBe(200);
    const roles = first.body as RoleRow[];
    expect(roles.map((r) => r.code)).toEqual(KenyaStaffRoles.map((r) => r.code));
    expect(roles.find((r) => r.code === 'facility-admin')).toMatchObject({ admin: true });
    expect(roles.find((r) => r.code === 'facility-admin')?.accessPolicy).toBeUndefined();

    // Running it again updates the same resources (memberships keep pointing at them)
    const second = await request(app)
      .post('/admin/projects/' + projectId + '/kenya/staff-roles')
      .set('Authorization', 'Bearer ' + accessToken);
    expect((second.body as RoleRow[]).map((r) => r.userConfiguration.reference)).toEqual(
      roles.map((r) => r.userConfiguration.reference)
    );

    const frontDesk = roles.find((r) => r.code === 'front-desk') as RoleRow;
    const email = `frontdesk${randomUUID()}@example.com`;
    const password = randomUUID();
    const invite = await request(app)
      .post('/admin/projects/' + projectId + '/invite')
      .set('Authorization', 'Bearer ' + accessToken)
      .send({
        resourceType: 'Practitioner',
        firstName: 'Akinyi',
        lastName: 'Odhiambo',
        email,
        password,
        sendEmail: false,
        membership: { accessPolicy: frontDesk.accessPolicy, userConfiguration: frontDesk.userConfiguration },
      });
    expect(invite.status).toBe(200);
    const membership = invite.body as ProjectMembership;
    expect(membership.userConfiguration?.reference).toBe(frontDesk.userConfiguration.reference);

    const memberToken = await withTestContext(async () => {
      const login = await tryLogin({ authMethod: 'password', email, password, scope: 'openid', nonce: 'nonce' });
      return generateAccessToken({
        login_id: login.id,
        sub: membership.user?.reference?.split('/')[1] as string,
        username: membership.user?.reference?.split('/')[1] as string,
        scope: login.scope as string,
        profile: membership.profile?.reference as string,
      });
    });

    // The menu comes from the role's UserConfiguration
    const me = await request(app)
      .get('/auth/me')
      .set('Authorization', 'Bearer ' + memberToken);
    expect(me.status).toBe(200);
    expect(me.body.config.menu[0].title).toBe('Front desk');
    expect(me.body.config.option).toContainEqual({ id: KenyaStaffRoleOption, valueString: 'front-desk' });

    // The server enforces the same scope: patients yes, clinical record no
    const patient = await request(app)
      .post('/fhir/R4/Patient')
      .set('Authorization', 'Bearer ' + memberToken)
      .send({ resourceType: 'Patient', name: [{ given: ['Baraka'], family: 'Mwangi' }] });
    expect(patient.status).toBe(201);
    const condition = await request(app)
      .post('/fhir/R4/Condition')
      .set('Authorization', 'Bearer ' + memberToken)
      .send({ resourceType: 'Condition', subject: { reference: getReferenceString(patient.body) } });
    expect(condition.status).toBe(403);
    const search = await request(app)
      .get('/fhir/R4/Observation')
      .set('Authorization', 'Bearer ' + memberToken);
    expect(search.status).toBe(403);
  });
});
