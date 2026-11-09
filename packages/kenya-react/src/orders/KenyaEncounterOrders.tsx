// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Divider, Stack } from '@mantine/core';
import type { Encounter } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { KenyaOrderEntry } from './KenyaOrderEntry';
import { KenyaOrderHistory } from './KenyaOrderHistory';

/** Encounter statuses in which orders can be placed. */
const KenyaOrderableEncounterStatuses: readonly Encounter['status'][] = [
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
];

export interface KenyaEncounterOrdersProps {
  readonly encounter: Encounter;
}

/**
 * The encounter's orders: the order form while the visit is active, and the order history with each
 * department's status.
 * @param props - The component props.
 * @returns The orders section.
 */
export function KenyaEncounterOrders(props: KenyaEncounterOrdersProps): JSX.Element {
  const { encounter } = props;
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const active = KenyaOrderableEncounterStatuses.includes(encounter.status);
  return (
    <Stack gap="md" data-testid="kenya-encounter-orders">
      {active ? (
        <KenyaOrderEntry encounter={encounter} onPlaced={refresh} />
      ) : (
        <Alert color="gray">
          This encounter is {encounter.status}. Set it to in progress (or arrived) to place orders.
        </Alert>
      )}
      <Divider label="Orders in this encounter" labelPosition="left" />
      <KenyaOrderHistory encounter={encounter} version={version} />
    </Stack>
  );
}
