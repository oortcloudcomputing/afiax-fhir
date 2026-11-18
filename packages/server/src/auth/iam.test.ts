// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DomainConfiguration } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import fetch from 'node-fetch';
import request from 'supertest';
import { initApp, shutdownApp } from '../app';
import type { MedplumServerConfig } from '../config/types';
import { loadTestConfig } from '../config/loader';
import { getGlobalSystemRepo } from '../fhir/repo';
import { withTestContext } from '../test.setup';
import { AFIAX_IAM_DOMAIN } from './iam';
import { registerNew } from './register';

jest.mock('node-fetch');

const app = express();
// Afiax IAM serves any email domain: this one has no DomainConfiguration of its own
const email = `iam-${randomUUID()}@gmail-test.example.com`;
const PROVIDER = 'https://provider.example.com';
let config: MedplumServerConfig;

function tokens(claims: Record<string, unknown>): Record<string, string> {
  return { id_token: 'header.' + Buffer.from(JSON.stringify(claims), 'ascii').toString('base64') + '.signature' };
}

function mockIam(claims: Record<string, unknown>): void {
  (fetch as unknown as jest.Mock).mockImplementation(() => ({ ok: true, status: 200, json: () => tokens(claims) }));
}

function callback(state: Record<string, unknown>): string {
  const url = new URL('http://example.com/auth/external');
  url.searchParams.set('code', randomUUID());
  url.searchParams.set('state', JSON.stringify(state));
  return url.toString().replace('http://example.com', '');
}

describe('Afiax IAM', () => {
  beforeAll(async () => {
    config = await loadTestConfig();
    config.allowedOrigins = `${PROVIDER},https://myafiax.example.com`;
    await withTestContext(async () => {
      await initApp(app, config);
      await registerNew({
        firstName: 'Iam',
        lastName: 'Person',
        projectName: 'Afiax IAM Test Project',
        email,
        password: 'password!@#',
        remoteAddress: '5.5.5.5',
        userAgent: 'Mozilla/5.0',
      });
      const systemRepo = getGlobalSystemRepo();
      const existing = await systemRepo.searchOne<DomainConfiguration>({
        resourceType: 'DomainConfiguration',
        filters: [{ code: 'domain', operator: 'exact' as never, value: AFIAX_IAM_DOMAIN }],
      });
      if (!existing) {
        await systemRepo.createResource<DomainConfiguration>({
          resourceType: 'DomainConfiguration',
          domain: AFIAX_IAM_DOMAIN,
          identityProvider: {
            authorizeUrl: 'https://iam.example.com/oauth/v2/authorize',
            tokenUrl: 'https://iam.example.com/oauth/v2/token',
            userInfoUrl: 'https://iam.example.com/oidc/v1/userinfo',
            clientId: 'iam-client',
            clientSecret: 'iam-secret',
          },
        });
      }
    });
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('Sign-in URL with the email as login_hint and the session limit as max_age', async () => {
    const res = await request(app).get('/auth/iam?email=' + encodeURIComponent(email.toUpperCase()));
    expect(res.status).toBe(200);
    expect(res.body.domain).toBe(AFIAX_IAM_DOMAIN);
    const url = new URL(res.body.authorizeUrl);
    expect(url.origin + url.pathname).toBe('https://iam.example.com/oauth/v2/authorize');
    expect(url.searchParams.get('client_id')).toBe('iam-client');
    expect(url.searchParams.get('redirect_uri')).toBe(config.baseUrl + 'auth/external');
    expect(url.searchParams.get('login_hint')).toBe(email);
    expect(url.searchParams.get('max_age')).toBe(String(config.maxSessionLifetimeSeconds ?? 28800));
    const end = new URL(res.body.endSessionUrl);
    expect(end.origin + end.pathname).toBe('https://iam.example.com/oidc/v1/end_session');
    expect(end.searchParams.get('client_id')).toBe('iam-client');
  });

  test('Sign-in URL without an email has no login_hint', async () => {
    const res = await request(app).get('/auth/iam');
    expect(res.status).toBe(200);
    expect(new URL(res.body.authorizeUrl).searchParams.has('login_hint')).toBe(false);
  });

  test('Any email domain, verified by Afiax IAM, signs in', async () => {
    mockIam({ email, email_verified: true });
    const res = await request(app).get(callback({ domain: AFIAX_IAM_DOMAIN }));
    expect(res.status).toBe(302);
    const redirect = new URL(res.header.location);
    expect(redirect.origin).toBe(new URL(config.appBaseUrl).origin);
    expect(redirect.pathname).toBe('/signin');
    expect(redirect.searchParams.get('login')).toBeTruthy();
  });

  test('An email Afiax IAM has not verified is refused', async () => {
    mockIam({ email, email_verified: false });
    const res = await request(app).get(callback({ domain: AFIAX_IAM_DOMAIN }));
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('Afiax IAM has not verified this email address');

    mockIam({ email });
    const res2 = await request(app).get(callback({ domain: AFIAX_IAM_DOMAIN }));
    expect(res2.status).toBe(400);
  });

  test('Goes back to the app it started from when that origin is allowed', async () => {
    mockIam({ email, email_verified: true });
    const res = await request(app).get(callback({ domain: AFIAX_IAM_DOMAIN, redirectUri: PROVIDER + '/signin' }));
    expect(res.status).toBe(302);
    const redirect = new URL(res.header.location);
    expect(redirect.origin).toBe(PROVIDER);
    expect(redirect.pathname).toBe('/signin');
    expect(redirect.searchParams.get('login')).toBeTruthy();
  });

  test('Never goes to an origin that is not allowed', async () => {
    mockIam({ email, email_verified: true });
    const res = await request(app).get(callback({ domain: AFIAX_IAM_DOMAIN, redirectUri: 'https://evil.example.com/signin' }));
    expect(res.status).toBe(302);
    expect(new URL(res.header.location).origin).toBe(new URL(config.appBaseUrl).origin);
  });

  test('An unknown email is refused', async () => {
    mockIam({ email: `nobody-${randomUUID()}@example.com`, email_verified: true });
    const res = await request(app).get(callback({ domain: AFIAX_IAM_DOMAIN }));
    expect(res.status).toBe(400);
  });
});
