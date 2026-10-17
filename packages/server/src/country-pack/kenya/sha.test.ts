// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Bundle } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import {
  checkKenyaShaClaimStatus,
  getKenyaShaClaimsCredentials,
  getKenyaShaClaimsToken,
  KenyaShaBundleIdIdentifierSystem,
  submitKenyaShaClaimBundle,
} from './sha';
import type { Project } from '@medplum/fhirtypes';

jest.mock('node-fetch');

const baseCredentials = {
  baseUrl: 'https://qa-mis.apeiro-digital.com',
  accessKey: 'test-access-key',
  secretKey: 'test-secret-key',
};

describe('getKenyaShaClaimsToken', () => {
  test('produces a valid HS256 JWT signed with secretKey', async () => {
    const token = await getKenyaShaClaimsToken(baseCredentials);
    const parts = token.split('.');
    expect(parts).toHaveLength(3);
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    expect(header.alg).toBe('HS256');
    expect(header.typ).toBe('JWT');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    expect(payload.key).toBe('test-access-key');
    expect(typeof payload.iat).toBe('number');
    expect(typeof payload.exp).toBe('number');
    expect(payload.exp - payload.iat).toBe(60);
  });

  test('uses the supplied nowSeconds for iat/exp', async () => {
    const nowSeconds = 1700000000;
    const token = await getKenyaShaClaimsToken(baseCredentials, nowSeconds);
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    expect(payload.iat).toBe(nowSeconds);
    expect(payload.exp).toBe(nowSeconds + 60);
  });
});

describe('getKenyaShaClaimsCredentials', () => {
  test('returns UAT base URL by default', () => {
    const project: Project = {
      resourceType: 'Project',
      id: 'project-1',
      secret: [
        { name: 'kenyaShaClaimsAccessKey', valueString: 'ak' },
        { name: 'kenyaShaClaimsSecretKey', valueString: 'sk' },
      ],
    };
    expect(getKenyaShaClaimsCredentials(project).baseUrl).toBe('https://qa-mis.apeiro-digital.com');
  });

  test('returns production base URL when environment is set to production', () => {
    const project: Project = {
      resourceType: 'Project',
      id: 'project-1',
      setting: [{ name: 'kenyaShaClaimsEnvironment', valueString: 'production' }],
      secret: [
        { name: 'kenyaShaClaimsAccessKey', valueString: 'ak' },
        { name: 'kenyaShaClaimsSecretKey', valueString: 'sk' },
      ],
    };
    expect(getKenyaShaClaimsCredentials(project).baseUrl).toBe('https://fhir.sha.go.ke');
  });

  test('throws when accessKey is missing', () => {
    const project: Project = {
      resourceType: 'Project',
      id: 'project-1',
      secret: [{ name: 'kenyaShaClaimsSecretKey', valueString: 'sk' }],
    };
    expect(() => getKenyaShaClaimsCredentials(project)).toThrow('kenyaShaClaimsAccessKey');
  });
});

describe('submitKenyaShaClaimBundle', () => {
  beforeEach(() => {
    (fetch as unknown as jest.Mock).mockClear();
  });

  const minimalBundle: Bundle = { resourceType: 'Bundle', type: 'message' };

  test('POSTs to /v1/shr-med/bundle with Bearer token and FHIR content type', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: jest.fn(async () => JSON.stringify({ status: 'accepted' })),
    });

    const result = await submitKenyaShaClaimBundle(baseCredentials, minimalBundle, 'bundle-abc');

    expect(fetch).toHaveBeenCalledWith(
      'https://qa-mis.apeiro-digital.com/v1/shr-med/bundle',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer /),
          'Content-Type': 'application/fhir+json',
          Accept: expect.stringContaining('application/json'),
        }),
        body: expect.stringContaining('"resourceType":"Bundle"'),
      })
    );
    expect(result.responseStatusCode).toBe(202);
    expect(result.submissionEndpoint).toBe('https://qa-mis.apeiro-digital.com/v1/shr-med/bundle');
    expect(result.statusTrackingEndpoint).toBe(
      'https://qa-mis.apeiro-digital.com/v1/shr-med/claim-status?claim_id=bundle-abc'
    );
  });

  test('includes X-Callback-Url header when callbackUrl is configured', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: jest.fn(async () => '{}'),
    });

    await submitKenyaShaClaimBundle(
      { ...baseCredentials, callbackUrl: 'https://afiax.africa/sha-callback/project-1' },
      minimalBundle,
      'bundle-abc'
    );

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'X-Callback-Url': 'https://afiax.africa/sha-callback/project-1',
        }),
      })
    );
  });

  test('does not include X-Callback-Url header when callbackUrl is not configured', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 202,
      text: jest.fn(async () => '{}'),
    });

    await submitKenyaShaClaimBundle(baseCredentials, minimalBundle, 'bundle-abc');

    const callArgs = (fetch as unknown as jest.Mock).mock.calls[0][1];
    expect(callArgs.headers).not.toHaveProperty('X-Callback-Url');
  });

  test('throws when SHA returns a non-ok status', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: jest.fn(async () => 'Unprocessable Entity'),
    });

    await expect(submitKenyaShaClaimBundle(baseCredentials, minimalBundle, 'bundle-abc')).rejects.toThrow(
      'Kenya SHA claim submission failed (422)'
    );
  });
});

describe('checkKenyaShaClaimStatus', () => {
  beforeEach(() => {
    (fetch as unknown as jest.Mock).mockClear();
  });

  test('GETs /v1/shr-med/claim-status?claim_id=...', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: jest.fn(async () => JSON.stringify({ claim_state: 'Payment Approved', message: 'Approved' })),
    });

    const result = await checkKenyaShaClaimStatus(baseCredentials, 'bundle-xyz');

    expect(fetch).toHaveBeenCalledWith(
      'https://qa-mis.apeiro-digital.com/v1/shr-med/claim-status?claim_id=bundle-xyz',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }),
      })
    );
    expect(result.claimState).toBe('Payment Approved');
    expect(result.message).toBe('Approved');
    expect(result.statusEndpoint).toContain('claim_id=bundle-xyz');
  });

  test('extracts ClaimResponse from a FHIR Bundle response', async () => {
    const remoteClaimResponse = {
      resourceType: 'ClaimResponse',
      status: 'active',
      type: { text: 'Institutional' },
      use: 'claim',
      patient: { reference: 'Patient/p1' },
      created: '2026-06-20',
      insurer: { reference: 'Organization/sha' },
      outcome: 'complete',
      disposition: 'Claim approved',
    };
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: jest.fn(async () =>
        JSON.stringify({
          resourceType: 'Bundle',
          type: 'collection',
          entry: [{ resource: remoteClaimResponse }],
        })
      ),
    });

    const result = await checkKenyaShaClaimStatus(baseCredentials, 'bundle-xyz');

    expect(result.claimResponse?.resourceType).toBe('ClaimResponse');
    expect(result.claimResponse?.outcome).toBe('complete');
    expect(result.claimState).toBe('complete');
  });

  test('throws when SHA returns a non-ok status', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: jest.fn(async () => 'Not Found'),
    });

    await expect(checkKenyaShaClaimStatus(baseCredentials, 'bundle-missing')).rejects.toThrow(
      'Kenya SHA claim status failed (404)'
    );
  });
});

describe('KenyaShaBundleIdIdentifierSystem', () => {
  test('is a stable URL', () => {
    expect(KenyaShaBundleIdIdentifierSystem).toBe('https://afiax.africa/kenya/identifier/sha-bundle-id');
  });
});
