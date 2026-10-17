// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import { createContext } from 'react';

import type { BillingView } from '../lib/product-catalog';

export type ThemeMode = 'light' | 'dark';

export interface SitePreferencesContextValue {
  readonly billingView: BillingView;
  readonly setBillingView: (value: BillingView) => void;
  readonly themeMode: ThemeMode;
  readonly setThemeMode: (value: ThemeMode) => void;
}

export const SitePreferencesContext = createContext<SitePreferencesContextValue | undefined>(undefined);
