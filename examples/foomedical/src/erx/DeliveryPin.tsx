// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Where to deliver: the patient drags the pin to their door (it starts where they searched from).
// Only the chosen chemist's rider gets it.

import { Box, Text } from '@mantine/core';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { MAP_AVAILABLE } from '../config';
import { tileLayer } from './map-tiles';
import type { Position } from './offers-api';

export interface DeliveryPinProps {
  readonly value: Position;
  readonly onChange: (position: Position) => void;
}

/**
 * A map with one draggable pin.
 * @param props - The component props.
 * @returns The map, or a note when maps are not available here.
 */
export function DeliveryPin(props: DeliveryPinProps): JSX.Element {
  const { value, onChange } = props;
  const element = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  change.current = onChange;

  useEffect(() => {
    if (!element.current || !MAP_AVAILABLE) {
      return undefined;
    }
    const m = L.map(element.current, { zoomControl: false }).setView([value.lat, value.lng], 16);
    tileLayer().addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    const pin = L.marker([value.lat, value.lng], {
      draggable: true,
      title: 'Your door',
      icon: L.divIcon({
        className: '',
        html: '<div style="transform:translate(-50%,-100%);font-size:28px;line-height:28px">📍</div>',
        iconSize: [0, 0],
      }),
    }).addTo(m);
    pin.on('dragend', () => {
      const p = pin.getLatLng();
      change.current({ lat: p.lat, lng: p.lng });
    });
    // Tapping the map moves the pin there too
    m.on('click', (e: L.LeafletMouseEvent) => {
      pin.setLatLng(e.latlng);
      change.current({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    return () => {
      m.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!MAP_AVAILABLE) {
    return (
      <Text size="xs" c="dimmed">
        The rider uses where you searched from. Add directions below.
      </Text>
    );
  }
  return (
    <Box>
      <Box
        ref={element}
        h={200}
        style={{ borderRadius: 8, overflow: 'hidden', zIndex: 0 }}
        data-testid="delivery-pin"
      />
      <Text size="xs" c="dimmed" mt={4}>
        Drag the pin, or tap the map, to your door.
      </Text>
    </Box>
  );
}
