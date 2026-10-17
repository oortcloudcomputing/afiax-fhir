// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Claim, ClaimResponse, Task } from '@medplum/fhirtypes';
import { handleKenyaShaCallback } from './sha-callback-handler';
import { KenyaShaBundleIdIdentifierSystem } from './sha';
import { getKenyaShaClaimsToken } from './sha';

jest.mock('../../fhir/repo', () => ({
  getGlobalSystemRepo: jest.fn(),
  getProjectSystemRepo: jest.fn(),
}));

jest.mock('./sync-to-erpnext', () => ({
  syncErpNextShaPayment: jest.fn().mockResolvedValue(undefined),
  syncErpNextInvoice: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../logger', () => ({
  globalLogger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const { getGlobalSystemRepo, getProjectSystemRepo } = jest.requireMock('../../fhir/repo') as {
  getGlobalSystemRepo: jest.Mock;
  getProjectSystemRepo: jest.Mock;
};

const PROJECT_ID = 'project-sha-1';
const BUNDLE_ID = 'sha-bundle-uuid-001';
const SECRET_KEY = 'test-sha-secret-key';

const baseProject = {
  resourceType: 'Project',
  id: PROJECT_ID,
  secret: [
    { name: 'kenyaShaClaimsAccessKey', valueString: 'ak' },
    { name: 'kenyaShaClaimsSecretKey', valueString: SECRET_KEY },
  ],
};

const baseClaim: Claim & { id: string } = {
  resourceType: 'Claim',
  id: 'claim-sha-001',
  status: 'active',
  type: { text: 'Institutional' },
  use: 'claim',
  patient: { reference: 'Patient/p1' },
  created: '2026-06-20',
  provider: { reference: 'Organization/org-1' },
  insurer: { reference: 'Organization/sha' },
  priority: { text: 'normal' },
  insurance: [{ sequence: 1, focal: true, coverage: { reference: 'Coverage/cov-1' } }],
  identifier: [{ system: KenyaShaBundleIdIdentifierSystem, value: BUNDLE_ID }],
};

function makeSystemRepo(claim: Claim | undefined, existingClaimResponse: ClaimResponse | undefined = undefined) {
  return {
    readResource: jest.fn(async () => baseProject),
    searchOne: jest.fn(async ({ resourceType }: { resourceType: string }) => {
      if (resourceType === 'Claim') return claim;
      if (resourceType === 'ClaimResponse') return existingClaimResponse;
      return undefined;
    }),
    search: jest.fn(async () => ({
      resourceType: 'Bundle',
      entry: [],
    })),
    createResource: jest.fn(async (r: unknown) => ({ ...(r as object), id: 'cr-1' })),
    updateResource: jest.fn(async (r: unknown) => r),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('handleKenyaShaCallback', () => {
  test('creates ClaimResponse and returns adjudicated on Payment Approved callback', async () => {
    const systemRepo = makeSystemRepo(baseClaim);
    getGlobalSystemRepo.mockReturnValue(systemRepo);
    getProjectSystemRepo.mockResolvedValue(systemRepo);

    const result = await handleKenyaShaCallback(
      PROJECT_ID,
      { bundleId: BUNDLE_ID, claim_state: 'Payment Approved', message: 'Claim ready for payment' },
      undefined
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('adjudicated');
    expect(result.bundleId).toBe(BUNDLE_ID);
    expect(result.claimState).toBe('Payment Approved');
    expect(result.claimId).toBe('claim-sha-001');
    expect(result.claimResponseId).toBe('cr-1');
    expect(systemRepo.createResource).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'ClaimResponse',
        request: { reference: 'Claim/claim-sha-001' },
        preAuthRef: BUNDLE_ID,
      })
    );
  });

  test('returns rejected status on rejection callback', async () => {
    const systemRepo = makeSystemRepo(baseClaim);
    getGlobalSystemRepo.mockReturnValue(systemRepo);
    getProjectSystemRepo.mockResolvedValue(systemRepo);

    const result = await handleKenyaShaCallback(
      PROJECT_ID,
      { bundleId: BUNDLE_ID, claim_state: 'Rejected', message: 'Claim rejected by SHA' },
      undefined
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('rejected');
  });

  test('returns in-review status on review callback', async () => {
    const systemRepo = makeSystemRepo(baseClaim);
    getGlobalSystemRepo.mockReturnValue(systemRepo);
    getProjectSystemRepo.mockResolvedValue(systemRepo);

    const result = await handleKenyaShaCallback(
      PROJECT_ID,
      { bundleId: BUNDLE_ID, claim_state: 'Under Review' },
      undefined
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('in-review');
  });

  test('returns ignored when bundleId is missing from callback', async () => {
    const systemRepo = makeSystemRepo(baseClaim);
    getGlobalSystemRepo.mockReturnValue(systemRepo);
    getProjectSystemRepo.mockResolvedValue(systemRepo);

    const result = await handleKenyaShaCallback(PROJECT_ID, { claim_state: 'Approved' }, undefined);

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ignored');
  });

  test('returns ignored when no Claim matches the bundleId', async () => {
    const systemRepo = makeSystemRepo(undefined);
    getGlobalSystemRepo.mockReturnValue(systemRepo);
    getProjectSystemRepo.mockResolvedValue(systemRepo);

    const result = await handleKenyaShaCallback(
      PROJECT_ID,
      { bundleId: 'unknown-bundle-id', claim_state: 'Approved' },
      undefined
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('ignored');
    expect(result.message).toContain('unknown-bundle-id');
  });

  test('returns ignored on empty or non-object body', async () => {
    const systemRepo = makeSystemRepo(undefined);
    getGlobalSystemRepo.mockReturnValue(systemRepo);

    const result = await handleKenyaShaCallback(PROJECT_ID, null, undefined);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('ignored');
  });

  test('returns error when project does not exist', async () => {
    const globalRepo = {
      readResource: jest.fn(async () => {
        throw new Error('Not found');
      }),
    };
    getGlobalSystemRepo.mockReturnValue(globalRepo);

    const result = await handleKenyaShaCallback('nonexistent-project', { bundleId: BUNDLE_ID }, undefined);

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.message).toContain('nonexistent-project');
  });

  test('rejects invalid JWT when secretKey is configured', async () => {
    const systemRepo = makeSystemRepo(baseClaim);
    getGlobalSystemRepo.mockReturnValue(systemRepo);

    const result = await handleKenyaShaCallback(
      PROJECT_ID,
      { bundleId: BUNDLE_ID, claim_state: 'Approved' },
      'Bearer invalid.jwt.token'
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('error');
    expect(result.message).toContain('Invalid SHA callback JWT');
  });

  test('accepts a valid JWT signed with the project secretKey', async () => {
    const systemRepo = makeSystemRepo(baseClaim);
    getGlobalSystemRepo.mockReturnValue(systemRepo);
    getProjectSystemRepo.mockResolvedValue(systemRepo);

    const validToken = await getKenyaShaClaimsToken({ baseUrl: '', accessKey: 'ak', secretKey: SECRET_KEY });

    const result = await handleKenyaShaCallback(
      PROJECT_ID,
      { bundleId: BUNDLE_ID, claim_state: 'Payment Approved' },
      `Bearer ${validToken}`
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('adjudicated');
  });

  test('updates open Tasks linked to the Claim', async () => {
    const openTask: Task & { id: string } = {
      resourceType: 'Task',
      id: 'task-sha-1',
      status: 'requested',
      intent: 'order',
      focus: { reference: 'Claim/claim-sha-001' },
    };

    const systemRepo = {
      ...makeSystemRepo(baseClaim),
      search: jest.fn(async ({ resourceType }: { resourceType: string }) => {
        if (resourceType === 'Task') {
          return { resourceType: 'Bundle', entry: [{ resource: openTask }] };
        }
        return { resourceType: 'Bundle', entry: [] };
      }),
    };
    getGlobalSystemRepo.mockReturnValue(systemRepo);
    getProjectSystemRepo.mockResolvedValue(systemRepo);

    await handleKenyaShaCallback(
      PROJECT_ID,
      { bundleId: BUNDLE_ID, claim_state: 'Payment Approved' },
      undefined
    );

    expect(systemRepo.updateResource).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceType: 'Task',
        id: 'task-sha-1',
        status: 'completed',
        businessStatus: { text: 'adjudicated' },
      })
    );
  });

  test('handles FHIR ClaimResponse at root of callback body, using FHIR outcome for status', async () => {
    const systemRepo = makeSystemRepo(baseClaim);
    getGlobalSystemRepo.mockReturnValue(systemRepo);
    getProjectSystemRepo.mockResolvedValue(systemRepo);

    // SHA sends a bare ClaimResponse; bundleId arrives via the claim_id field (not the FHIR .status).
    const result = await handleKenyaShaCallback(
      PROJECT_ID,
      {
        resourceType: 'ClaimResponse',
        claim_id: BUNDLE_ID,
        status: 'active',
        type: { text: 'Institutional' },
        use: 'claim',
        patient: { reference: 'Patient/p1' },
        created: '2026-06-20',
        insurer: { reference: 'Organization/sha' },
        outcome: 'complete',
        disposition: 'Approved for payment',
      },
      undefined
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('adjudicated');
  });
});
