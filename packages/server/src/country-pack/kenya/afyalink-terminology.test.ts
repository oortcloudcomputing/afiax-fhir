// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import {
  lookupIcd11Code,
  lookupIchiCode,
  lookupLoincCode,
  lookupProductCode,
  lookupShaIntervention,
} from './afyalink-terminology';

jest.mock('node-fetch');

const credentials: KenyaAfyaLinkCredentials = {
  baseUrl: 'https://uat.dha.go.ke',
  consumerKey: 'consumer-key',
  username: 'username',
  password: 'password',
};

function mockToken(): void {
  (fetch as unknown as jest.Mock).mockResolvedValueOnce({
    ok: true,
    text: async () => JSON.stringify({ token: 'jwt-token' }),
  });
}

function mockSuccess(body: unknown): void {
  (fetch as unknown as jest.Mock).mockResolvedValueOnce({
    ok: true,
    status: 200,
    text: async () => JSON.stringify(body),
  });
}

function mockNotFound(): void {
  (fetch as unknown as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status: 404,
    text: async () => 'Not Found',
  });
}

function mockServerError(): void {
  (fetch as unknown as jest.Mock).mockResolvedValueOnce({
    ok: false,
    status: 500,
    text: async () => 'Internal Server Error',
  });
}

beforeEach(() => {
  (fetch as unknown as jest.Mock).mockClear();
});

