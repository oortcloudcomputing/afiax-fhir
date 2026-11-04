// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { loadTestConfig } from '../../config/loader';
import { clearKnhtsCache, KnhtsSources, lookupKnhtsConcept, searchKnhtsConcepts } from './knhts';

function jsonResponse(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe('KNHTS client', () => {
  beforeAll(async () => {
    await loadTestConfig();
  });

  beforeEach(() => {
    clearKnhtsCache();
  });

  test('finds a concept and calls the OCL concept URL', async () => {
    const fetchFn = jest.fn(async () =>
      jsonResponse(200, { id: '1F40', display_name: 'Malaria due to Plasmodium falciparum', retired: false })
    );
    const result = await lookupKnhtsConcept(KnhtsSources.icd11, '1F40', fetchFn as unknown as typeof fetch);
    expect(result).toEqual({ status: 'found', display: 'Malaria due to Plasmodium falciparum', retired: false });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://ilm-hie.dha.go.ke/ocl/orgs/WHO/sources/ICD-11/concepts/1F40/',
      expect.anything()
    );
  });

  test('reports not-found on 404 and caches results', async () => {
    const fetchFn = jest.fn(async () => jsonResponse(404, { detail: 'Not found.' }));
    const f = fetchFn as unknown as typeof fetch;
    expect(await lookupKnhtsConcept(KnhtsSources.icd11, '1F4Q', f)).toEqual({ status: 'not-found' });
    expect(await lookupKnhtsConcept(KnhtsSources.icd11, '1F4Q', f)).toEqual({ status: 'not-found' });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  test('reports unavailable on errors and does not cache them', async () => {
    const fetchFn = jest.fn(async () => {
      throw new Error('network down');
    });
    const f = fetchFn as unknown as typeof fetch;
    expect(await lookupKnhtsConcept(KnhtsSources.icd11, '1A00', f)).toEqual({
      status: 'unavailable',
      reason: 'network down',
    });
    expect((await lookupKnhtsConcept(KnhtsSources.icd11, '1A00', f)).status).toBe('unavailable');
    expect(fetchFn).toHaveBeenCalledTimes(2);
    const server = jest.fn(async () => jsonResponse(503));
    expect(await lookupKnhtsConcept(KnhtsSources.icd11, '1A00', server as unknown as typeof fetch)).toEqual({
      status: 'unavailable',
      reason: 'KNHTS returned HTTP 503',
    });
  });
});

describe('searchKnhtsConcepts', () => {
  test('filters by code prefix and extras, and drops retired concepts', async () => {
    const fetchFn = jest.fn(async (_url: string) =>
      jsonResponse(200, [
        { id: 'INV-1', display_name: 'X Ray Chest', extras: { domain: 'Imaging', status: 'PUBLISHED' } },
        { id: 'INV-2', display_name: 'Full blood count', extras: { domain: 'Laboratory', status: 'PUBLISHED' } },
        { id: 'INV-3', display_name: 'Old imaging', extras: { domain: 'Imaging', status: 'RETIRED' } },
        { id: 'INV-4', display_name: 'Retired', retired: true, extras: { domain: 'Imaging' } },
        { id: 'X-Ray', display_name: 'X-Ray group', extras: {} },
      ])
    );
    const results = await searchKnhtsConcepts(KnhtsSources.investigations, 'x ray', {
      extras: { domain: 'Imaging' },
      codePrefixes: ['INV-'],
      fetchFn: fetchFn as unknown as typeof fetch,
    });
    expect(results.map((r) => r.code)).toEqual(['INV-1']);
    expect(fetchFn.mock.calls[0][0]).toContain('/orgs/MOH-PPB/sources/Investigations/concepts/?q=x+ray');
  });

  test('throws when KNHTS fails', async () => {
    const fetchFn = jest.fn(async () => jsonResponse(502));
    await expect(
      searchKnhtsConcepts(KnhtsSources.healthProducts, 'amox', { fetchFn: fetchFn as unknown as typeof fetch })
    ).rejects.toThrow('HTTP 502');
  });
});
