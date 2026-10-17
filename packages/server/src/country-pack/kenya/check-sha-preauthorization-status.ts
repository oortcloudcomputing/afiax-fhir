// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, normalizeErrorString, Operator } from '@medplum/core';
import type { Claim, ClaimResponse, Coverage, Reference } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { checkKenyaShaClaimStatus, getKenyaShaClaimsCredentials, KenyaShaBundleIdIdentifierSystem } from './sha';

export interface CheckShaPreauthorizationStatusInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly preAuthClaim: WithId<Claim>;
  readonly coverage: WithId<Coverage>;
  readonly correlationId: string;
}

export interface CheckShaPreauthorizationStatusResult {
  readonly status: 'queued' | 'approved' | 'denied' | 'error';
  readonly correlationId: string;
  readonly message: string;
  readonly nextState: string;
  readonly preAuthRef?: string;
  readonly approvedAmount?: number;
  readonly claimResponse?: Reference<ClaimResponse>;
}

const KenyaShaPreAuthResponseIdentifierSystem = 'https://afiax.africa/kenya/identifier/sha-preauth-bundle-id';

function normalizePreAuthStatus(
  claimState: string | undefined,
  outcome: ClaimResponse['outcome'] | undefined
): {
  readonly status: CheckShaPreauthorizationStatusResult['status'];
  readonly nextState: string;
} {
  const normalized = claimState?.trim().toLowerCase() ?? '';

  if (outcome === 'complete' || normalized.includes('approved') || normalized.includes('authoriz')) {
    return { status: 'approved', nextState: 'preauth-approved-ready-for-claim' };
  }

  if (
    outcome === 'error' ||
    normalized.includes('reject') ||
    normalized.includes('declin') ||
    normalized.includes('denied')
  ) {
    return { status: 'denied', nextState: 'review-preauth-denial' };
  }

  return { status: 'queued', nextState: 'awaiting-sha-preauth-decision' };
}

function extractPreAuthRef(claimResponse: ClaimResponse | undefined): string | undefined {
  return claimResponse?.preAuthRef ?? undefined;
}

export async function checkKenyaShaPreauthorizationStatus(
  input: CheckShaPreauthorizationStatusInput
): Promise<CheckShaPreauthorizationStatusResult> {
  const { ctx, preAuthClaim, coverage, correlationId } = input;

  const bundleId =
    preAuthClaim.identifier?.find((i) => i.system === KenyaShaBundleIdIdentifierSystem)?.value ?? preAuthClaim.id;

  try {
    const credentials = getKenyaShaClaimsCredentials(ctx.project);
    const response = await checkKenyaShaClaimStatus(credentials, bundleId);
    const { status, nextState } = normalizePreAuthStatus(response.claimState, response.claimResponse?.outcome);
    const defaultMessages: Record<string, string> = {
      approved: 'SHA pre-authorization approved.',
      denied: 'SHA pre-authorization was denied.',
    };
    const message = response.message ?? defaultMessages[status] ?? 'SHA pre-authorization is still queued for review.';

    const insurer = response.claimResponse?.insurer ?? preAuthClaim.insurer;
    if (!insurer) {
      throw new Error('SHA pre-authorization status response is missing an insurer reference.');
    }

    const existing = await ctx.systemRepo.searchOne<ClaimResponse>({
      resourceType: 'ClaimResponse',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: ctx.project.id },
        {
          code: 'identifier',
          operator: Operator.EXACT,
          value: `${KenyaShaPreAuthResponseIdentifierSystem}|${bundleId}`,
        },
      ],
    });

    const outcomes: Record<string, ClaimResponse['outcome']> = { approved: 'complete', denied: 'error' };
    const outcome = outcomes[status] ?? 'queued';

    const preAuthRef = extractPreAuthRef(response.claimResponse);

    const nextClaimResponse: ClaimResponse = {
      ...(response.claimResponse ?? {}),
      ...(existing ? { id: existing.id } : undefined),
      resourceType: 'ClaimResponse',
      meta: { ...(response.claimResponse?.meta ?? existing?.meta ?? {}), project: ctx.project.id },
      identifier: [
        ...(response.claimResponse?.identifier ?? existing?.identifier ?? []).filter(
          (id) => id.system !== KenyaShaPreAuthResponseIdentifierSystem
        ),
        { system: KenyaShaPreAuthResponseIdentifierSystem, value: bundleId },
      ],
      status: response.claimResponse?.status ?? existing?.status ?? 'active',
      type: response.claimResponse?.type ?? preAuthClaim.type,
      use: 'preauthorization',
      patient: response.claimResponse?.patient ?? preAuthClaim.patient,
      created: response.claimResponse?.created ?? existing?.created ?? new Date().toISOString(),
      request: createReference(preAuthClaim),
      outcome: response.claimResponse?.outcome ?? existing?.outcome ?? outcome,
      disposition: response.claimResponse?.disposition ?? message,
      insurer,
      preAuthRef: preAuthRef ?? existing?.preAuthRef ?? bundleId,
    };

    let savedClaimResponse: ClaimResponse & { id: string };
    if (existing?.id) {
      savedClaimResponse = (await ctx.systemRepo.updateResource<ClaimResponse>(nextClaimResponse)) as ClaimResponse & {
        id: string;
      };
    } else {
      delete (nextClaimResponse as { id?: string }).id;
      savedClaimResponse = (await ctx.systemRepo.createResource<ClaimResponse>(nextClaimResponse)) as ClaimResponse & {
        id: string;
      };
    }

    if (status === 'approved') {
      const preAuthExtUrl = 'https://afiax.africa/fhir/StructureDefinition/kenya-sha-preauthorization';
      const otherExts = (coverage.extension ?? []).filter((e) => e.url !== preAuthExtUrl);
      await ctx.systemRepo.updateResource<Coverage>({
        ...coverage,
        extension: [
          ...otherExts,
          {
            url: preAuthExtUrl,
            extension: [
              { url: 'preAuthRef', valueString: preAuthRef ?? bundleId },
              { url: 'approvedAt', valueDateTime: new Date().toISOString() },
              { url: 'preAuthBundleId', valueString: bundleId },
            ],
          },
        ],
      });

      const approvedAmount =
        response.claimResponse?.payment?.amount?.value ??
        response.claimResponse?.total?.find(() => true)?.amount?.value;

      return {
        status: 'approved',
        correlationId,
        message,
        nextState,
        preAuthRef: preAuthRef ?? bundleId,
        approvedAmount,
        claimResponse: createReference(savedClaimResponse),
      };
    }

    return {
      status,
      correlationId,
      message,
      nextState,
      claimResponse: createReference(savedClaimResponse),
    };
  } catch (err) {
    return {
      status: 'error',
      correlationId,
      message: `Kenya SHA pre-authorization status check failed: ${normalizeErrorString(err)}`,
      nextState: 'retry-or-review-sha-credentials',
    };
  }
}
