// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Tabs } from '@mantine/core';
import { KenyaPharmacyDispense, KenyaPharmacyToday } from '@medplum/kenya-react';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { getConfig } from '../../config';

/**
 * The pharmacy workspace (pharmacy.<domain> lands here): Today (what is waiting) and Dispense
 * (one patient's medicines: safety checks, stock, label). Stock and Counter sale follow as tabs.
 * @returns The page.
 */
export function PharmacyPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  const tab = location.pathname.startsWith('/kenya/pharmacy/dispense') ? 'dispense' : 'today';
  const prescriptionIds = (search.get('rx') ?? '').split(',').filter(Boolean);
  const openDispense = (ids: string[]): void => {
    navigate(ids.length ? `/kenya/pharmacy/dispense?rx=${ids.join(',')}` : '/kenya/pharmacy/dispense')?.catch(
      console.error
    );
  };

  return (
    <Document>
      <Tabs
        value={tab}
        onChange={(value) => navigate(value === 'dispense' ? '/kenya/pharmacy/dispense' : '/kenya/pharmacy')?.catch(console.error)}
        mb="md"
      >
        <Tabs.List>
          <Tabs.Tab value="today">Today</Tabs.Tab>
          <Tabs.Tab value="dispense">Dispense</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {tab === 'today' ? (
        <KenyaPharmacyToday onOpenDispense={openDispense} />
      ) : (
        <KenyaPharmacyDispense
          prescriptionIds={prescriptionIds}
          servicesUrl={getConfig().afiaxServicesUrl}
          onPick={openDispense}
          onDone={() => navigate('/kenya/pharmacy')?.catch(console.error)}
        />
      )}
    </Document>
  );
}
