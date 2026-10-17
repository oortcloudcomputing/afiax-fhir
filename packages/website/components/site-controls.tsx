// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import type { BillingView } from '../lib/product-catalog';
import type { JSX } from 'react';
import type { ThemeMode } from './site-preferences-context';
import { useSitePreferences } from './use-site-preferences';

const billingLabels: Record<BillingView, string> = {
  hour: 'Hr',
  month: 'Month',
};

const themeLabels: Record<ThemeMode, string> = {
  light: 'Light',
  dark: 'Dark',
};

export function BillingViewToggle(props: { readonly label?: string }): JSX.Element {
  const { label = 'Billing view' } = props;
  const { billingView, setBillingView } = useSitePreferences();

  return (
    <div className="shell-control-group">
      <p className="shell-control-label">{label}</p>
      <div className="toggle-row" role="tablist" aria-label={label}>
        {(['hour', 'month'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={value === billingView ? 'toggle-chip is-active' : 'toggle-chip'}
            onClick={() => setBillingView(value)}
          >
            {billingLabels[value]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ThemeModeToggle(props: { readonly label?: string }): JSX.Element {
  const { label = 'Theme' } = props;
  const { themeMode, setThemeMode } = useSitePreferences();

  return (
    <div className="shell-control-group">
      <p className="shell-control-label">{label}</p>
      <div className="toggle-row" role="tablist" aria-label={label}>
        {(['light', 'dark'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className={value === themeMode ? 'toggle-chip is-active' : 'toggle-chip'}
            onClick={() => setThemeMode(value)}
          >
            {themeLabels[value]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function SiteShellControls(): JSX.Element {
  return (
    <div className="shell-controls">
      <ThemeModeToggle />
    </div>
  );
}
