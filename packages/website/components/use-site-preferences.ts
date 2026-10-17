// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import { useContext } from 'react';

import { SitePreferencesContext } from './site-preferences-context';
import type { SitePreferencesContextValue } from './site-preferences-context';

export function useSitePreferences(): SitePreferencesContextValue {
  const context = useContext(SitePreferencesContext);

  if (!context) {
    throw new Error('useSitePreferences must be used within SitePreferencesProvider');
  }

  return context;
}
