// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import { createTheme, MantineProvider } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

import { SitePreferencesProvider } from '../components/site-preferences';
import { useSitePreferences } from '../components/use-site-preferences';

const theme = createTheme({
  primaryColor: 'brandBlue',
  defaultRadius: 'md',
  fontFamily: 'var(--font-sans), sans-serif',
  headings: {
    fontFamily: 'var(--font-serif), serif',
  },
  colors: {
    brandBlue: ['#e8f1fe', '#d2e3fc', '#a8c7fa', '#7baaf7', '#4c8bf5', '#1a73e8', '#185abc', '#174ea6', '#133c84', '#102f68'],
    brandGreen: ['#e7f6ec', '#cdebd6', '#9fd8b3', '#6bc48f', '#42b66e', '#2e9f55', '#228245', '#1c6938', '#16532d', '#114123'],
    brandRed: ['#fdeceb', '#facfcb', '#f6a6a0', '#f17b73', '#ee5a52', '#d93025', '#b3261e', '#8f1f19', '#731813', '#5b120f'],
  },
});

function ThemeAwareMantineProvider(props: { readonly children: ReactNode }): JSX.Element {
  const { children } = props;
  const { themeMode } = useSitePreferences();

  return (
    <MantineProvider theme={theme} defaultColorScheme="light" forceColorScheme={themeMode}>
      {children}
    </MantineProvider>
  );
}

export function Providers(props: { readonly children: ReactNode }): JSX.Element {
  const { children } = props;

  return (
    <SitePreferencesProvider>
      <ThemeAwareMantineProvider>{children}</ThemeAwareMantineProvider>
    </SitePreferencesProvider>
  );
}
