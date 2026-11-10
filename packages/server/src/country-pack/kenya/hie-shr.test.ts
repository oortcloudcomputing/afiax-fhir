// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { clearKenyaHieTokenCache } from './afyalink';
import {
  checkKenyaShrBundle,
  getKenyaShrPatientRecords,
  requestKenyaShrConsent,
  submitKenyaShrBundle,
} from './hie-shr';

jest.mock('node-fetch');

const Base = 'https://hie.example/api/v1';
const credentials: KenyaAfyaLinkCredentials = { baseUrl: Base, clientId: 'id', clientSecret: 'secret' };
const mockFetch = fetch as unknown as jest.Mock;

function mockHie(body: unknown): void {
  const res = (b: unknown): Record<string, unknown> => ({ ok: true, status: 200, text: async () => JSON.stringify(b) });
  mockFetch.mockResolvedValueOnce(res({ access_token: 'jwt', expires_in: 3600 })).mockResolvedValueOnce(res(body));
}

const last = (): { url: string; headers: Record<string, string>; body: unknown } => {
  const [url, init] = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
  return { url, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined };
};

const bundle = {
  resourceType: 'Bundle',
  id: 'b1',
  type: 'collection',
  entry: [
    { resource: { resourceType: 'EpisodeOfCare', id: 'eoc1' } },
    { resource: { resourceType: 'Encounter', id: 'e1', episodeOfCare: [{ reference: 'EpisodeOfCare/eoc1' }] } },
    { resource: { resourceType: 'Condition', id: 'c1', encounter: { reference: 'Encounter/e1' } } },
    { resource: { resourceType: 'MedicationDispense', id: 'd1', context: { reference: 'Encounter/e1' } } },
  ],
};

describe('Kenya SHR (DHA SHR API reference)', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  test('emergency and dependant consent bodies', async () => {
    mockHie({ consent_id: 'VCR-1', visit_id: 'v1', consent_token: 'tok' });
    const c = await requestKenyaShrConsent(credentials, {
      crId: 'CR1',
      facilityFrCode: 'FID-1',
      requestedBy: 'Nurse',
      visitType: 'OP',
      emergency: { incapacityReason: 'Unconscious' },
    });
    expect(c).toMatchObject({ consentId: 'VCR-1', visitId: 'v1', consentToken: 'tok' });
    expect(last().body).toEqual({
      cr_id: 'CR1',
      facility_id: 'FID-1',
      requested_by: 'Nurse',
      visit_type: 'OP',
      emergency: 1,
      incapacity_reason: 'Unconscious',
    });
    mockHie({ consent_id: 'VCR-2', otp_record: 'r1' });
    await requestKenyaShrConsent(credentials, {
      crId: 'CR1',
      facilityFrCode: 'FID-1',
      requestedBy: 'Nurse',
      visitType: 'IP',
      representative: { crId: 'CR2', relationship: 'Healthcare Proxy', incapacityReason: 'Coma' },
    });
    expect(last().body).toMatchObject({ representative_cr_id: 'CR2', patient_capable: 0, incapacity_reason: 'Coma' });
  });

  test('bundle rules DHA states', () => {
    expect(checkKenyaShrBundle(bundle)).toEqual([]);
    const bad = {
      ...bundle,
      id: undefined,
      entry: [
        ...bundle.entry,
        { resource: { resourceType: 'Patient', id: 'p' } },
        { resource: { resourceType: 'Observation' } },
      ],
    };
    const problems = checkKenyaShrBundle(bad);
    expect(problems).toContain('the bundle needs an id (DHA echoes it as mediator_id)');
    expect(problems).toContain('Patient is not a resource type the SHR accepts');
    expect(problems).toContain('a Observation has no id');
  });

  test('writes with X-Consent-Token and reads with it', async () => {
    mockHie({ mediator_id: 'b1', message: 'Bundle submitted successfully' });
    await expect(submitKenyaShrBundle(credentials, 'tok', bundle)).resolves.toEqual({
      mediatorId: 'b1',
      message: 'Bundle submitted successfully',
    });
    expect(last().headers['X-Consent-Token']).toBe('tok');
    mockHie({});
    await getKenyaShrPatientRecords(credentials, 'tok', {
      crId: 'CR1',
      practitionerId: 'PUID-1',
      resources: ['Condition'],
    });
    expect(last().url).toBe(`${Base}/shr/patient-records?cr_id=CR1&practitioner_id=PUID-1&resources=Condition`);
    await expect(
      getKenyaShrPatientRecords(credentials, 'tok', { crId: 'CR1', practitionerId: 'P', resources: ['Patient'] })
    ).rejects.toThrow('does not hold Patient');
  });
});
