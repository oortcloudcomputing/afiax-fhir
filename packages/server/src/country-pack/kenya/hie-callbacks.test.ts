// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { clearKenyaHieTokenCache } from './afyalink';
import {
  getKenyaHieCallbackEventKey,
  listKenyaHieCallbacks,
  parseKenyaHieCallback,
  registerKenyaHieCallbacks,
} from './hie-callbacks';

jest.mock('node-fetch');

const Base = 'https://hie.example/api/v1';
const credentials: KenyaAfyaLinkCredentials = { baseUrl: Base, clientId: 'tenant-code-1', clientSecret: 'secret' };
const mockFetch = fetch as unknown as jest.Mock;

function jsonResponse(status: number, body: unknown): Record<string, unknown> {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

describe('DHA status callback payloads (samples from DHA Status Callbacks guide)', () => {
  test('claim callback', () => {
    const cb = parseKenyaHieCallback({
      subject_guid: '9f8c1a2b-4d5e-4f60-8a71-2b3c4d5e6f70',
      provider_claim_no: 'OP-21-26-1',
      from_state: 'SUBMITTED_PAYER',
      to_state: 'APPROVED',
      facility_fr_code: 'FID-47-115307-8',
      entity_type: 'claim',
      timestamp: '2026-08-06T13:15:50.862762+00:00',
      consent_token: 'K5HLPJVDNV',
      notes: 'Approved in full',
    });
    expect(cb).toEqual({
      subjectGuid: '9f8c1a2b-4d5e-4f60-8a71-2b3c4d5e6f70',
      fromState: 'SUBMITTED_PAYER',
      toState: 'APPROVED',
      entityType: 'claim',
      timestamp: '2026-08-06T13:15:50.862762+00:00',
      facilityFrCode: 'FID-47-115307-8',
      providerClaimNo: 'OP-21-26-1',
      consentToken: 'K5HLPJVDNV',
      notes: 'Approved in full',
    });
    expect(getKenyaHieCallbackEventKey(cb)).toBe('claim:9f8c1a2b-4d5e-4f60-8a71-2b3c4d5e6f70:APPROVED');
  });

  test('authorization callback without provider_claim_no', () => {
    expect(
      parseKenyaHieCallback({
        subject_guid: '4b7d9e10-2c3f-4a5b-9d8e-7f6a5b4c3d2e',
        from_state: 'AUTHORIZED',
        to_state: 'SUBMITTED_CLAIM',
        facility_fr_code: 'FID-47-115307-8',
        tenant_code: 'his-tenant-code',
        entity_type: 'authorization',
        timestamp: '2026-08-06T13:10:16.828383+00:00',
        consent_token: 'K5HLPJVDNV',
      })
    ).toMatchObject({ entityType: 'authorization', tenantCode: 'his-tenant-code', toState: 'SUBMITTED_CLAIM' });
  });

  test('preauth callback with empty conditional fields', () => {
    const cb = parseKenyaHieCallback({
      subject_guid: '1a2b3c4d-5e6f-4071-8293-a4b5c6d7e8f9',
      from_state: 'ACTIVE',
      to_state: 'FINALISED',
      facility_fr_code: 'FID-47-115307-8',
      entity_type: 'preauth',
      timestamp: '2026-08-06T13:10:16.828383+00:00',
      consent_token: '',
      notes: '',
    });
    expect(cb.consentToken).toBeUndefined();
    expect(cb.notes).toBeUndefined();
  });

  test('rejects payloads DHA never sends', () => {
    expect(() => parseKenyaHieCallback('x')).toThrow('JSON object');
    expect(() => parseKenyaHieCallback({ subject_guid: 'g' })).toThrow('missing from_state, to_state');
    expect(() =>
      parseKenyaHieCallback({
        subject_guid: 'g',
        from_state: 'A',
        to_state: 'B',
        entity_type: 'preauthorization',
        timestamp: 't',
        facility_fr_code: 'FID-1',
      })
    ).toThrow('claim, preauth or authorization');
  });
});

describe('Registering callbacks with DHA', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  test('registers an endpoint and its status_changed operation per entity type', async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse(200, { access_token: 'jwt', expires_in: 3600 }));
    for (const id of ['e1', 'e2']) {
      mockFetch
        .mockResolvedValueOnce(jsonResponse(201, { endpoint_id: id }))
        .mockResolvedValueOnce(jsonResponse(201, { operation_id: `op-${id}` }));
    }
    const result = await registerKenyaHieCallbacks(credentials, {
      baseUrl: 'https://fhir.example/kenya/hie/callbacks/p1/s3cret/',
      facilityFrCode: 'FID-47-105963-0',
      environment: 'sandbox',
      entityTypes: ['claim', 'preauth'],
    });
    expect(result).toEqual([
      {
        entityType: 'claim',
        endpointId: 'e1',
        operationId: 'op-e1',
        url: 'https://fhir.example/kenya/hie/callbacks/p1/s3cret/claim-status',
      },
      {
        entityType: 'preauth',
        endpointId: 'e2',
        operationId: 'op-e2',
        url: 'https://fhir.example/kenya/hie/callbacks/p1/s3cret/preauth-status',
      },
    ]);
    const calls = mockFetch.mock.calls.slice(1).map(([url, init]) => ({ url, body: JSON.parse(init.body) }));
    expect(calls[0]).toEqual({
      url: `${Base}/tenants/tenant-code-1/endpoints`,
      body: {
        name: 'Afiax claim status',
        entity_type: 'claim',
        base_url: 'https://fhir.example/kenya/hie/callbacks/p1/s3cret',
        auth_type: 'none',
        environment: 'sandbox',
        tenant_code: 'tenant-code-1',
        facility_fr_code: 'FID-47-105963-0',
      },
    });
    expect(calls[1]).toEqual({
      url: `${Base}/tenants/FID-47-105963-0/endpoints/e1/operations`,
      body: { name: 'Afiax claim status changed', action: 'status_changed', method: 'POST', path: '/claim-status' },
    });
  });

  test('needs an https base URL and an FR code', async () => {
    await expect(
      registerKenyaHieCallbacks(credentials, { baseUrl: 'http://x', facilityFrCode: 'FID-1', environment: 'sandbox' })
    ).rejects.toThrow('https');
    await expect(
      registerKenyaHieCallbacks(credentials, { baseUrl: 'https://x', facilityFrCode: '_', environment: 'sandbox' })
    ).rejects.toThrow('FR code');
  });

  test('lists by FR code', async () => {
    mockFetch
      .mockResolvedValueOnce(jsonResponse(200, { access_token: 'jwt', expires_in: 3600 }))
      .mockResolvedValueOnce(jsonResponse(200, []));
    await listKenyaHieCallbacks(credentials, 'FID-47-105963-0');
    expect(mockFetch.mock.calls[1][0]).toBe(`${Base}/tenants/FID-47-105963-0/endpoints`);
  });
});
