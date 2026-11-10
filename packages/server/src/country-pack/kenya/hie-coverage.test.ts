// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { clearKenyaHieTokenCache } from './afyalink';
import {
  getKenyaHieBenefits,
  getKenyaHieInterventions,
  getKenyaHieSubBenefits,
  getKenyaHieUtilization,
  getKenyaShaAccessPointVisitTypes,
  KenyaShaScenarios,
  selectKenyaShaScenario,
} from './hie-coverage';
import { KenyaHieRequestError } from './hie-visit';

jest.mock('node-fetch');

const Base = 'https://hie.example/api/v1';
const credentials: KenyaAfyaLinkCredentials = {
  baseUrl: Base,
  clientId: 'id',
  clientSecret: 'secret',
  facilityId: 'FID-47-105963-0',
};
const mockFetch = fetch as unknown as jest.Mock;

function jsonResponse(status: number, body: unknown): Record<string, unknown> {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function mockHie(status: number, body: unknown): void {
  mockFetch
    .mockResolvedValueOnce(jsonResponse(200, { access_token: 'jwt', expires_in: 3600 }))
    .mockResolvedValueOnce(jsonResponse(status, body));
}

function lastRequest(): { url: string; method: string; headers: Record<string, string> } {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url, method: init.method, headers: init.headers };
}

const page = (results: unknown[]): unknown => ({ count: results.length, currentPage: 1, totalPages: 1, results });

describe('SHA access points', () => {
  test.each([
    ['IP', ['IP']],
    ['op', ['OP']],
    ['OP and IP', ['OP', 'IP']],
    ['IP,OP', ['OP', 'IP']],
    ['MR', []],
    ['XYZ', []],
    ['', []],
    [null, []],
  ])('%s', (accessPoint, expected) => {
    expect(getKenyaShaAccessPointVisitTypes(accessPoint)).toEqual(expected);
  });
});

describe('SHA scenario decision matrix', () => {
  const flags = (
    fund: string,
    accessPoint: string,
    paymentMechanism: string,
    needsPreauth: boolean | null,
    needsManualPreauthApproval: boolean | null = false
  ): Parameters<typeof selectKenyaShaScenario>[0] => ({
    fund,
    accessPoint,
    paymentMechanism,
    needsPreauth,
    needsManualPreauthApproval,
  });

  test.each([
    [flags('SHIF', 'IP', 'PER_DIEM', false), 'IP', 1],
    [flags('SHIF', 'IP', 'FEE_FOR_SERVICE', true), 'IP', 2],
    [flags('SHIF', 'IP', 'FEE FOR SERVICE', true, true), 'IP', 3],
    [flags('SHIF', 'OP', 'FEE_FOR_SERVICE', true, true), 'OP', 4],
    [flags('shif', 'OP and IP', 'fee-for-service', true), 'OP', 5],
    [flags('UHC', 'OP', 'CAPITATION', null, null), 'OP', 6],
  ] as const)('scenario %#', (intervention, visitType, id) => {
    expect(selectKenyaShaScenario(intervention, visitType)).toBe(KenyaShaScenarios[id]);
  });

  test('flags outside the matrix select no scenario', () => {
    // SHIF outpatient fee for service without preauth is not one of DHA's scenarios
    expect(selectKenyaShaScenario(flags('SHIF', 'OP', 'FEE_FOR_SERVICE', false), 'OP')).toBeUndefined();
    // Not billable on this visit
    expect(selectKenyaShaScenario(flags('SHIF', 'IP', 'PER_DIEM', false), 'OP')).toBeUndefined();
    // Emergency is its own flow
    expect(selectKenyaShaScenario(flags('ECCIF', 'OP', 'FEE_FOR_SERVICE', false), 'OP')).toBeUndefined();
    // Preauth flag missing: do not guess
    expect(selectKenyaShaScenario(flags('SHIF', 'IP', 'FEE_FOR_SERVICE', null), 'IP')).toBeUndefined();
  });

  test('every scenario has the dispatch DHA documents', () => {
    expect([1, 2, 3].map((id) => KenyaShaScenarios[id as 1].dispatch)).toEqual(['discharge', 'discharge', 'discharge']);
    expect([4, 5, 6].map((id) => KenyaShaScenarios[id as 4].dispatch)).toEqual(['submit', 'submit', 'submit']);
  });
});

