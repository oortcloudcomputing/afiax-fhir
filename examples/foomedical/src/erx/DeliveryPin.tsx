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
import { locateControl, pageGestures, pageMapOptions } from './map-gestures';
import { tileLayer } from './map-tiles';
import { PlaceSearchBox } from './PlaceSearchBox';
import type { PlaceSearch } from './places';
import type { Position } from './offers-api';

export interface DeliveryPinProps {
  readonly value: Position;
  readonly onChange: (position: Position) => void;
  /** Finds places by name, to move the pin there. */
  readonly search?: PlaceSearch;
}

/**
 * A map with one draggable pin.
 * @param props - The component props.
 * @returns The map, or a note when maps are not available here.
 */
export function DeliveryPin(props: DeliveryPinProps): JSX.Element {
  const { value, onChange, search } = props;
  const element = useRef<HTMLDivElement>(null);
  const change = useRef(onChange);
  const moveTo = useRef<(position: Position, zoom?: number) => void>(undefined);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!element.current || !MAP_AVAILABLE) {
      return undefined;
    }
    const m = L.map(element.current, { zoomControl: false, ...pageMapOptions }).setView([value.lat, value.lng], 16);
    tileLayer().addTo(m);
    L.control.zoom({ position: 'bottomright' }).addTo(m);
    const stopGestures = pageGestures(m);
    const pin = L.marker([value.lat, value.lng], {
      draggable: true,
      title: 'Your door',
      icon: L.divIcon({
        className: '',
        html: '<div style="transform:translate(-50%,-100%);font-size:28px;line-height:28px">📍</div>',
        iconSize: [0, 0],
      }),
    }).addTo(m);
    moveTo.current = (position, zoom) => {
      pin.setLatLng([position.lat, position.lng]);
      m.setView([position.lat, position.lng], zoom ?? Math.max(m.getZoom(), 16));
      change.current(position);
    };
    locateControl((position) => moveTo.current?.(position, 17)).addTo(m);
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
      stopGestures();
      moveTo.current = undefined;
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
      {search && (
        <Box mb="xs">
          <PlaceSearchBox
            search={search}
            placeholder="Search your estate, street or building"
            onPick={(place) => moveTo.current?.(place.position, 17)}
          />
        </Box>
      )}
      <Box
        ref={element}
        h={200}
        style={{ borderRadius: 8, overflow: 'hidden', zIndex: 0 }}
        data-testid="delivery-pin"
      />
      <Text size="xs" c="dimmed" mt={4}>
        Drag the pin, or tap the map, to your door. ◎ shows where you are.
      </Text>
    </Box>
  );
}
