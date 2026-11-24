// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box } from '@mantine/core';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { getConfig } from '../../config';

export interface MapPoint {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly label: string;
  /** "here" (our hospital), a hospital with or without free beds, or an ambulance. */
  readonly kind: 'here' | 'free' | 'full' | 'ambulance';
}

const colours: Record<MapPoint['kind'], string> = {
  here: '#1B2A4A',
  free: '#2CA02C',
  full: '#9CA3AF',
  ambulance: '#E11D48',
};

/**
 * The tile layer: MapTiler with MEDPLUM_MAPTILER_KEY (as My Afiax); OpenStreetMap's own tiles in
 * development only, under their usage policy.
 * @returns The layer.
 */
function tiles(): L.TileLayer {
  const key = getConfig().maptilerKey;
  if (key) {
    return L.tileLayer(`https://api.maptiler.com/maps/streets-v2/{z}/{x}/{y}.png?key=${key}`, {
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

function icon(kind: MapPoint['kind']): L.DivIcon {
  const size = kind === 'ambulance' ? 30 : 22;
  const inner =
    kind === 'ambulance'
      ? '<svg viewBox="0 0 24 24" width="16" height="16" fill="white"><path d="M3 6h11v4h3l3 4v4h-2a2 2 0 1 1-4 0H9a2 2 0 1 1-4 0H3zM7 7v2H5v2h2v2h2v-2h2V9H9V7z"/></svg>'
      : '';
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${colours[kind]};border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center">${inner}</div>`,
  });
}

/**
 * A map of hospitals (ours, with and without free beds) and, when one is on the way, the
 * ambulance, with a line from the ambulance to where it is going. It keeps every point in view.
 * @param props - The points, an optional line, a click handler and the height.
 * @param props.points - What to show.
 * @param props.line - From and to (the ambulance's route as the crow flies).
 * @param props.onSelect - Called with a point's id when its marker is clicked.
 * @param props.height - The map's height in pixels.
 * @returns The map.
 */
export function ReferralMap(props: {
  readonly points: readonly MapPoint[];
  readonly line?: readonly [{ lat: number; lng: number }, { lat: number; lng: number }];
  readonly onSelect?: (id: string) => void;
  readonly height?: number;
}): JSX.Element {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map>(undefined);
  const layer = useRef<L.LayerGroup>(undefined);
  const { points, line, onSelect } = props;

  useEffect(() => {
    if (!box.current || map.current) {
      return undefined;
    }
    map.current = L.map(box.current, { scrollWheelZoom: false }).setView([-1.29, 36.82], 9);
    tiles().addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => {
      map.current?.remove();
      map.current = undefined;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) {
      return;
    }
    group.clearLayers();
    for (const p of points) {
      const marker = L.marker([p.lat, p.lng], { icon: icon(p.kind), title: p.label }).bindTooltip(p.label);
      if (onSelect && p.kind !== 'here' && p.kind !== 'ambulance') {
        marker.on('click', () => onSelect(p.id));
      }
      marker.addTo(group);
    }
    if (line) {
      L.polyline(
        line.map((x) => [x.lat, x.lng] as [number, number]),
        { color: colours.ambulance, weight: 3, dashArray: '6 8' }
      ).addTo(group);
    }
    if (points.length > 1) {
      m.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number])), { padding: [40, 40], maxZoom: 13 });
    } else if (points.length === 1) {
      m.setView([points[0].lat, points[0].lng], 12);
    }
  }, [points, line, onSelect]);

  return <Box ref={box} h={props.height ?? 320} style={{ borderRadius: 12, overflow: 'hidden', zIndex: 0 }} />;
}
