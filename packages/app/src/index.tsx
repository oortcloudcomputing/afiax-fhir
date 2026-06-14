// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider, createTheme } from '@mantine/core';
import '@mantine/core/styles.css';
import { Notifications } from '@mantine/notifications';
import '@mantine/notifications/styles.css';
import '@mantine/spotlight/styles.css';
import { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router';
import { App } from './App';
import { getConfig } from './config';
import './index.css';

export async function initApp(): Promise<void> {
  const config = getConfig();

  const medplum = new MedplumClient({
    baseUrl: config.baseUrl,
    clientId: config.clientId,
    storagePrefix: '@medplum:',
    cacheTime: 60000,
    autoBatchTime: 100,
    onUnauthenticated: () => {
      if (window.location.pathname !== '/signin' && window.location.pathname !== '/oauth') {
        window.location.href = '/signin?next=' + encodeURIComponent(window.location.pathname + window.location.search);
      }
    },
  });

  // Afiax brand primary color: #1da7dd (cyan)
  // Scale generated from primary using Mantine's shade progression
  const afiaxCyan: [string, string, string, string, string, string, string, string, string, string] = [
    '#e8f8fd', // 0
    '#caeef9', // 1
    '#9adff3', // 2
    '#62cfec', // 3
    '#36c1e7', // 4
    '#1da7dd', // 5 — primary
    '#1490bf', // 6
    '#0d73a0', // 7
    '#095c80', // 8
    '#054560', // 9
  ];

  const theme = createTheme({
    primaryColor: 'afiaxCyan',
    colors: {
      afiaxCyan,
    },
    headings: {
      sizes: {
        h1: {
          fontSize: '1.125rem',
          fontWeight: '500',
          lineHeight: '2.0',
        },
      },
    },
    fontSizes: {
      xs: '0.6875rem',
      sm: '0.875rem',
      md: '0.875rem',
      lg: '1.0rem',
      xl: '1.125rem',
    },
  });

  const router = createBrowserRouter([{ path: '*', element: <App /> }]);

  const navigate = (path: string): Promise<void> => router.navigate(path);

  const root = createRoot(document.getElementById('root') as HTMLElement);
  root.render(
    <StrictMode>
      <MedplumProvider medplum={medplum} navigate={navigate}>
        <MantineProvider theme={theme}>
          <Notifications position="bottom-right" />
          <RouterProvider router={router} />
        </MantineProvider>
      </MedplumProvider>
    </StrictMode>
  );
}

if (process.env.NODE_ENV !== 'test') {
  initApp().catch(console.error);
}
