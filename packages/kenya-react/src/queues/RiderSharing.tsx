// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// While a rider is out with a delivery (ADR-016 §3b; decision 2026-11-23), the phone's position goes
// to the patient's map every 20 seconds, only while this screen is open and only for this delivery.

import { Alert, Group, Loader, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

/** How often the position is sent. */
const RiderShareMs = 20_000;

export interface RiderSharingProps {
  readonly onPosition: (position: { lat: number; lng: number }) => Promise<void>;
}

/**
 * Shares the phone's position while shown.
 * @param props - The component props.
 * @returns What is being shared, or why it cannot be.
 */
export function RiderSharing(props: RiderSharingProps): JSX.Element {
  const send = useRef(props.onPosition);
  useEffect(() => {
    send.current = props.onPosition;
  }, [props.onPosition]);
  const [state, setState] = useState<'starting' | 'sharing' | 'denied' | 'unavailable'>(() =>
    typeof navigator !== 'undefined' && navigator.geolocation ? 'starting' : 'unavailable'
  );

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      return undefined;
    }
    let last = 0;
    const watch = navigator.geolocation.watchPosition(
      (p) => {
        setState('sharing');
        if (Date.now() - last >= RiderShareMs) {
          last = Date.now();
          send.current({ lat: p.coords.latitude, lng: p.coords.longitude }).catch(() => undefined);
        }
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable'),
      { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30_000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  if (state === 'denied' || state === 'unavailable') {
    return (
      <Alert color="orange" variant="light" p="xs">
        {state === 'denied'
          ? 'Allow location for Afiax Provider so the patient can follow you. You can still deliver without it.'
          : 'This phone cannot share its location. The patient cannot follow you, but you can still deliver.'}
      </Alert>
    );
  }
  return (
    <Group gap="xs" wrap="nowrap">
      <Loader size="xs" type="dots" />
      <Text size="xs" c="dimmed">
        {state === 'sharing'
          ? 'Sharing your location with the patient while this screen is open.'
          : 'Finding your location…'}
      </Text>
    </Group>
  );
}
