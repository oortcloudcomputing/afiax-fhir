// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export type SearchParams = Record<string, string | string[] | undefined>;

export interface OnboardingPacket {
  readonly organizationName: string;
  readonly contactName: string;
  readonly workEmail: string;
  readonly country: string;
  readonly domain: string;
  readonly domainMode: string;
  readonly source: string;
  readonly serviceItem: string;
  readonly plan: string;
  readonly planBadge: string;
  readonly planMonthlyPrice: string;
  readonly deployment: string;
  readonly transferStatus: string;
  readonly transferMessage: string;
  readonly lookupProvider: string;
  readonly track: string;
}

export interface OnboardingSubmissionResponse {
  readonly status: 'created' | 'not_configured' | 'error';
  readonly message: string;
  readonly submissionMode?: 'direct_lead';
  readonly leadName?: string;
  readonly leadUrl?: string;
  readonly commentName?: string;
  readonly redirectUrl?: string;
  readonly missingEnv?: string[];
  readonly upstream?: unknown;
}

export function readSearchParam(params: SearchParams, key: string, fallback = 'Pending'): string {
  const value = params[key];

  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

export function buildOnboardingPacketFromSearchParams(params: SearchParams): OnboardingPacket {
  return {
    organizationName: readSearchParam(params, 'organization'),
    contactName: readSearchParam(params, 'contact'),
    workEmail: readSearchParam(params, 'email'),
    country: readSearchParam(params, 'country'),
    domain: readSearchParam(params, 'domain'),
    domainMode: readSearchParam(params, 'domainMode'),
    source: readSearchParam(params, 'source'),
    serviceItem: readSearchParam(params, 'serviceItem'),
    plan: readSearchParam(params, 'plan'),
    planBadge: readSearchParam(params, 'planBadge'),
    planMonthlyPrice: readSearchParam(params, 'planMonthlyPrice'),
    deployment: readSearchParam(params, 'deployment'),
    transferStatus: readSearchParam(params, 'transferStatus'),
    transferMessage: readSearchParam(params, 'transferMessage', ''),
    lookupProvider: readSearchParam(params, 'lookupProvider'),
    track: readSearchParam(params, 'track'),
  };
}

export function normalizeOnboardingPacket(input: Partial<OnboardingPacket> | Record<string, unknown>): OnboardingPacket {
  function readValue(value: unknown, fallback: string): string {
    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value).trim();
    }

    return fallback;
  }

  return {
    organizationName: readValue(input.organizationName, 'Pending organization'),
    contactName: readValue(input.contactName, 'Pending contact'),
    workEmail: readValue(input.workEmail, 'Pending email'),
    country: readValue(input.country, 'Pending'),
    domain: readValue(input.domain, 'Pending'),
    domainMode: readValue(input.domainMode, 'Pending'),
    source: readValue(input.source, 'Pending'),
    serviceItem: readValue(input.serviceItem, 'Pending'),
    plan: readValue(input.plan, 'Pending'),
    planBadge: readValue(input.planBadge, 'Pending'),
    planMonthlyPrice: readValue(input.planMonthlyPrice, 'Pending'),
    deployment: readValue(input.deployment, 'Pending'),
    transferStatus: readValue(input.transferStatus, 'Pending'),
    transferMessage: readValue(input.transferMessage, ''),
    lookupProvider: readValue(input.lookupProvider, 'Pending'),
    track: readValue(input.track, 'Pending'),
  };
}

export function validateOnboardingPacket(packet: OnboardingPacket): string[] {
  const missing: string[] = [];

  if (!packet.organizationName || packet.organizationName.startsWith('Pending')) {
    missing.push('organizationName');
  }

  if (!packet.contactName || packet.contactName.startsWith('Pending')) {
    missing.push('contactName');
  }

  if (!packet.workEmail || packet.workEmail.startsWith('Pending')) {
    missing.push('workEmail');
  }

  if (!packet.domain || packet.domain.startsWith('Pending')) {
    missing.push('domain');
  }

  if (!packet.source || packet.source.startsWith('Pending')) {
    missing.push('source');
  }

  if (!packet.plan || packet.plan.startsWith('Pending')) {
    missing.push('plan');
  }

  return missing;
}

export function getTransferSummary(status: string): string {
  switch (status) {
    case 'submitted':
      return 'The transfer request was submitted before the signup handoff.';
    case 'not-requested':
      return 'No transfer request was needed because this lead is following the domain registration path.';
    case 'not_configured':
      return 'The transfer request still needs live ResellerClub credentials before ERPNext can place it automatically.';
    case 'error':
      return 'The transfer request needs operator review before domain fulfillment is complete.';
    default:
      return 'Transfer status is pending review.';
  }
}

export function buildOnboardingComment(packet: OnboardingPacket): string {
  const lines = [
    'Afiax website onboarding packet',
    '',
    `Organization: ${packet.organizationName}`,
    `Primary contact: ${packet.contactName}`,
    `Work email: ${packet.workEmail}`,
    `Country context: ${packet.country}`,
    `Domain order: ${packet.domain} via ${packet.domainMode}`,
    `Migration source: ${packet.source}`,
    `ERPNext service item: ${packet.serviceItem}`,
    `Recommended plan: ${packet.planBadge !== 'Pending' ? `${packet.planBadge} - ${packet.plan}` : packet.plan}`,
    `Commercial baseline: ${packet.planMonthlyPrice !== 'Pending' ? `$${Number(packet.planMonthlyPrice).toLocaleString()} per month base` : 'Pending'}`,
    `Track: ${packet.track}`,
    `Deployment: ${packet.deployment}`,
    `Lookup provider: ${packet.lookupProvider}`,
    `Transfer summary: ${getTransferSummary(packet.transferStatus)}`,
  ];

  if (packet.transferMessage) {
    lines.push(`Transfer detail: ${packet.transferMessage}`);
  }

  return lines.join('\n');
}
