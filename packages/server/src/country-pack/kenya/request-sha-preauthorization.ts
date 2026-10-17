// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, getKenyaShaClaimsEnvironment, normalizeErrorString } from '@medplum/core';
import type {
  Bundle,
  BundleEntry,
  Claim,
  Coverage,
  Organization,
  Patient,
  Practitioner,
  Reference,
  Resource,
} from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedRequestContext } from '../../context';
import {
  getKenyaShaClaimsBaseUrl,
  getKenyaShaClaimsCredentials,
  hasKenyaShaClaimsCredentials,
  KenyaShaBundleIdIdentifierSystem,
  submitKenyaShaClaimBundle,
} from './sha';

export interface ShaPreAuthItem {
  readonly sequence: number;
  readonly interventionCode: string;
  readonly description: string;
  readonly quantity?: number;
  readonly unitPrice?: number;
}

export interface RequestShaPreauthorizationInput {
  readonly ctx: AuthenticatedRequestContext;
  readonly coverage: WithId<Coverage>;
  readonly patient: WithId<Patient>;
  readonly providerOrganization: WithId<Organization>;
  readonly insurerOrganization: WithId<Organization>;
  readonly practitioners: readonly WithId<Practitioner>[];
  readonly requestedItems: readonly ShaPreAuthItem[];
  readonly estimatedTotal: number;
  readonly currency: string;
  readonly correlationId: string;
}

export interface RequestShaPreauthorizationResult {
  readonly status: 'submitted' | 'prepared' | 'error';
  readonly correlationId: string;
  readonly message: string;
  readonly nextState: string;
  readonly shaClaimsEnvironment?: string;
  readonly preAuthBundleId?: string;
  readonly submissionEndpoint?: string;
  readonly statusTrackingEndpoint?: string;
  readonly responseStatusCode?: number;
  readonly rawBundle?: string;
  readonly rawResponse?: string;
  readonly preAuthClaimId?: string;
}

function buildResourceFullUrl(baseUrl: string, resource: WithId<Resource>): string {
  return `${baseUrl}/fhir/${resource.resourceType}/${resource.id}`;
}

function rewriteReference<T extends Reference | undefined>(
  reference: T,
  referenceMap: ReadonlyMap<string, string>
): T {
  if (!reference?.reference) {
    return reference;
  }
  const fullUrl = referenceMap.get(reference.reference);
  if (!fullUrl) {
    return reference;
  }
  return { ...reference, reference: fullUrl } as T;
}

