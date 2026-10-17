// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { createReference, normalizeErrorString, Operator } from '@medplum/core';
import { syncErpNextShaPayment } from './sync-to-erpnext';
import { checkKenyaShaClaimStatus, getKenyaShaClaimsCredentials, KenyaShaBundleIdIdentifierSystem } from './sha';
import type { Bundle, Claim, ClaimResponse, Identifier, Task } from '@medplum/fhirtypes';
import { jwtVerify } from 'jose';
import type { Project } from '@medplum/fhirtypes';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../../fhir/repo';
import { globalLogger } from '../../logger';

const KenyaShaClaimResponseIdentifierSystem = 'https://afiax.africa/kenya/identifier/sha-claim-id';

interface ShaCallbackPayload {
  readonly bundleId?: string;
  readonly claim_id?: string;
  readonly claimId?: string;
  readonly claimState?: string;
  readonly claim_state?: string;
  readonly status?: string;
  readonly message?: string;
  readonly claimResponse?: ClaimResponse;
  readonly resourceType?: string;
  readonly entry?: Array<{ resource?: unknown }>;
  readonly [key: string]: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function extractBundleId(body: ShaCallbackPayload): string | undefined {
  return (
    body.bundleId?.toString().trim() ||
    body.claim_id?.toString().trim() ||
    body.claimId?.toString().trim() ||
    undefined
  );
}

function extractClaimState(body: ShaCallbackPayload): string | undefined {
  return (
    body.claimState?.toString().trim() ||
    body.claim_state?.toString().trim() ||
    body.status?.toString().trim() ||
    undefined
  );
}

function extractClaimResponse(body: ShaCallbackPayload): ClaimResponse | undefined {
  // FHIR ClaimResponse at root
  if (body.resourceType === 'ClaimResponse') {
    return body as unknown as ClaimResponse;
  }

  // FHIR Bundle containing a ClaimResponse
  if (body.resourceType === 'Bundle' && Array.isArray(body.entry)) {
    for (const entry of body.entry) {
      if (isRecord(entry) && isRecord(entry.resource) && entry.resource.resourceType === 'ClaimResponse') {
        return entry.resource as unknown as ClaimResponse;
      }
    }
  }

  // Nested claimResponse field
  if (isRecord(body.claimResponse) && body.claimResponse.resourceType === 'ClaimResponse') {
    return body.claimResponse as unknown as ClaimResponse;
  }

  return undefined;
}

function normalizeCallbackStatus(
  state: string | undefined,
  fhirOutcome?: string
): 'queued' | 'in-review' | 'adjudicated' | 'rejected' {
  if (fhirOutcome === 'complete') return 'adjudicated';
  if (fhirOutcome === 'error') return 'rejected';
  if (fhirOutcome === 'partial') return 'in-review';
  const s = state?.trim().toLowerCase() ?? '';
  if (s.includes('reject') || s.includes('declin') || s.includes('denied')) return 'rejected';
  if (s.includes('review') || s.includes('surveillance') || s.includes('appeal')) return 'in-review';
  if (s.includes('approved') || s.includes('payment') || s.includes('complete')) return 'adjudicated';
  return 'queued';
}

function mergeIdentifier(identifiers: Identifier[] | undefined, claimId: string): Identifier[] {
  const others = (identifiers ?? []).filter((id) => id.system !== KenyaShaClaimResponseIdentifierSystem);
  return [...others, { system: KenyaShaClaimResponseIdentifierSystem, value: claimId }];
}

async function verifyCallbackJwt(authHeader: string | undefined, secretKey: string): Promise<boolean> {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secretKey), { algorithms: ['HS256'] });
    return true;
  } catch {
    return false;
  }
}

export interface ShaCallbackResult {
  readonly ok: boolean;
  readonly projectId: string;
  readonly bundleId?: string;
  readonly claimId?: string;
  readonly claimState?: string;
  readonly status: 'queued' | 'in-review' | 'adjudicated' | 'rejected' | 'error' | 'ignored';
  readonly message: string;
  readonly claimResponseId?: string;
}