describe('Kenya HIE coverage lookups', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  test('lists the benefits with the facility headers', async () => {
    mockHie(200, page([{ parentBenefit: 'Outpatient services', parentBenefitCode: 'SHA-19' }]));
    await expect(getKenyaHieBenefits(credentials, 'CR1')).resolves.toEqual({
      count: 1,
      currentPage: 1,
      totalPages: 1,
      results: [{ code: 'SHA-19', name: 'Outpatient services' }],
    });
    expect(lastRequest()).toMatchObject({
      url: `${Base}/patients/benefits?patient_id=CR1`,
      method: 'GET',
      headers: expect.objectContaining({ 'X-Facility-Id': 'FID-47-105963-0', 'X-Facility-Id-Type': 'fr-code' }),
    });
  });

  test('keeps only the sub-benefits billable on the visit', async () => {
    mockHie(
      200,
      page([
        { code: 'SHA-19-SC-13', name: 'Outpatient consultation', accessPoint: 'OP', cover: { policyNumber: 'P1' } },
        { code: 'SHA-02-SC-01', name: 'Inpatient', accessPoint: 'IP' },
        { code: 'SHA-05-SC-01', name: 'Either', accessPoint: 'OP and IP' },
        { code: 'SHA-99-SC-01', name: 'Other', accessPoint: 'MR' },
      ])
    );
    const result = await getKenyaHieSubBenefits(credentials, 'CR1', { parentBenefitCode: 'SHA-19', visitType: 'OP' });
    expect(result.results.map((s) => s.code)).toEqual(['SHA-19-SC-13', 'SHA-05-SC-01']);
    expect(result.results[0].cover).toMatchObject({ policyNumber: 'P1' });
    expect(lastRequest().url).toBe(`${Base}/patients/sub-benefits?patient_id=CR1&parent_benefit_code=SHA-19`);
  });

  test('returns interventions with their flags and scenario', async () => {
    mockHie(
      200,
      page([
        {
          code: 'SHA-19-404',
          name: 'Consultation',
          benefitCode: 'SHA-19-SC-13',
          accessPoint: 'OP',
          fund: 'SHIF',
          paymentMechanism: 'FEE_FOR_SERVICE',
          needsPreauth: true,
          needsManualPreauthApproval: false,
          requiresRadiologyPreauth: true,
          kephLevelTarriff: 1500,
          overallTariff: 2000,
          requiredPreauthDocumentTypes: ['REFERRAL'],
        },
        { code: 'SHA-02-001', accessPoint: 'IP', fund: 'SHIF', paymentMechanism: 'PER_DIEM', needsPreauth: false },
      ])
    );
    const result = await getKenyaHieInterventions(credentials, 'CR1', {
      subBenefitCode: 'SHA-19-SC-13',
      visitType: 'OP',
      page: 2,
      pageSize: 20,
    });
    expect(lastRequest().url).toBe(
      `${Base}/patients/benefits/interventions?patient_id=CR1&sub_benefit_code=SHA-19-SC-13&page=2&page_size=20`
    );
    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({
      code: 'SHA-19-404',
      subBenefitCode: 'SHA-19-SC-13',
      tariff: 1500,
      specialPreauth: ['radiology'],
      requiredPreauthDocumentTypes: ['REFERRAL'],
      scenario: KenyaShaScenarios[5],
    });
  });

  test('reads the utilization for one intervention', async () => {
    mockHie(200, [
      {
        code: 'SHA-18-005',
        crId: 'CR1',
        individualMaxLimit: 180,
        individualUtilisedLimit: 12,
        householdMaxLimit: 180,
        householdUtilisedLimit: 40,
        limitScope: 'HOUSEHOLD',
        computationalDetail: { eligibility: true, limitAvailableAmount: 140, nextAvailableDate: '2026-11-11' },
        fundUtilizationLimit: [{ fundType: 'SHIF', maxAmount: 100000, utilisedAmount: 2500, availableAmount: 97500 }],
      },
    ]);
    const [u] = await getKenyaHieUtilization(credentials, 'CR1', ' SHA-18-005 ');
    expect(lastRequest().url).toBe(`${Base}/patients/benefits/utilization?patient_id=CR1&intervention_code=SHA-18-005`);
    expect(u).toMatchObject({
      limitScope: 'HOUSEHOLD',
      eligible: true,
      householdUtilisedLimit: 40,
      limitAvailableAmount: 140,
      funds: [{ fundType: 'SHIF', availableAmount: 97500 }],
    });
  });

  test('needs the patient and intervention', async () => {
    await expect(getKenyaHieSubBenefits(credentials, ' ')).rejects.toThrow('Client Registry ID is required');
    await expect(getKenyaHieUtilization(credentials, 'CR1', '')).rejects.toThrow('intervention code is required');
  });

  test('reports a DHA error as a request error', async () => {
    mockHie(400, { message: 'Patient not found' });
    await expect(getKenyaHieInterventions(credentials, 'CR404')).rejects.toBeInstanceOf(KenyaHieRequestError);
  });
});