describe('lookupShaIntervention', () => {
  test('success: normalizes nested data format', async () => {
    mockToken();
    mockSuccess({
      status: 'success',
      message: 'OK',
      data: {
        code: 'SHA-INT-001',
        description: 'Outpatient Consultation',
        package_code: 'SHA-01',
        package_name: 'Primary Care Package',
        tariff_kes: 500,
        requires_preauth: false,
        combination_rule: null,
        category: 'Outpatient',
      },
    });

    const result = await lookupShaIntervention(credentials, 'SHA-INT-001');
    expect(result.data).toEqual({
      code: 'SHA-INT-001',
      description: 'Outpatient Consultation',
      packageCode: 'SHA-01',
      packageName: 'Primary Care Package',
      tariffKes: 500,
      requiresPreauth: false,
      combinationRule: null,
      category: 'Outpatient',
    });
    expect(result.status).toBe('success');
    expect(result.message).toBe('OK');
  });

  test('success: normalizes legacy root-level format', async () => {
    mockToken();
    mockSuccess({
      code: 'SHA-INT-002',
      description: 'Specialist Referral',
      packageCode: 'SHA-02',
      packageName: 'Specialist Package',
      tariffKes: 1200,
      requires_preauth: true,
      category: 'Inpatient',
    });

    const result = await lookupShaIntervention(credentials, 'SHA-INT-002');
    expect(result.data?.code).toBe('SHA-INT-002');
    expect(result.data?.requiresPreauth).toBe(true);
    expect(result.data?.packageCode).toBe('SHA-02');
  });

  test('not found: returns data: undefined without throwing', async () => {
    mockToken();
    mockNotFound();

    const result = await lookupShaIntervention(credentials, 'UNKNOWN');
    expect(result.data).toBeUndefined();
    expect(result.message).toBe('Not found');
    expect(result.raw).toBeNull();
  });

  test('error: throws on 500', async () => {
    mockToken();
    mockServerError();

    await expect(lookupShaIntervention(credentials, 'SHA-INT-001')).rejects.toThrow(
      'AfyaLink terminology lookup failed (500): Internal Server Error'
    );
  });

  test('requiresPreauth defaults to false when field is absent', async () => {
    mockToken();
    mockSuccess({ data: { code: 'SHA-INT-003', description: 'Basic care' } });

    const result = await lookupShaIntervention(credentials, 'SHA-INT-003');
    expect(result.data?.requiresPreauth).toBe(false);
  });

  test('requiresPreauth is true when pre_auth is "yes"', async () => {
    mockToken();
    mockSuccess({ data: { code: 'SHA-INT-004', pre_auth: 'yes' } });

    const result = await lookupShaIntervention(credentials, 'SHA-INT-004');
    expect(result.data?.requiresPreauth).toBe(true);
  });

  test('combinationRule is ALONE when alone_only is true', async () => {
    mockToken();
    mockSuccess({ data: { code: 'SHA-INT-005', alone_only: true } });

    const result = await lookupShaIntervention(credentials, 'SHA-INT-005');
    expect(result.data?.combinationRule).toBe('ALONE');
  });

  test('calls correct endpoint path', async () => {
    mockToken();
    mockSuccess({ data: { code: 'SHA-INT-001' } });

    await lookupShaIntervention(credentials, 'SHA-INT-001');

    const secondCall = (fetch as unknown as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toContain('/terminology/v1/sha-intervention');
    expect(secondCall[0]).toContain('code=SHA-INT-001');
    expect(secondCall[1]).toMatchObject({ headers: { Authorization: 'Bearer jwt-token' } });
  });
});

describe('lookupIcd11Code', () => {
  test('success: normalizes ICD-11 response', async () => {
    mockToken();
    mockSuccess({
      status: 'success',
      data: {
        code: '1C62.Z',
        title: 'Typhoid fever, unspecified',
        definition: 'A bacterial infection caused by Salmonella typhi.',
        parentCodes: ['1C6', '1C62'],
      },
    });

    const result = await lookupIcd11Code(credentials, '1C62.Z');
    expect(result.data).toEqual({
      code: '1C62.Z',
      title: 'Typhoid fever, unspecified',
      definition: 'A bacterial infection caused by Salmonella typhi.',
      parentCodes: ['1C6', '1C62'],
      system: 'http://id.who.int/icd/release/11/mms',
    });
  });

  test('normalizes comma-separated parentCodes string', async () => {
    mockToken();
    mockSuccess({
      data: {
        code: '1C62.Z',
        title: 'Typhoid fever',
        parent_codes: '1C6,1C62',
      },
    });

    const result = await lookupIcd11Code(credentials, '1C62.Z');
    expect(result.data?.parentCodes).toEqual(['1C6', '1C62']);
  });

  test('normalizes display field to title when title is absent', async () => {
    mockToken();
    mockSuccess({ data: { code: '1C62.Z', display: 'Typhoid fever (display)' } });

    const result = await lookupIcd11Code(credentials, '1C62.Z');
    expect(result.data?.title).toBe('Typhoid fever (display)');
  });

  test('not found: returns data: undefined without throwing', async () => {
    mockToken();
    mockNotFound();

    const result = await lookupIcd11Code(credentials, 'UNKNOWN');
    expect(result.data).toBeUndefined();
    expect(result.message).toBe('Not found');
  });

  test('error: throws on 500', async () => {
    mockToken();
    mockServerError();

    await expect(lookupIcd11Code(credentials, '1C62.Z')).rejects.toThrow(
      'AfyaLink terminology lookup failed (500)'
    );
  });

  test('calls correct endpoint path', async () => {
    mockToken();
    mockSuccess({ data: { code: '1C62.Z' } });

    await lookupIcd11Code(credentials, '1C62.Z');

    const secondCall = (fetch as unknown as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toContain('/terminology/v1/icd11');
  });
});

describe('lookupLoincCode', () => {
  test('success: normalizes camelCase LOINC response', async () => {
    mockToken();
    mockSuccess({
      status: 'success',
      data: {
        code: '2160-0',
        display: 'Creatinine [Mass/volume] in Serum or Plasma',
        component: 'Creatinine',
        property: 'MCnc',
        timeAspect: 'Pt',
        system: 'Ser/Plas',
        scaleType: 'Qn',
        longCommonName: 'Creatinine [Mass/volume] in Serum or Plasma',
        status: 'ACTIVE',
      },
    });

    const result = await lookupLoincCode(credentials, '2160-0');
    expect(result.data).toEqual({
      code: '2160-0',
      display: 'Creatinine [Mass/volume] in Serum or Plasma',
      component: 'Creatinine',
      property: 'MCnc',
      timeAspect: 'Pt',
      system: 'Ser/Plas',
      scaleType: 'Qn',
      longCommonName: 'Creatinine [Mass/volume] in Serum or Plasma',
      status: 'ACTIVE',
    });
  });

  test('normalizes ALL_CAPS LOINC column names', async () => {
    mockToken();
    mockSuccess({
      data: {
        LOINC_NUM: '2160-0',
        LONG_COMMON_NAME: 'Creatinine [Mass/volume] in Serum or Plasma',
        COMPONENT: 'Creatinine',
        PROPERTY: 'MCnc',
        TIME_ASPCT: 'Pt',
        SYSTEM: 'Ser/Plas',
        SCALE_TYP: 'Qn',
        STATUS: 'ACTIVE',
      },
    });

    const result = await lookupLoincCode(credentials, '2160-0');
    expect(result.data?.code).toBe('2160-0');
    expect(result.data?.longCommonName).toBe('Creatinine [Mass/volume] in Serum or Plasma');
    expect(result.data?.component).toBe('Creatinine');
    expect(result.data?.scaleType).toBe('Qn');
  });

  test('not found: returns data: undefined without throwing', async () => {
    mockToken();
    mockNotFound();

    const result = await lookupLoincCode(credentials, 'UNKNOWN');
    expect(result.data).toBeUndefined();
    expect(result.message).toBe('Not found');
  });

  test('error: throws on 500', async () => {
    mockToken();
    mockServerError();

    await expect(lookupLoincCode(credentials, '2160-0')).rejects.toThrow(
      'AfyaLink terminology lookup failed (500)'
    );
  });

  test('calls correct endpoint path', async () => {
    mockToken();
    mockSuccess({ data: { code: '2160-0' } });

    await lookupLoincCode(credentials, '2160-0');

    const secondCall = (fetch as unknown as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toContain('/terminology/v1/loinc');
  });
});

describe('lookupIchiCode', () => {
  test('success: normalizes ICHI response', async () => {
    mockToken();
    mockSuccess({
      status: 'success',
      data: {
        code: 'DRD.AH.AM',
        title: 'Administration of insulin',
        definition: 'Administration of insulin to a human being.',
        target_entity: 'Endocrine system',
      },
    });

    const result = await lookupIchiCode(credentials, 'DRD.AH.AM');
    expect(result.data).toEqual({
      code: 'DRD.AH.AM',
      title: 'Administration of insulin',
      definition: 'Administration of insulin to a human being.',
      targetEntity: 'Endocrine system',
      system: 'https://mitel.dimi.uniud.it/ichi/#',
    });
  });

  test('normalizes targetEntity from camelCase field', async () => {
    mockToken();
    mockSuccess({ data: { code: 'DRD.AH.AM', targetEntity: 'Endocrine system' } });

    const result = await lookupIchiCode(credentials, 'DRD.AH.AM');
    expect(result.data?.targetEntity).toBe('Endocrine system');
  });

  test('not found: returns data: undefined without throwing', async () => {
    mockToken();
    mockNotFound();

    const result = await lookupIchiCode(credentials, 'UNKNOWN');
    expect(result.data).toBeUndefined();
    expect(result.message).toBe('Not found');
  });

  test('error: throws on 500', async () => {
    mockToken();
    mockServerError();

    await expect(lookupIchiCode(credentials, 'DRD.AH.AM')).rejects.toThrow(
      'AfyaLink terminology lookup failed (500)'
    );
  });

  test('calls correct endpoint path', async () => {
    mockToken();
    mockSuccess({ data: { code: 'DRD.AH.AM' } });

    await lookupIchiCode(credentials, 'DRD.AH.AM');

    const secondCall = (fetch as unknown as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toContain('/terminology/v1/ichi');
  });
});

describe('lookupProductCode', () => {
  test('success: normalizes product response', async () => {
    mockToken();
    mockSuccess({
      status: 'success',
      data: {
        code: 'KE-MED-00123',
        product_name: 'Amoxicillin Capsules',
        generic_name: 'Amoxicillin',
        dosage_form: 'Capsule',
        strength: '500mg',
        manufacturer: 'Cosmos Limited',
        price_kes: 25,
      },
    });

    const result = await lookupProductCode(credentials, 'KE-MED-00123');
    expect(result.data).toEqual({
      code: 'KE-MED-00123',
      productName: 'Amoxicillin Capsules',
      genericName: 'Amoxicillin',
      dosageForm: 'Capsule',
      strength: '500mg',
      manufacturer: 'Cosmos Limited',
      priceKes: 25,
    });
  });

  test('normalizes priceKes from string', async () => {
    mockToken();
    mockSuccess({ data: { code: 'KE-MED-00124', price_kes: '39.50' } });

    const result = await lookupProductCode(credentials, 'KE-MED-00124');
    expect(result.data?.priceKes).toBe(39.5);
  });

  test('normalizes priceKes from price field', async () => {
    mockToken();
    mockSuccess({ data: { code: 'KE-MED-00125', price: 100 } });

    const result = await lookupProductCode(credentials, 'KE-MED-00125');
    expect(result.data?.priceKes).toBe(100);
  });

  test('not found: returns data: undefined without throwing', async () => {
    mockToken();
    mockNotFound();

    const result = await lookupProductCode(credentials, 'UNKNOWN');
    expect(result.data).toBeUndefined();
    expect(result.message).toBe('Not found');
  });

  test('error: throws on 500', async () => {
    mockToken();
    mockServerError();

    await expect(lookupProductCode(credentials, 'KE-MED-00123')).rejects.toThrow(
      'AfyaLink terminology lookup failed (500)'
    );
  });

  test('calls correct endpoint path', async () => {
    mockToken();
    mockSuccess({ data: { code: 'KE-MED-00123' } });

    await lookupProductCode(credentials, 'KE-MED-00123');

    const secondCall = (fetch as unknown as jest.Mock).mock.calls[1];
    expect(secondCall[0]).toContain('/terminology/v1/product');
  });
});
