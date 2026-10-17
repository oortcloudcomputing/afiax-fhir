// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Observation, Patient } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import { randomBytes, randomUUID } from 'node:crypto';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { DatabaseMode, getDatabasePool } from '../database';
import { createTestProject, withTestContext } from '../test.setup';
import {
  decryptStoredContent,
  encryptStoredContent,
  initFieldEncryption,
  isEncryptedContent,
  parseStoredResource,
  shutdownFieldEncryption,
} from './encryption';
import type { Repository } from './repo';

jest.mock('node-fetch', () => {
  const actual = jest.requireActual('node-fetch');
  return { __esModule: true, ...actual, default: jest.fn(actual.default) };
});

const localKey = randomBytes(32).toString('base64');
const patientJson = (id: string): string =>
  JSON.stringify({ resourceType: 'Patient', id, name: [{ family: 'Wanjiru' }] });

describe('Field encryption (local key)', () => {
  beforeEach(async () => {
    await initFieldEncryption({ enabled: true, localKey });
  });

  afterEach(async () => {
    await shutdownFieldEncryption();
  });

  test('round-trips an encrypted resource body', async () => {
    const id = randomUUID();
    const stored = encryptStoredContent('Patient', id, patientJson(id));
    expect(isEncryptedContent(stored)).toBe(true);
    expect(stored).not.toContain('Wanjiru');
    expect(await decryptStoredContent(stored)).toBe(patientJson(id));
  });

  test('leaves resource types that are not configured as plaintext', () => {
    const content = JSON.stringify({ resourceType: 'Organization', id: '1', name: 'Clinic' });
    expect(encryptStoredContent('Organization', '1', content)).toBe(content);
  });

  test('reads plaintext values written before encryption was enabled', async () => {
    const id = randomUUID();
    expect(await parseStoredResource<Patient>(patientJson(id))).toMatchObject({ id });
  });

  test('rejects an encrypted body moved to a different resource', async () => {
    const a = randomUUID();
    const b = randomUUID();
    const storedForA = encryptStoredContent('Patient', a, patientJson(b));
    await expect(parseStoredResource(storedForA)).rejects.toThrow('does not match');
  });

  test('rejects tampered ciphertext', async () => {
    const id = randomUUID();
    const stored = encryptStoredContent('Patient', id, patientJson(id));
    const [head, payload] = [stored.slice(0, stored.lastIndexOf(':') + 1), stored.slice(stored.lastIndexOf(':') + 1)];
    const [iv, ciphertext, tag] = payload.split('.');
    const flipped = Buffer.from(ciphertext, 'base64url');
    flipped[0] ^= 0xff;
    await expect(decryptStoredContent(`${head}${iv}.${flipped.toString('base64url')}.${tag}`)).rejects.toThrow();
  });

  test('cannot decrypt once encryption is shut down', async () => {
    const id = randomUUID();
    const stored = encryptStoredContent('Patient', id, patientJson(id));
    await shutdownFieldEncryption();
    await expect(decryptStoredContent(stored)).rejects.toThrow('not enabled');
  });

  test('rejects a local key of the wrong length', async () => {
    await expect(initFieldEncryption({ enabled: true, localKey: 'c2hvcnQ=' })).rejects.toThrow('32 bytes');
  });
});

