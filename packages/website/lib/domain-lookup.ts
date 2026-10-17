// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export type DomainMode = 'register' | 'transfer';

export type DomainUiStatus = 'available' | 'premium' | 'taken' | 'transfer-ready' | 'already-managed' | 'unknown';

export interface DomainCatalogEntry {
  readonly tld: string;
  readonly registerPrice: number;
  readonly transferPrice: number;
  readonly note: string;
}

export interface DomainSearchResult {
  readonly domain: string;
  readonly tld: string;
  readonly yearlyPrice: number;
  readonly status: DomainUiStatus;
  readonly note: string;
  readonly source: 'demo' | 'resellerclub';
  readonly rawStatus?: string;
}

export const defaultDomainCatalog: readonly DomainCatalogEntry[] = [
  { tld: '.africa', registerPrice: 18, transferPrice: 16, note: 'Pan-African brand domain through OortCloud.' },
  { tld: '.co.ke', registerPrice: 14, transferPrice: 12, note: 'Kenya market entry and national partner-facing domain.' },
  { tld: '.com', registerPrice: 16, transferPrice: 14, note: 'Global commercial front door and corporate identity layer.' },
  { tld: '.health', registerPrice: 88, transferPrice: 82, note: 'Premium health-domain posture for strategic enterprise brands.' },
  { tld: '.clinic', registerPrice: 28, transferPrice: 24, note: 'Service-line or network launch domain for care delivery brands.' },
  { tld: '.org', registerPrice: 17, transferPrice: 15, note: 'Public-sector, foundation, or ecosystem operator posture.' },
] as const;

export const domainStatusLabels: Record<DomainUiStatus, string> = {
  available: 'Available',
  premium: 'Premium',
  taken: 'Taken',
  'transfer-ready': 'Transfer ready',
  'already-managed': 'Already with Afiax',
  unknown: 'Unknown',
};

export function normalizeDomainQuery(value: string): string {
  let normalized = value.toLowerCase().trim();
  normalized = normalized.replace(/^https?:\/\//, '').replace(/^www\./, '');
  normalized = normalized.split('/')[0];
  normalized = normalized.replace(/\.(africa|co\.ke|com|health|clinic|org)$/i, '');
  normalized = normalized.replace(/[^a-z0-9-]/g, '').replace(/^-+|-+$/g, '');
  return normalized;
}

function hashLabel(value: string): number {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) % 9973;
  }
  return hash;
}

function getDemoRegisterStatus(label: string, entry: DomainCatalogEntry, index: number): DomainUiStatus {
  const score = (hashLabel(`${label}-${entry.tld}`) + index) % 11;

  if (entry.tld === '.com' && label.length <= 6) {
    return 'taken';
  }

  if (entry.tld === '.health' && label.length <= 8) {
    return 'premium';
  }

  if (score === 0) {
    return 'taken';
  }

  if (score <= 2) {
    return 'premium';
  }

  return 'available';
}

export function buildDemoDomainResults(
  label: string,
  mode: DomainMode,
  catalog: readonly DomainCatalogEntry[] = defaultDomainCatalog
): DomainSearchResult[] {
  if (label.length < 3) {
    return [];
  }

  return catalog.map((entry, index) => {
    const status = mode === 'transfer' ? 'transfer-ready' : getDemoRegisterStatus(label, entry, index);
    let yearlyPrice = mode === 'transfer' ? entry.transferPrice : entry.registerPrice;
    if (status === 'premium') {
      yearlyPrice = Math.round(entry.registerPrice * 2.4);
    }

    return {
      domain: `${label}${entry.tld}`,
      tld: entry.tld,
      yearlyPrice,
      status,
      note: entry.note,
      source: 'demo',
    };
  });
}
