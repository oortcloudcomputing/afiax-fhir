// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

import type { DeliveryState } from '../lib/site-content';
import { MedplumStatusBadge } from './medplum-ui';

const labelMap: Record<DeliveryState, string> = {
  platform: 'Platform',
  market: 'Market',
  enterprise: 'Enterprise',
};

const colorMap: Record<DeliveryState, string> = {
  platform: 'teal',
  market: 'cyan',
  enterprise: 'yellow',
};

export function StatusBadge(props: { readonly state: DeliveryState }): JSX.Element {
  const { state } = props;
  return (
    <MedplumStatusBadge className={`status-badge status-${state}`} color={colorMap[state]} radius="xl" status={labelMap[state].toLowerCase()} />
  );
}