describe('Field encryption (Vault Transit)', () => {
  const mockFetch = fetch as unknown as jest.Mock;
  const dek = randomBytes(32);

  function vaultResponse(data: object, status = 200): object {
    return { ok: status < 400, status, json: async () => ({ data }) };
  }

  afterEach(async () => {
    await shutdownFieldEncryption();
    mockFetch.mockReset();
  });

  test('wraps data keys with Vault and unwraps them on another instance', async () => {
    mockFetch.mockResolvedValueOnce(
      vaultResponse({ plaintext: dek.toString('base64'), ciphertext: 'vault:v1:wrapped-dek' })
    );
    const vault = { address: 'http://vault:8200', token: 'test-token' };
    await initFieldEncryption({ enabled: true, vault, rotationHours: 0 });
    expect(mockFetch.mock.calls[0][0]).toBe('http://vault:8200/v1/transit/datakey/plaintext/afiax-fhir');

    const id = randomUUID();
    const stored = encryptStoredContent('Patient', id, patientJson(id));
    expect(stored).not.toContain(dek.toString('base64'));

    // A fresh instance only has the wrapped key inside the stored value
    mockFetch.mockResolvedValueOnce(
      vaultResponse({ plaintext: randomBytes(32).toString('base64'), ciphertext: 'vault:v1:other-dek' })
    );
    await initFieldEncryption({ enabled: true, vault, rotationHours: 0 });
    mockFetch.mockResolvedValueOnce(vaultResponse({ plaintext: dek.toString('base64') }));
    expect(await decryptStoredContent(stored)).toBe(patientJson(id));
    expect(mockFetch.mock.calls[2][0]).toBe('http://vault:8200/v1/transit/decrypt/afiax-fhir');
    expect(JSON.parse(mockFetch.mock.calls[2][1].body)).toEqual({ ciphertext: 'vault:v1:wrapped-dek' });
  });

  test('fails closed when Vault refuses the request', async () => {
    mockFetch.mockResolvedValueOnce(vaultResponse({}, 403));
    await expect(
      initFieldEncryption({ enabled: true, vault: { address: 'http://vault:8200', token: 't' }, rotationHours: 0 })
    ).rejects.toThrow('403');
  });
});

describe('Field encryption in the repository', () => {
  let repo: Repository;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
    repo = (await createTestProject({ withRepo: true })).repo;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  beforeEach(async () => {
    await initFieldEncryption({ enabled: true, localKey });
  });

  afterEach(async () => {
    await shutdownFieldEncryption();
  });

  async function rawContent(table: string, id: string): Promise<string> {
    const result = await getDatabasePool(DatabaseMode.WRITER).query(`SELECT content FROM "${table}" WHERE id = $1`, [
      id,
    ]);
    return result.rows[0].content;
  }

  test('stores Patient bodies encrypted and reads them back', () =>
    withTestContext(async () => {
      const family = `Otieno${randomUUID().slice(0, 8)}`;
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family }] });

      const stored = await rawContent('Patient', patient.id);
      expect(isEncryptedContent(stored)).toBe(true);
      expect(stored).not.toContain(family);
      expect(await rawContent('Patient_History', patient.id)).not.toContain(family);

      expect((await repo.readResource<Patient>('Patient', patient.id)).name?.[0]?.family).toBe(family);
      const found = await repo.searchResources<Patient>({
        resourceType: 'Patient',
        filters: [{ code: 'family', operator: '=' as never, value: family }],
      });
      expect(found.map((p) => p.id)).toEqual([patient.id]);
    }));

  test('reads history and versions of encrypted resources', () =>
    withTestContext(async () => {
      const obs = await repo.createResource<Observation>({
        resourceType: 'Observation',
        status: 'preliminary',
        code: { text: 'Blood pressure' },
      });
      const updated = await repo.updateResource<Observation>({ ...obs, status: 'final' });

      const history = await repo.readHistory<Observation>('Observation', obs.id);
      expect(history.entry?.map((e) => e.resource?.status)).toEqual(['final', 'preliminary']);
      const v1 = await repo.readVersion<Observation>('Observation', obs.id, obs.meta?.versionId as string);
      expect(v1.status).toBe('preliminary');
      expect(updated.status).toBe('final');
    }));

  test('still reads rows written before encryption was enabled', () =>
    withTestContext(async () => {
      await shutdownFieldEncryption();
      const patient = await repo.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Kamau' }] });
      expect(isEncryptedContent(await rawContent('Patient', patient.id))).toBe(false);

      await initFieldEncryption({ enabled: true, localKey });
      expect((await repo.readResource<Patient>('Patient', patient.id)).name?.[0]?.family).toBe('Kamau');
    }));
});
