// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Metadata } from 'next';
import localFont from 'next/font/local';
import type { JSX, ReactNode } from 'react';

import { SiteShell } from '../components/site-shell';
import { Providers } from './providers';

import '@mantine/core/styles.css';
import '@medplum/react/styles.css';
import './globals.css';

const sansFont = localFont({
  src: './fonts/UbuntuSans.ttf',
  variable: '--font-sans',
});

const serifFont = localFont({
  src: [
    {
      path: './fonts/C059-Roman.otf',
      weight: '400',
      style: 'normal',
    },
    {
      path: './fonts/C059-Bold.otf',
      weight: '700',
      style: 'normal',
    },
  ],
  variable: '--font-serif',
});

// eslint-disable-next-line react-refresh/only-export-components
export const metadata: Metadata = {
  title: 'Afiax Enterprise',
  description:
    'Pan-African digital health infrastructure built on a canonical FHIR core, country-pack market services, and enterprise healthcare operations.',
};

export default function RootLayout(props: { readonly children: ReactNode }): JSX.Element {
  const { children } = props;

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${sansFont.variable} ${serifFont.variable}`} suppressHydrationWarning>
        <Providers>
          <SiteShell>{children}</SiteShell>
        </Providers>
      </body>
    </html>
  );
}
