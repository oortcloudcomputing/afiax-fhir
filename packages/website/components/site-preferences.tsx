// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import type { BillingView } from '../lib/product-catalog';
import type { JSX, ReactNode } from 'react';
import { useEffect, useState } from 'react';

import { SitePreferencesContext } from './site-preferences-context';
import type { ThemeMode } from './site-preferences-context';

function getInitialThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'light';
  }

  const storedValue = window.localStorage.getItem('afiax-theme-mode');
  return storedValue === 'dark' ? 'dark' : 'light';
}

function getInitialBillingView(): BillingView {
  if (typeof window === 'undefined') {
    return 'month';
  }

  const storedValue = window.localStorage.getItem('afiax-billing-view');
  return storedValue === 'hour' ? 'hour' : 'month';
}

export function SitePreferencesProvider(props: { readonly children: ReactNode }): JSX.Element {
  const { children } = props;
  const [themeMode, setThemeMode] = useState<ThemeMode>(getInitialThemeMode);
  const [billingView, setBillingView] = useState<BillingView>(getInitialBillingView);

  useEffect(() => {
    document.documentElement.dataset.theme = themeMode;
    document.documentElement.style.colorScheme = themeMode;
    window.localStorage.setItem('afiax-theme-mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    window.localStorage.setItem('afiax-billing-view', billingView);
  }, [billingView]);

  return (
    <SitePreferencesContext.Provider
      value={{
        billingView,
        setBillingView,
        themeMode,
        setThemeMode,
      }}
    >
      {children}
    </SitePreferencesContext.Provider>
  );
}
