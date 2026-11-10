// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Organization, Project } from '@medplum/fhirtypes';
import fetch from 'node-fetch';
import { clearKenyaHieTokenCache } from './afyalink';
import { verifyKenyaFacilityAuthority } from './verify-facility-authority';

jest.mock('node-fetch');

// A Facility Registry record as GET /facilities/search returns it (trimmed).
const licensedFacility = {
  frCode: 'FID-47-105963-0',
  officialName: 'Afiax Clinic',
  registrationNumber: '017207',
  facilityLicenseStatus: 'LICENSED',
  facilityLicenseEndDate: '2026-12-31T00:00:00+03:00',
  regulatoryOperationalStatus: { operationalStatus: 'ACTIVE' },
};

describe('verifyKenyaFacilityAuthority', () => {
  function buildInput(
    organization: Organization,
    project?: Project
  ): Parameters<typeof verifyKenyaFacilityAuthority>[0] {
    return {
      correlationId: 'corr-1',
      organization: {
        ...organization,
        id: organization.id ?? 'org-1',
      },
      ctx: {
        project:
          project ??
          ({
            resourceType: 'Project',
            id: 'project-1',
            setting: [{ name: 'countryPack', valueString: 'kenya' }],
          } as Project),
        systemRepo: {
          readResource: jest.fn(
            async () =>
              ({
                resourceType: 'Project',
                id: 'project-1',
                setting: [{ name: 'countryPack', valueString: 'kenya' }],
                secret: [
                  { name: 'kenyaHieBaseUrl', valueString: 'https://hie.example.com/api/v1' },
                  { name: 'kenyaHieClientId', valueString: 'client-id' },
                  { name: 'kenyaHieClientSecret', valueString: 'client-secret' },
                ],
              }) as Project
          ),
        },
      } as any,
    };
  }

  beforeEach(() => {
    (fetch as unknown as jest.Mock).mockReset();
    clearKenyaHieTokenCache();
  });

  test('returns verified when facility authority identifier is present', async () => {
    (fetch as unknown as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => JSON.stringify({ access_token: 'jwt-token', expires_in: 3600 })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => JSON.stringify([licensedFacility])),
      });

    await expect(
      verifyKenyaFacilityAuthority(
        buildInput({
          resourceType: 'Organization',
          name: 'Afiax Clinic',
          active: true,
          identifier: [{ system: 'https://afiax.africa/kenya/identifier/mfl-code', value: '12345' }],
        })
      )
    ).resolves.toMatchObject({
      status: 'verified',
      facilityAuthorityIdentifier: '12345',
      registryFound: true,
      // The registry's date-time in Kenya time becomes the calendar date (stored as a FHIR date)
      currentLicenseExpiryDate: '2026-12-31',
      nextState: 'ready-for-registry-check',
    });
  });

  test('returns unverified when facility authority identifier is missing', async () => {
    await expect(
      verifyKenyaFacilityAuthority(
        buildInput({
          resourceType: 'Organization',
          name: 'Afiax Clinic',
          active: true,
        })
      )
    ).resolves.toMatchObject({
      status: 'unverified',
      nextState: 'capture-facility-authority-id',
    });
  });

  test('returns inactive when the organization is inactive', async () => {
    (fetch as unknown as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => JSON.stringify({ access_token: 'jwt-token', expires_in: 3600 })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => JSON.stringify([licensedFacility])),
      });

    await expect(
      verifyKenyaFacilityAuthority(
        buildInput({
          resourceType: 'Organization',
          name: 'Afiax Clinic',
          active: false,
          identifier: [{ system: 'https://afiax.africa/kenya/identifier/mfl-code', value: '12345' }],
        })
      )
    ).resolves.toMatchObject({
      status: 'inactive',
      nextState: 'reactivate-or-correct-facility',
    });
  });

  test('returns unverified when the facility licence is not active', async () => {
    (fetch as unknown as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => JSON.stringify({ access_token: 'jwt-token', expires_in: 3600 })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => JSON.stringify([{ ...licensedFacility, facilityLicenseStatus: 'EXPIRED' }])),
      });

    await expect(
      verifyKenyaFacilityAuthority(
        buildInput({
          resourceType: 'Organization',
          name: 'Afiax Clinic',
          active: true,
          identifier: [{ system: 'https://afiax.africa/kenya/identifier/mfl-code', value: '12345' }],
        })
      )
    ).resolves.toMatchObject({
      status: 'unverified',
      facilityAuthorityIdentifier: '12345',
      registryFound: true,
      facilityApprovalStatus: 'not approved',
      nextState: 'review-facility-approval-status',
    });
  });

  test('returns unverified when AfyaLink facility is not found', async () => {
    (fetch as unknown as jest.Mock)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => JSON.stringify({ access_token: 'jwt-token', expires_in: 3600 })),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: jest.fn(async () => '[]'),
      });

    await expect(
      verifyKenyaFacilityAuthority(
        buildInput({
          resourceType: 'Organization',
          name: 'Afiax Clinic',
          active: true,
          identifier: [{ system: 'https://afiax.africa/kenya/identifier/mfl-code', value: '12345' }],
        })
      )
    ).resolves.toMatchObject({
      status: 'unverified',
      registryFound: false,
      nextState: 'review-facility-authority-id',
    });
  });
});