export async function requestKenyaShaPreauthorization(
  input: RequestShaPreauthorizationInput
): Promise<RequestShaPreauthorizationResult> {
  const { ctx, coverage, patient, providerOrganization, insurerOrganization, practitioners, requestedItems, estimatedTotal, currency, correlationId } = input;

  const shaClaimsEnvironment = getKenyaShaClaimsEnvironment(ctx.project);
  const claimsBaseUrl = getKenyaShaClaimsBaseUrl(ctx.project);
  const bundleId = randomUUID();
  const submissionEndpoint = `${claimsBaseUrl}/v1/shr-med/bundle`;
  const statusTrackingEndpoint = `${claimsBaseUrl}/v1/shr-med/claim-status?claim_id=${encodeURIComponent(bundleId)}`;

  const preAuthClaim = await ctx.systemRepo.createResource<Claim>({
    resourceType: 'Claim',
    meta: { project: ctx.project.id },
    status: 'active',
    use: 'preauthorization',
    type: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/claim-type', code: 'institutional' }] },
    identifier: [{ system: 'https://afiax.africa/kenya/identifier/private-preauth-code', value: correlationId }],
    patient: createReference(patient),
    created: new Date().toISOString(),
    insurer: createReference(insurerOrganization),
    provider: createReference(providerOrganization),
    priority: { coding: [{ code: 'normal' }] },
    insurance: [{ sequence: 1, focal: true, coverage: createReference(coverage) }],
    careTeam: practitioners.map((p, i) => ({ sequence: i + 1, provider: createReference(p) })),
    item: requestedItems.map((item) => ({
      sequence: item.sequence,
      productOrService: {
        coding: [{ system: 'https://afiax.africa/kenya/CodeSystem/sha-intervention', code: item.interventionCode }],
        text: item.description,
      },
      quantity: { value: item.quantity ?? 1 },
      unitPrice: item.unitPrice !== undefined ? { value: item.unitPrice, currency: currency as 'KES' | 'USD' | 'EUR' } : undefined,
    })),
    total: { value: estimatedTotal, currency: currency as 'KES' | 'USD' | 'EUR' },
  });

  const bundleResources: WithId<Resource>[] = [
    insurerOrganization,
    providerOrganization,
    coverage,
    patient,
    ...practitioners,
  ];

  const referenceMap = new Map<string, string>();
  for (const resource of bundleResources) {
    referenceMap.set(createReference(resource).reference as string, buildResourceFullUrl(claimsBaseUrl, resource));
  }

  const transformedClaim: Claim = {
    ...preAuthClaim,
    id: bundleId,
    patient: rewriteReference(createReference(patient), referenceMap),
    provider: rewriteReference(createReference(providerOrganization), referenceMap),
    insurer: rewriteReference(createReference(insurerOrganization), referenceMap),
    insurance: [{ sequence: 1, focal: true, coverage: rewriteReference(createReference(coverage), referenceMap) }],
    careTeam: practitioners.map((p, i) => ({
      sequence: i + 1,
      provider: rewriteReference(createReference(p), referenceMap),
    })),
  };

  const claimFullUrl = `${claimsBaseUrl}/fhir/Claim/${bundleId}`;
  const bundleEntries: BundleEntry[] = [
    { fullUrl: buildResourceFullUrl(claimsBaseUrl, insurerOrganization), resource: insurerOrganization },
    { fullUrl: buildResourceFullUrl(claimsBaseUrl, providerOrganization), resource: providerOrganization },
    {
      fullUrl: buildResourceFullUrl(claimsBaseUrl, coverage),
      resource: {
        ...coverage,
        beneficiary: rewriteReference(coverage.beneficiary, referenceMap),
        payor: coverage.payor?.map((payor) => rewriteReference(payor, referenceMap)),
      },
    },
    { fullUrl: buildResourceFullUrl(claimsBaseUrl, patient), resource: patient },
    ...practitioners.map((p) => ({ fullUrl: buildResourceFullUrl(claimsBaseUrl, p), resource: p })),
    { fullUrl: claimFullUrl, resource: transformedClaim },
  ];

  const bundle: Bundle = {
    resourceType: 'Bundle',
    id: bundleId,
    type: 'message',
    timestamp: new Date().toISOString(),
    entry: bundleEntries,
  };

  if (!hasKenyaShaClaimsCredentials(ctx.project)) {
    return {
      status: 'prepared',
      correlationId,
      message: 'Kenya SHA pre-authorization bundle prepared. No SHA credentials configured.',
      nextState: 'ready-for-sha-transport',
      shaClaimsEnvironment,
      preAuthBundleId: bundleId,
      submissionEndpoint,
      statusTrackingEndpoint,
      rawBundle: JSON.stringify(bundle, null, 2),
      preAuthClaimId: preAuthClaim.id,
    };
  }

  try {
    const credentials = getKenyaShaClaimsCredentials(ctx.project);
    const submission = await submitKenyaShaClaimBundle(credentials, bundle, bundleId);

    try {
      const latestClaim = await ctx.systemRepo.readResource<Claim>('Claim', preAuthClaim.id);
      const others = (latestClaim.identifier ?? []).filter((id) => id.system !== KenyaShaBundleIdIdentifierSystem);
      await ctx.systemRepo.updateResource<Claim>({
        ...latestClaim,
        identifier: [...others, { system: KenyaShaBundleIdIdentifierSystem, value: bundleId }],
      });
    } catch {
      // Non-fatal: status check can fall back to claim id
    }

    return {
      status: 'submitted',
      correlationId,
      message: 'Kenya SHA pre-authorization bundle submitted successfully.',
      nextState: 'awaiting-sha-preauth-decision',
      shaClaimsEnvironment,
      preAuthBundleId: bundleId,
      submissionEndpoint: submission.submissionEndpoint,
      statusTrackingEndpoint: submission.statusTrackingEndpoint,
      responseStatusCode: submission.responseStatusCode,
      rawBundle: JSON.stringify(bundle, null, 2),
      rawResponse: submission.rawResponse,
      preAuthClaimId: preAuthClaim.id,
    };
  } catch (err) {
    return {
      status: 'error',
      correlationId,
      message: `Kenya SHA pre-authorization submission failed: ${normalizeErrorString(err)}`,
      nextState: 'retry-or-review-sha-credentials',
      shaClaimsEnvironment,
      preAuthBundleId: bundleId,
      submissionEndpoint,
      statusTrackingEndpoint,
      rawBundle: JSON.stringify(bundle, null, 2),
      rawResponse: normalizeErrorString(err),
      preAuthClaimId: preAuthClaim.id,
    };
  }
}
