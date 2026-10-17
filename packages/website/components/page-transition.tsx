// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import { usePathname } from 'next/navigation';
import type { JSX, ReactNode } from 'react';

export function PageTransition(props: { readonly children: ReactNode }): JSX.Element {
  const { children } = props;
  const pathname = usePathname();

  return (
    <div key={pathname} className="page-transition">
      {children}
    </div>
  );
}
