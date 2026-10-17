// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

import type { Metric } from '../lib/site-content';
import { InfoBar, InfoBarEntry, InfoBarKey, InfoBarValue } from './medplum-ui';

export function MetricStrip(props: { readonly items: readonly Metric[] }): JSX.Element {
  const { items } = props;

  return (
    <div className="metric-strip">
      <InfoBar>
        {items.map((item) => (
          <InfoBarEntry key={item.label}>
            <InfoBarKey>{item.label}</InfoBarKey>
            <InfoBarValue>{item.value}</InfoBarValue>
          </InfoBarEntry>
        ))}
      </InfoBar>
    </div>
  );
}
