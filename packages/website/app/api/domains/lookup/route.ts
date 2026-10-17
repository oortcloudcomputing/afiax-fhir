// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { buildDemoDomainResults, defaultDomainCatalog, normalizeDomainQuery } from '../../../../lib/domain-lookup';
import type { DomainMode, DomainSearchResult, DomainUiStatus } from '../../../../lib/domain-lookup';

function mapUpstreamStatus(rawStatus: string, mode: DomainMode): DomainUiStatus {
  switch (rawStatus) {
    case 'available':
      return 'available';
    case 'regthroughothers':
      return mode === 'transfer' ? 'transfer-ready' : 'taken';
    case 'regthroughus':
      return 'already-managed';
    case 'premium':
      return 'premium';
    case 'unknown':
      return 'unknown';
    default:
      return 'taken';
  }
}

function readNestedStatus(candidate: unknown): string | undefined {
  if (!candidate || typeof candidate !== 'object') {
    return undefined;
  }

  if ('status' in candidate && typeof candidate.status === 'string') {
    return candidate.status;
  }

  for (const value of Object.values(candidate)) {
    if (value && typeof value === 'object' && 'status' in value && typeof value.status === 'string') {
      return value.status;
    }
  }

  return undefined;
}

function parseUpstreamResults(
  raw: unknown,
  label: string,
  mode: DomainMode,
  tlds: readonly string[]
): DomainSearchResult[] | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const response = raw as Record<string, unknown>;

  return tlds.map((tld, index) => {
    const bareTld = tld.replace(/^\./, '');
    const fullDomain = `${label}${tld}`;
    const directCandidate =
      response[fullDomain] ??
      response[`${label}.${bareTld}`] ??
      response[`${label}${bareTld}`] ??
      response[label];
    const status = readNestedStatus(directCandidate) ?? readNestedStatus(response[bareTld]) ?? 'unknown';
    const catalogEntry = defaultDomainCatalog.find((entry) => entry.tld === tld) ?? defaultDomainCatalog[index];
    const mappedStatus = mapUpstreamStatus(status, mode);
    let yearlyPrice = mode === 'transfer' ? catalogEntry.transferPrice : catalogEntry.registerPrice;
    if (mappedStatus === 'premium') {
      yearlyPrice = Math.round(catalogEntry.registerPrice * 2.4);
    }

    return {
      domain: fullDomain,
      tld,
      yearlyPrice,
      status: mappedStatus,
      note: catalogEntry.note,
      source: 'resellerclub',
      rawStatus: status,
    };
  });
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const domain = normalizeDomainQuery(request.nextUrl.searchParams.get('domain') ?? '');
  const mode = (request.nextUrl.searchParams.get('mode') as DomainMode | null) ?? 'register';
  const requestedTlds = request.nextUrl.searchParams.get('tlds');
  const tlds = requestedTlds
    ? requestedTlds
        .split(',')
        .map((value) => value.trim())
        .filter(Boolean)
    : defaultDomainCatalog.map((entry) => entry.tld);

  if (domain.length < 3) {
    return NextResponse.json({ status: 'error', message: 'Enter at least 3 characters for the domain label.' }, { status: 400 });
  }

  const authUserId = process.env.RESELLERCLUB_AUTH_USER_ID;
  const apiKey = process.env.RESELLERCLUB_API_KEY;
  const baseUrl = (process.env.RESELLERCLUB_DOMAINCHECK_BASE_URL ?? 'https://domaincheck.httpapi.com').replace(/\/$/, '');

  if (!authUserId || !apiKey) {
    return NextResponse.json({
      status: 'ok',
      integrationMode: 'demo',
      results: buildDemoDomainResults(domain, mode).filter((result) => tlds.includes(result.tld)),
    });
  }

  const params = new URLSearchParams();
  params.set('auth-userid', authUserId);
  params.set('api-key', apiKey);
  params.set('domain-name', domain);
  params.set(
    'tlds',
    tlds
      .map((tld) => tld.replace(/^\./, ''))
      .join(',')
  );

  try {
    const response = await fetch(`${baseUrl}/api/domains/available.json?${params.toString()}`, {
      method: 'GET',
      cache: 'no-store',
    });

    if (!response.ok) {
      return NextResponse.json(
        {
          status: 'error',
          integrationMode: 'resellerclub',
          message: `ResellerClub lookup failed with status ${response.status}.`,
        },
        { status: 502 }
      );
    }

    const raw = (await response.json()) as unknown;
    const parsed = parseUpstreamResults(raw, domain, mode, tlds);

    if (!parsed) {
      return NextResponse.json({
        status: 'ok',
        integrationMode: 'demo',
        message: 'ResellerClub response could not be parsed, using demo domain results.',
        results: buildDemoDomainResults(domain, mode).filter((result) => tlds.includes(result.tld)),
      });
    }

    return NextResponse.json({ status: 'ok', integrationMode: 'resellerclub', results: parsed });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        integrationMode: 'resellerclub',
        message: error instanceof Error ? error.message : 'ResellerClub lookup failed.',
      },
      { status: 502 }
    );
  }
}
