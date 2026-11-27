// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaPharmacyToday } from '@medplum/kenya-react';
import { Document } from '@medplum/react';
import type { JSX } from 'react';

/**
 * The pharmacy workspace (pharmacy.<domain> lands here): Today, what is waiting at the pharmacy.
 * Dispense, Stock and Counter sale follow as tabs.
 * @returns The page.
 */
export function PharmacyPage(): JSX.Element {
  return (
    <Document>
      <KenyaPharmacyToday />
    </Document>
  );
}
