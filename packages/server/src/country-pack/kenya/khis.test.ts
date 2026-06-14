// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import { buildKhisDataValueSet, getKhisCredentials, pushKhisDataValueSet } from './khis';

jest.mock('node-fetch');

function buildProject(overrides?: Partial<Project>): Project {
  return {
    resourceType: 'Project',
    id: 'project-1',
    setting: [
      { name: 'kenyaKhisEnvironment', valueString: 'uat' },
      { name: 'kenyaKhisMoh505DataSetUid', valueString: 'MOH505_UID' },
      { name: 'kenyaKhisDataElementMapping', valueString: JSON.stringify({
        'A00': { suspected: 'CHOLERA_S_UID', confirmed: 'CHOLERA_C_UID', deaths: 'CHOLERA_D_UID' },
        'B05': { suspected: 'MEASLES_S_UID', confirmed: 'MEASLES_C_UID' },
      }) },
    ],
    secret: [
      { name: 'kenyaKhisUsername', valueString: 'admin' },
      { name: 'kenyaKhisPassword', valueString: 'secret' },
    ],
    ...overrides,
  } as Project;
}

describe('getKhisCredentials', () => {
  test('reads credentials from project secret and settings', () => {
    const creds = getKhisCredentials(buildProject());
    expect(creds.username).toBe('admin');
    expect(creds.password).toBe('secret');
    expect(creds.moh505DataSetUid).toBe('MOH505_UID');
    expect(creds.baseUrl).toContain('hiskenya');
    expect(creds.dataElementMapping['A00']?.suspected).toBe('CHOLERA_S_UID');
  });

  test('throws when username/password missing', () => {
    const project = buildProject({ secret: [] });
    expect(() => getKhisCredentials(project)).toThrow('KHIS credentials');
  });

  test('throws when MOH 505 dataset UID not configured', () => {
    const project = buildProject({
      setting: [
        { name: 'kenyaKhisEnvironment', valueString: 'uat' },
        { name: 'kenyaKhisDataElementMapping', valueString: '{}' },
      ],
    });
    expect(() => getKhisCredentials(project)).toThrow('MOH 505 dataset UID');
  });
});

describe('buildKhisDataValueSet', () => {
  test('maps aggregates to DHIS2 data values using configured UIDs', () => {
    const creds = getKhisCredentials(buildProject());
    const payload = buildKhisDataValueSet(creds, '2026W24', 'ORG_UNIT_1', [
      { code: 'A00', suspected: 3, confirmed: 1, deaths: 0 },
      { code: 'B05', suspected: 5, confirmed: 2, deaths: 0 },
    ]);

    expect(payload.dataSet).toBe('MOH505_UID');
    expect(payload.period).toBe('2026W24');
    expect(payload.orgUnit).toBe('ORG_UNIT_1');
    expect(payload.dataValues).toHaveLength(5); // A00×3 + B05×2 (no deaths for B05)

    const suspectedCholera = payload.dataValues.find((d) => d.dataElement === 'CHOLERA_S_UID');
    expect(suspectedCholera?.value).toBe(3);
    const confirmedCholera = payload.dataValues.find((d) => d.dataElement === 'CHOLERA_C_UID');
    expect(confirmedCholera?.value).toBe(1);
  });

  test('skips conditions not in mapping', () => {
    const creds = getKhisCredentials(buildProject());
    const payload = buildKhisDataValueSet(creds, '2026W24', 'ORG', [
      { code: 'J09', suspected: 2, confirmed: 0, deaths: 0 }, // not in mapping
    ]);
    expect(payload.dataValues).toHaveLength(0);
  });
});

describe('pushKhisDataValueSet', () => {
  beforeEach(() => (fetch as unknown as jest.Mock).mockClear());

  test('returns import summary on success', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: jest.fn(async () => ({
        status: 'SUCCESS',
        importCount: { imported: 5, updated: 0, ignored: 0, deleted: 0 },
      })),
    });

    const creds = getKhisCredentials(buildProject());
    const summary = await pushKhisDataValueSet(creds, {
      dataSet: 'MOH505_UID',
      period: '2026W24',
      orgUnit: 'ORG',
      dataValues: [{ dataElement: 'CHOLERA_S_UID', value: 3 }],
    });

    expect(summary.status).toBe('SUCCESS');
    expect(summary.importCount?.imported).toBe(5);
    const call = (fetch as unknown as jest.Mock).mock.calls[0];
    expect(call[0]).toContain('/api/dataValueSets');
    expect(call[1].headers['Authorization']).toMatch(/^Basic /);
  });

  test('throws on HTTP error', async () => {
    (fetch as unknown as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: jest.fn(async () => ({ status: 'ERROR', description: 'Unauthorized' })),
    });

    const creds = getKhisCredentials(buildProject());
    await expect(pushKhisDataValueSet(creds, {
      dataSet: 'UID', period: '2026W24', orgUnit: 'ORG', dataValues: [],
    })).rejects.toThrow('HTTP 401');
  });

  test('throws on network failure', async () => {
    (fetch as unknown as jest.Mock).mockRejectedValueOnce(new Error('ECONNREFUSED'));
    const creds = getKhisCredentials(buildProject());
    await expect(pushKhisDataValueSet(creds, {
      dataSet: 'UID', period: '2026W24', orgUnit: 'ORG', dataValues: [],
    })).rejects.toThrow('ECONNREFUSED');
  });
});
