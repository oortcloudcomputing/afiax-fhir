// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import {
  clearKenyaHieTokenCache,
  getAfyaLinkToken,
  getKenyaAfyaLinkCredentials,
  KenyaAfyaLinkSecretNames,
  KenyaHieSecretNames,
  publishToAfyaLinkShr,
  searchAfyaLinkClientRegistry,
  searchAfyaLinkEligibility,
  searchAfyaLinkFacility,
  searchAfyaLinkPractitioner,
} from './afyalink';

jest.mock('node-fetch');

const UatBase = 'https://ilm-dev.dha.go.ke/uat-middleware/api/v1';

function jsonResponse(status: number, body: unknown): Record<string, unknown> {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

function tokenResponse(token = 'access-token', expiresIn = 3600): Record<string, unknown> {
  return jsonResponse(200, { access_token: token, expires_in: expiresIn, token_type: 'Bearer' });
}

const mockFetch = fetch as unknown as jest.Mock;

describe('Kenya HIE connector', () => {
  const project: Project = {
    resourceType: 'Project',
    id: 'project-1',
    secret: [
      { name: KenyaHieSecretNames.clientId, valueString: 'client-id' },
      { name: KenyaHieSecretNames.clientSecret, valueString: 'client-secret' },
    ],
  };
  const credentials = getKenyaAfyaLinkCredentials(project);

  beforeEach(() => {
    mockFetch.mockReset();
    clearKenyaHieTokenCache();
  });

  describe('credentials', () => {
    test('loads tenant-managed client credentials with the UAT middleware base URL', () => {
      expect(credentials).toEqual({ baseUrl: UatBase, clientId: 'client-id', clientSecret: 'client-secret' });
    });

    test('falls back to the earlier secret names', () => {
      expect(
        getKenyaAfyaLinkCredentials({
          resourceType: 'Project',
          secret: [
            { name: KenyaAfyaLinkSecretNames.baseUrl, valueString: 'https://uat.dha.go.ke' },
            { name: KenyaAfyaLinkSecretNames.consumerKey, valueString: 'legacy-id' },
            { name: KenyaAfyaLinkSecretNames.username, valueString: 'someone@example.com' },
            { name: KenyaAfyaLinkSecretNames.password, valueString: 'legacy-secret' },
          ],
        })
      ).toEqual({ baseUrl: UatBase, clientId: 'legacy-id', clientSecret: 'legacy-secret' });
    });

    test('loads Afiax-managed credentials from system secrets only', () => {
      expect(
        getKenyaAfyaLinkCredentials({
          ...project,
          setting: [{ name: 'kenyaHieCredentialMode', valueString: 'afiax-managed' }],
          systemSecret: [
            { name: KenyaHieSecretNames.clientId, valueString: 'platform-id' },
            { name: KenyaHieSecretNames.clientSecret, valueString: 'platform-secret' },
            { name: KenyaHieSecretNames.facilityId, valueString: 'FID-47-105963-0' },
          ],
        })
      ).toEqual({
        baseUrl: UatBase,
        clientId: 'platform-id',
        clientSecret: 'platform-secret',
        facilityId: 'FID-47-105963-0',
      });
    });

    test('requires an explicit production base URL', () => {
      expect(() =>
        getKenyaAfyaLinkCredentials({
          ...project,
          setting: [{ name: 'kenyaHieEnvironment', valueString: 'production' }],
        })
      ).toThrow('Missing required Kenya HIE production base URL');
    });

    test('reports the missing secret by its current name', () => {
      expect(() => getKenyaAfyaLinkCredentials({ resourceType: 'Project', secret: [] })).toThrow(
        'Missing required Kenya HIE secret: kenyaHieClientId'
      );
    });
  });

  describe('token', () => {
    test('posts the client credentials as a form', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse('jwt-1'));

      await expect(getAfyaLinkToken(credentials)).resolves.toBe('jwt-1');
      expect(mockFetch).toHaveBeenCalledWith(`${UatBase}/tenants/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: 'client_id=client-id&client_secret=client-secret',
      });
    });

    test('reuses a cached token until it is about to expire', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse('jwt-1'));

      await getAfyaLinkToken(credentials);
      await expect(getAfyaLinkToken(credentials)).resolves.toBe('jwt-1');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    test('authenticates again when asked to refresh', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse('jwt-1')).mockResolvedValueOnce(tokenResponse('jwt-2'));

      await getAfyaLinkToken(credentials);
      await expect(getAfyaLinkToken(credentials, { forceRefresh: true })).resolves.toBe('jwt-2');
    });

    test('does not cache a token that expires within a minute', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse('jwt-1', 30)).mockResolvedValueOnce(tokenResponse('jwt-2', 30));

      await getAfyaLinkToken(credentials);
      await expect(getAfyaLinkToken(credentials)).resolves.toBe('jwt-2');
    });

    test('reports authentication failures with the DHA message', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(401, { message: 'invalid client' }));

      await expect(getAfyaLinkToken(credentials)).rejects.toThrow(
        'Kenya HIE authentication failed (401): {"message":"invalid client"}'
      );
    });

    test('rejects a response without an access token', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse(200, { token_type: 'Bearer' }));

      await expect(getAfyaLinkToken(credentials)).rejects.toThrow('did not include an access_token');
    });
  });

  describe('facility registry', () => {
    const facility = {
      uuid: 'f-uuid',
      frCode: 'FID-47-105963-0',
      fidCode: '105963',
      officialName: 'Test Facility',
      registrationNumber: '017207',
      regulatoryBody: 'kmpdc',
      facilityLicenseStatus: 'LICENSED',
      facilityLicenseEndDate: '2026-12-31T00:00:00+03:00',
      kephLevel: 'LEVEL 4B',
      facilityType: 'SPECIALIZED TREATMENT CENTRE (LEVEL 4B)',
      facilityOwnership: 'Private',
      address: { county: 'NAIROBI', subCounty: 'DAGORETTI NORTH' },
      regulatoryOperationalStatus: { operationalStatus: 'ACTIVE' },
      SHAOperationStatus: { operationalStatus: 'ACTIVE' },
    };

    test('searches by FR code and normalizes the record', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse(200, [facility]));

      const result = await searchAfyaLinkFacility(credentials, 'FID-47-105963-0');

      expect(mockFetch).toHaveBeenLastCalledWith(
        `${UatBase}/facilities/search?identifier=FID-47-105963-0&identifier-type=fr-code`,
        { method: 'GET', headers: { Authorization: 'Bearer access-token', Accept: 'application/json' } }
      );
      expect(result.message).toMatchObject({
        found: 1,
        facility_code: 'FID-47-105963-0',
        fr_code: 'FID-47-105963-0',
        facility_name: 'Test Facility',
        registration_number: '017207',
        regulator: 'kmpdc',
        approved: 'true',
        license_status: 'LICENSED',
        facility_level: 'LEVEL 4B',
        county: 'NAIROBI',
        sub_county: 'DAGORETTI NORTH',
        operational_status: 'ACTIVE',
        sha_operational_status: 'ACTIVE',
        current_license_expiry_date: '2026-12-31T00:00:00+03:00',
      });
    });

    test('searches a KMHFL code as mfl and sends the facility headers when configured', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse(200, [facility]));

      await searchAfyaLinkFacility({ ...credentials, facilityId: 'FID-1' }, '12345');

      expect(mockFetch).toHaveBeenLastCalledWith(`${UatBase}/facilities/search?identifier=12345&identifier-type=mfl`, {
        method: 'GET',
        headers: {
          Authorization: 'Bearer access-token',
          Accept: 'application/json',
          'X-Facility-Id': 'FID-1',
          'X-Facility-Id-Type': 'fr-code',
        },
      });
    });

    test('reports an unlicensed facility as not approved', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse(200, [{ ...facility, facilityLicenseStatus: 'EXPIRED' }]));

      const result = await searchAfyaLinkFacility(credentials, 'FID-47-105963-0');
      expect(result.message).toMatchObject({ approved: 'not approved', license_status: 'EXPIRED' });
    });

    test('treats an empty result as not found', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse(200, []));

      const result = await searchAfyaLinkFacility(credentials, 'FID-0');
      expect(result.message).toEqual({ facility_code: 'FID-0', found: 0 });
    });

    test('throws on other errors with the DHA trace ID', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse(500, { message: 'upstream down', trace_id: 't-1' }));

      await expect(searchAfyaLinkFacility(credentials, 'FID-0')).rejects.toThrow(
        'Kenya HIE facility search failed (500): upstream down (trace t-1)'
      );
    });
  });

  describe('health worker registry', () => {
    const practitioner = {
      message: {
        identifiers: { client_registry_id: 'CR-1' },
        licenses: [{ license_end: '2025-12-31' }, { license_end: '2026-12-31' }],
        membership: {
          registration_id: 'A1234',
          full_name: 'Jane Doe',
          licensing_body: 'KMPDC',
          is_active: 1,
        },
      },
    };

    test('searches a KMPDC licence by registration number', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse(200, practitioner));

      const result = await searchAfyaLinkPractitioner(credentials, 'KMPDC', 'A1234');

      expect(mockFetch).toHaveBeenLastCalledWith(
        `${UatBase}/professionals?identification_number=A1234&identification_type=registration_number&regulator=KMPDC`,
        expect.anything()
      );
      expect(result.message).toEqual({
        found: 1,
        registration_number: 'A1234',
        is_active: true,
        full_name: 'Jane Doe',
        licensing_body: 'KMPDC',
        client_registry_id: 'CR-1',
        license_end: '2026-12-31',
      });
    });

    test('searches PPB pharmacists by National ID', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(jsonResponse(200, practitioner));

      await searchAfyaLinkPractitioner(credentials, 'PPB', '12345678');

      expect(mockFetch).toHaveBeenLastCalledWith(
        `${UatBase}/professionals?identification_number=12345678&identification_type=National+ID&regulator=PPB`,
        expect.anything()
      );
    });

    test('treats DHA "no practitioner membership" as not found', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
        jsonResponse(400, {
          error: 'Bad Request',
          message: 'failed to fetch practitioner: no practitioner membership returned from health worker registry',
        })
      );

      const result = await searchAfyaLinkPractitioner(credentials, 'COC', '999');
      expect(result.message).toEqual({ found: 0, registration_number: null, is_active: null });
    });

    test('rejects identification types the registry does not support', async () => {
      await expect(searchAfyaLinkPractitioner(credentials, 'PASSPORT', 'X1')).rejects.toThrow(
        'Unsupported practitioner identification type'
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('eligibility', () => {
    test('reports an active SHA scheme as eligible', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
        jsonResponse(200, {
          requestIdNumber: '12345678',
          fullName: 'Jane Doe',
          memberCrNumber: 'CR-1',
          isAlive: true,
          whitelistedForOTP: false,
          facilityBiometricsEnforced: true,
          statusCode: '00',
          statusDesc: 'Member found',
          hash: 'h-1',
          schemes: [
            {
              schemeId: 1,
              schemeName: 'SHIF',
              memberType: 'PRINCIPAL',
              coverage: { status: 'ACTIVE', startDate: '2026-01-01', endDate: '2026-12-31' },
            },
          ],
        })
      );

      const result = await searchAfyaLinkEligibility(credentials, 'National ID', '12345678');

      expect(mockFetch).toHaveBeenLastCalledWith(
        `${UatBase}/patients/eligibility?identification_number=12345678&identification_type=National+ID`,
        expect.anything()
      );
      expect(result.message).toMatchObject({
        id: 'h-1',
        eligible: 1,
        full_name: 'Jane Doe',
        coverageEndDate: '2026-12-31',
        transition_status: 'ACTIVE',
        member_cr_number: 'CR-1',
        is_alive: true,
        whitelisted_for_otp: false,
        facility_biometrics_enforced: true,
      });
      expect(result.message?.schemes).toHaveLength(1);
    });

    test('reports a member with no schemes as ineligible with the DHA status', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          jsonResponse(200, {
            requestIdNumber: '33333333',
            isAlive: true,
            statusCode: '00',
            statusDesc: 'Member Not found!',
          })
        );

      const result = await searchAfyaLinkEligibility(credentials, 'CR ID', 'CR-9');

      expect(mockFetch).toHaveBeenLastCalledWith(
        `${UatBase}/patients/eligibility?identification_number=CR-9&identification_type=ClientRegistry+ID`,
        expect.anything()
      );
      expect(result.message).toMatchObject({ eligible: 0, reason: 'Member Not found!', message: 'Member Not found!' });
    });

    test('never reports a deceased patient as eligible', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(
          jsonResponse(200, { isAlive: false, schemes: [{ schemeName: 'SHIF', coverage: { status: 'ACTIVE' } }] })
        );

      const result = await searchAfyaLinkEligibility(credentials, 'National ID', '1');
      expect(result.message?.eligible).toBe(0);
    });
  });

  describe('client registry', () => {
    test('looks up a patient and returns the CR ID', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
        jsonResponse(200, {
          id: 'CR9795515286992-5',
          first_name: 'Jane',
          middle_name: 'W',
          last_name: 'Doe',
          date_of_birth: '1992-04-01',
          gender: 'female',
          identification_type: 'National ID',
          identification_number: '12345678',
        })
      );

      const result = await searchAfyaLinkClientRegistry(credentials, 'National ID', '12345678');

      expect(mockFetch).toHaveBeenLastCalledWith(
        `${UatBase}/patients?identification_number=12345678&identification_type=National+ID`,
        expect.anything()
      );
      expect(result.message).toMatchObject({
        found: 1,
        client_registry_id: 'CR9795515286992-5',
        full_name: 'Jane W Doe',
        date_of_birth: '1992-04-01',
        gender: 'female',
      });
    });

    test('treats DHA "zero results" as not found', async () => {
      mockFetch.mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(
        jsonResponse(400, {
          error: 'Bad Request',
          message: 'failed to get patient record: zero results found in client registry fetch patient search response',
        })
      );

      const result = await searchAfyaLinkClientRegistry(credentials, 'National ID', '33333333');
      expect(result.message).toEqual({
        found: 0,
        identification_type: 'National ID',
        identification_number: '33333333',
      });
    });

    test('throws on validation errors', async () => {
      mockFetch
        .mockResolvedValueOnce(tokenResponse())
        .mockResolvedValueOnce(jsonResponse(400, { message: 'invalid identification_type' }));

      await expect(searchAfyaLinkClientRegistry(credentials, 'Passport', 'X')).rejects.toThrow(
        'Kenya HIE client registry lookup failed (400): invalid identification_type'
      );
    });
  });

  test('Shared Health Record publication fails clearly until the consent flow exists', async () => {
    await expect(publishToAfyaLinkShr(credentials, {})).rejects.toThrow('requires patient consent and an open visit');
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
