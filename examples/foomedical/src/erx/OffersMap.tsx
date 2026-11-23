// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The offers on a map (decision 2026-11-23: Leaflet with MapTiler tiles): the patient's own search
// point and a price pin for each chemist that sent an offer; tapping a pin chooses it, like the
// card's Choose button. Tiles come from MapTiler (MEDPLUM_MAPTILER_KEY); the tile server learns
// which area is viewed, never who is looking or where exactly they are. Without a key there is no
// map (the list still works), except in development, which uses OpenStreetMap's tiles lightly.

import { Box } from '@mantine/core';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { MAP_AVAILABLE } from '../config';
import { pageGestures, pageMapOptions } from './map-gestures';
import { tileLayer } from './map-tiles';
import type { Position } from './offers-api';

export interface MapPin {
  readonly id: string;
  readonly position: Position;
  /** Short text on the pin, e.g. "KES 590". */
  readonly label: string;
  readonly best?: boolean;
  /** A moving rider rather than a chemist. */
  readonly rider?: boolean;
}

export interface OffersMapProps {
  /** The patient's own search point. */
  readonly center: Position;
  readonly pins: readonly MapPin[];
  /** A pin was tapped. */
  readonly onPick?: (id: string) => void;
  readonly height?: number;
}

/** How long the rider takes to glide to a new position (positions arrive every ~20 s). */
const GlideMs = 1500;

/**
 * Moves a marker smoothly to a new position instead of jumping.
 * @param marker - The marker.
 * @param to - Where it goes.
 */
function glide(marker: L.Marker, to: Position): void {
  const from = marker.getLatLng();
  if (from.lat === to.lat && from.lng === to.lng) {
    return;
  }
  const start = performance.now();
  const step = (now: number): void => {
    const t = Math.min(1, (now - start) / GlideMs);
    const ease = t * (2 - t);
    marker.setLatLng([from.lat + (to.lat - from.lat) * ease, from.lng + (to.lng - from.lng) * ease]);
    if (t < 1) {
      requestAnimationFrame(step);
    }
  };
  requestAnimationFrame(step);
}

function escape(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/**
 * The map.
 * @param props - The component props.
 * @returns The map, or nothing when no tiles are available.
 */
export function OffersMap(props: OffersMapProps): JSX.Element | null {
  const { center, pins, onPick, height = 220 } = props;
  const element = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>(undefined);
  const layer = useRef<L.LayerGroup>(undefined);
  const rider = useRef<L.Marker>(undefined);
  const fitted = useRef<string>(undefined);
  const pick = useRef(onPick);
  pick.current = onPick;

  // The map itself, once
  useEffect(() => {
    if (!element.current || !MAP_AVAILABLE) {
      return undefined;
    }
    const m = L.map(element.current, { zoomControl: false, attributionControl: true, ...pageMapOptions }).setView(
      [center.lat, center.lng],
      14
    );
    tileLayer().addTo(m);
    const stopGestures = pageGestures(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    return () => {
      stopGestures();
      m.remove();
      map.current = undefined;
      rider.current = undefined;
      fitted.current = undefined;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The patient and the pins, whenever they change. The map zooms to show them all only when the
  // set of pins changes, so following a rider does not keep moving the map under the patient's finger.
  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) {
      return;
    }
    group.clearLayers();
    L.circleMarker([center.lat, center.lng], {
      radius: 8,
      color: '#fff',
      weight: 3,
      fillColor: '#1c7ed6',
      fillOpacity: 1,
    })
      .bindTooltip('You', { direction: 'top' })
      .addTo(group);
    const bounds = L.latLngBounds([[center.lat, center.lng]]);
    let riderSeen = false;
    for (const pin of pins) {
      bounds.extend([pin.position.lat, pin.position.lng]);
      if (pin.rider) {
        riderSeen = true;
        if (rider.current) {
          glide(rider.current, pin.position);
        } else {
          rider.current = L.marker([pin.position.lat, pin.position.lng], {
            icon: L.divIcon({
              className: '',
              html: `<div style="transform:translate(-50%,-50%);font-size:26px;line-height:26px">🛵</div>`,
              iconSize: [0, 0],
            }),
            title: pin.label,
            zIndexOffset: 1000,
          }).addTo(m);
        }
        continue;
      }
      const icon = L.divIcon({
        className: '',
        html: `<div style="transform:translate(-50%,-100%);display:inline-block;white-space:nowrap;padding:2px 8px;border-radius:12px;font:600 12px/18px sans-serif;box-shadow:0 1px 4px rgba(0,0,0,.4);background:${pin.best ? '#087f5b' : '#fff'};color:${pin.best ? '#fff' : '#212529'}">${pin.best ? '★ ' : ''}${escape(pin.label)}</div>`,
        iconSize: [0, 0],
      });
      L.marker([pin.position.lat, pin.position.lng], { icon, keyboard: true, title: pin.label })
        .on('click', () => pick.current?.(pin.id))
        .addTo(group);
    }
    if (!riderSeen && rider.current) {
      rider.current.remove();
      rider.current = undefined;
    }
    const which = pins.map((p) => p.id).join('|');
    if (fitted.current !== which) {
      fitted.current = which;
      if (pins.length) {
        m.fitBounds(bounds, { padding: [36, 36], maxZoom: 16 });
      } else {
        m.setView([center.lat, center.lng], 14);
      }
    }
  }, [center.lat, center.lng, pins]);

  if (!MAP_AVAILABLE) {
    return null;
  }
  return (
    <Box ref={element} h={height} style={{ borderRadius: 8, overflow: 'hidden', zIndex: 0 }} data-testid="offers-map" />
  );
}
