// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Map tiles (decision 2026-11-23): MapTiler with MEDPLUM_MAPTILER_KEY. The tile server learns which
// area is viewed, never who is looking. Development without a key uses OpenStreetMap's own tiles,
// lightly; that address is left out of builds.

import L from 'leaflet';
import { MEDPLUM_MAPTILER_KEY } from '../config';

/**
 * The tile layer for every map in My Afiax.
 * @returns The layer.
 */
export function tileLayer(): L.TileLayer {
  if (MEDPLUM_MAPTILER_KEY) {
    return L.tileLayer(`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${MEDPLUM_MAPTILER_KEY}`, {
      tileSize: 512,
      zoomOffset: -1,
      maxZoom: 19,
      attribution: '© MapTiler © OpenStreetMap contributors',
      crossOrigin: true,
    });
  }
  const dev = import.meta.env?.DEV ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png' : '';
  return L.tileLayer(dev, { maxZoom: 19, attribution: '© OpenStreetMap contributors' });
}