/**
 * Handles an SHA claim status callback.
 *
 * The endpoint is public. A callback with a valid HS256 JWT (signed with `kenyaShaClaimsSecretKey`) is
 * applied as sent. An unsigned callback is treated only as a notification: the claim status is pulled
 * from the SHA claim-status API and that response is applied instead of the callback body.
 * @param projectId - The project the callback URL was issued for.
 * @param body - The raw callback body.
 * @param authHeader - The Authorization header, if any.
 * @returns The outcome of processing the callback.
 */
export async function handleKenyaShaCallback(
  projectId: string,
  body: unknown,
  authHeader: string | undefined
): Promise<ShaCallbackResult> {
  const globalSystemRepo = getGlobalSystemRepo();

  // Load the project to get SHA credentials
  let project: Project;
  try {
    project = await globalSystemRepo.readResource<Project>('Project', projectId);
  } catch {
    return { ok: false, projectId, status: 'error', message: `Project ${projectId} not found` };
  }

  const getSecret = (name: string): string | undefined =>
    (project.secret?.find((s) => s.name === name)?.valueString ||
      project.systemSecret?.find((s) => s.name === name)?.valueString ||
      undefined);

  const secretKey = getSecret('kenyaShaClaimsSecretKey');

  // A presented JWT must verify. Unsigned callbacks are allowed but are not trusted (see below).
  let signedCallback = false;
  if (authHeader?.startsWith('Bearer ')) {
    if (!secretKey || !(await verifyCallbackJwt(authHeader, secretKey))) {
      globalLogger.warn('Kenya SHA callback JWT verification failed', { projectId });
      return { ok: false, projectId, status: 'error', message: 'Invalid SHA callback JWT signature' };
    }
    signedCallback = true;
  }

  if (!isRecord(body)) {
    return { ok: false, projectId, status: 'ignored', message: 'Empty or non-JSON callback body — ignoring' };
  }

  const payload = body as ShaCallbackPayload;
  const bundleId = extractBundleId(payload);
  let claimState = extractClaimState(payload);
  let remoteClaimResponse = extractClaimResponse(payload);
  let callbackMessage =
    typeof payload.message === 'string' ? payload.message : `SHA callback: ${claimState ?? 'status update'}`;

  if (!bundleId) {
    return { ok: true, projectId, status: 'ignored', message: 'No claim/bundle ID in callback payload — nothing to update' };
  }

  try {
    const systemRepo = await getProjectSystemRepo(projectId);

    // Find the Claim by the indexed SHA bundle ID identifier stamped at submission time.
    const targetClaim = await systemRepo.searchOne<Claim>({
      resourceType: 'Claim',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: projectId },
        { code: 'identifier', operator: Operator.EXACT, value: `${KenyaShaBundleIdIdentifierSystem}|${bundleId}` },
      ],
    });

    if (!targetClaim?.id) {
      return {
        ok: true,
        projectId,
        bundleId,
        claimState,
        status: 'ignored',
        message: `No Claim found with bundle ID ${bundleId} — callback acknowledged but not applied`,
      };
    }

    if (!signedCallback) {
      // Unsigned callback: use it only as a trigger and apply the status SHA reports through its API.
      try {
        const verified = await checkKenyaShaClaimStatus(getKenyaShaClaimsCredentials(project), bundleId);
        claimState = verified.claimState;
        remoteClaimResponse = verified.claimResponse;
        callbackMessage = verified.message ?? `SHA claim status: ${claimState ?? 'status update'}`;
      } catch (err) {
        globalLogger.warn('Kenya SHA callback: could not verify unsigned callback with SHA claim-status API', {
          projectId,
          bundleId,
          error: normalizeErrorString(err),
        });
        return {
          ok: false,
          projectId,
          bundleId,
          claimId: targetClaim.id,
          status: 'error',
          message: `Unsigned SHA callback could not be verified with the SHA claim-status API: ${normalizeErrorString(err)}`,
        };
      }
    }
    const statusLabel = normalizeCallbackStatus(claimState, remoteClaimResponse?.outcome);

    // Upsert ClaimResponse
    const insurer = remoteClaimResponse?.insurer ?? targetClaim.insurer;
    if (!insurer) {
      return { ok: false, projectId, bundleId, claimId: targetClaim.id, status: 'error', message: 'No insurer on Claim or callback ClaimResponse' };
    }

    const existing = await systemRepo.searchOne<ClaimResponse>({
      resourceType: 'ClaimResponse',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: projectId },
        { code: 'identifier', operator: Operator.EXACT, value: `${KenyaShaClaimResponseIdentifierSystem}|${bundleId}` },
      ],
    });

    const outcome: ClaimResponse['outcome'] =
      statusLabel === 'adjudicated' ? 'complete' : statusLabel === 'rejected' ? 'error' : 'queued';

    const nextClaimResponse: ClaimResponse = {
      ...(remoteClaimResponse ?? {}),
      ...(existing ? { id: existing.id } : undefined),
      resourceType: 'ClaimResponse',
      meta: { ...(remoteClaimResponse?.meta ?? existing?.meta ?? {}), project: projectId },
      identifier: mergeIdentifier(remoteClaimResponse?.identifier ?? existing?.identifier, bundleId),
      status: remoteClaimResponse?.status ?? existing?.status ?? 'active',
      type: remoteClaimResponse?.type ?? targetClaim.type,
      use: remoteClaimResponse?.use ?? targetClaim.use,
      patient: remoteClaimResponse?.patient ?? targetClaim.patient,
      created: remoteClaimResponse?.created ?? existing?.created ?? new Date().toISOString(),
      request: createReference(targetClaim as Claim & { id: string }),
      outcome: remoteClaimResponse?.outcome ?? existing?.outcome ?? outcome,
      disposition: remoteClaimResponse?.disposition ?? callbackMessage,
      insurer,
      preAuthRef: remoteClaimResponse?.preAuthRef ?? bundleId,
    };

    let savedClaimResponse: ClaimResponse;
    if (existing?.id) {
      savedClaimResponse = await systemRepo.updateResource<ClaimResponse>(nextClaimResponse);
    } else {
      const toCreate = { ...nextClaimResponse };
      delete (toCreate as { id?: string }).id;
      savedClaimResponse = await systemRepo.createResource<ClaimResponse>(toCreate);
    }

    // Update any open Task for this claim
    const taskBundle = (await systemRepo.search<Task>({
      resourceType: 'Task',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: projectId },
        { code: 'focus', operator: Operator.EQUALS, value: `Claim/${targetClaim.id}` },
        { code: 'status', operator: Operator.EQUALS, value: 'requested,in-progress' },
      ],
      count: 5,
    })) as Bundle<Task>;

    for (const entry of taskBundle.entry ?? []) {
      const task = entry.resource;
      if (!task?.id) continue;
      await systemRepo.updateResource<Task>({
        ...task,
        status: statusLabel === 'adjudicated' || statusLabel === 'rejected' ? 'completed' : 'in-progress',
        businessStatus: { text: statusLabel },
        lastModified: new Date().toISOString(),
        output: [
          ...(task.output ?? []),
          { type: { text: 'sha-callback-status' }, valueString: claimState ?? statusLabel },
          { type: { text: 'sha-callback-message' }, valueString: callbackMessage },
        ],
      });
    }

    if (statusLabel === 'adjudicated') {
      void syncErpNextShaPayment(
        systemRepo,
        targetClaim as Claim & { id: string },
        savedClaimResponse,
        project as import('@medplum/fhirtypes').Project & { id: string }
      );
    }

    globalLogger.info('Kenya SHA callback processed', { projectId, bundleId, claimId: targetClaim.id, statusLabel });

    return {
      ok: true,
      projectId,
      bundleId,
      claimId: targetClaim.id,
      claimState,
      status: statusLabel,
      message: callbackMessage,
      claimResponseId: savedClaimResponse.id,
    };
  } catch (err) {
    globalLogger.error('Kenya SHA callback processing failed', { projectId, bundleId, error: normalizeErrorString(err) });
    return { ok: false, projectId, bundleId, status: 'error', message: normalizeErrorString(err) };
  }
}
