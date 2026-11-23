// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Searching for a place by name ("Karen", "Yaya Centre", "Kenyatta Avenue"), for patients whose
// location is off or wrong: MapTiler's place search, in Kenya, nearest Nairobi first. Only what was
// typed goes to MapTiler, never who typed it.

import { MEDPLUM_MAPTILER_KEY } from '../config';
import type { Position } from './offers-api';

export interface Place {
  readonly label: string;
  readonly position: Position;
}

/** Finds places by name. */
export type PlaceSearch = (query: string) => Promise<Place[]>;

/**
 * MapTiler's place search, or undefined without a MapTiler key.
 * @param fetchFn - fetch (injected in tests).
 * @returns The search.
 */
export function mapTilerPlaces(fetchFn: typeof fetch = fetch): PlaceSearch | undefined {
  if (!MEDPLUM_MAPTILER_KEY) {
    return undefined;
  }
  const key = MEDPLUM_MAPTILER_KEY;
  return async (query) => {
    const q = query.trim();
    if (q.length < 3) {
      return [];
    }
    const url = new URL(`https://api.maptiler.com/geocoding/${encodeURIComponent(q)}.json`);
    url.searchParams.set('key', key);
    url.searchParams.set('country', 'ke');
    url.searchParams.set('language', 'en');
    url.searchParams.set('limit', '5');
    // Nairobi first, when names repeat across the country
    url.searchParams.set('proximity', '36.8219,-1.2921');
    const response = await fetchFn(url.toString());
    if (!response.ok) {
      return [];
    }
    const body = (await response.json()) as {
      features?: { place_name?: string; text?: string; center?: [number, number] }[];
    };
    return (body.features ?? []).flatMap((f) =>
      f.center ? [{ label: f.place_name ?? f.text ?? q, position: { lat: f.center[1], lng: f.center[0] } }] : []
    );
  };
}
