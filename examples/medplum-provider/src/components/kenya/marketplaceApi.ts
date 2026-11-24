// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// The afiax-services /directory API (ADR-018 §B), as the signed-in user.
import { useMedplum } from '@medplum/react';
import { useCallback } from 'react';
import { getConfig } from '../../config';

export interface RegulatorInfo {
  code: string;
  name: string;
  logo?: string;
  register?: string;
}

export interface MarketplaceCatalog {
  cadres: Record<string, string>;
  specialities: Record<string, string>;
  regions: Record<string, string[]>;
  visitTypes: Record<string, string>;
  regulators: Record<string, RegulatorInfo>;
  cadreRegulator: Record<string, string>;
}

export interface MarketplaceCard {
  id: string;
  name: string;
  cadre?: { code: string; display: string };
  speciality?: { code: string; display: string };
  facility: { name: string; county?: string; region?: string };
  visitTypes: string[];
  feeKes?: number;
  languages: string[];
  bio?: string;
  photo?: string;
  registration?: { system?: string; value?: string; verified: boolean; body?: RegulatorInfo };
  insurers: string[];
  rating?: number;
  reviews?: number;
}

export interface MarketplaceReview {
  id: string;
  rating: number;
  comment?: string;
  author: string;
  date: string;
  visitType?: string;
}

export type MarketplaceCall = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>;

/**
 * Calls afiax-services /directory as the signed-in user.
 * @returns The call function and the services address (undefined when not set up).
 */
export function useMarketplace(): { call: MarketplaceCall; servicesUrl?: string; asset: (path?: string) => string | undefined } {
  const medplum = useMedplum();
  const servicesUrl = getConfig().afiaxServicesUrl?.replace(/\/$/, '');
  const call = useCallback<MarketplaceCall>(
    async <T,>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
      await medplum.refreshIfExpired();
      // A path starting with / is from the root (e.g. /escrow/…); otherwise under /directory/
      const res = await fetch(path.startsWith('/') ? `${servicesUrl}${path}` : `${servicesUrl}/directory/${path}`, {
        method,
        headers: { Authorization: `Bearer ${medplum.getAccessToken()}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as T & { message?: string };
      if (!res.ok) {
        throw new Error(json.message ?? `The marketplace answered ${res.status}`);
      }
      return json;
    },
    [medplum, servicesUrl]
  );
  const asset = useCallback((path?: string) => (path && servicesUrl ? `${servicesUrl}${path}` : undefined), [servicesUrl]);
  return { call, servicesUrl, asset };
}

