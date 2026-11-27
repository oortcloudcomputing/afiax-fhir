// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Tabs } from '@mantine/core';
import { KenyaPharmacyCounter, KenyaPharmacyDispense, KenyaPharmacyStock, KenyaPharmacyToday } from '@medplum/kenya-react';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import { getConfig } from '../../config';

const PharmacyTabs = ['today', 'dispense', 'stock', 'counter'] as const;

/**
 * The pharmacy workspace (pharmacy.<domain> lands here): Today (what is waiting), Dispense
 * (one patient's medicines: safety checks, stock, label), Stock (the dispensary, read-only from
 * ERPNext) and Counter sale (over-the-counter medicines, recorded in ERPNext).
 * @returns The page.
 */
export function PharmacyPage(): JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const [search] = useSearchParams();
  const tab = PharmacyTabs.find((t) => t !== 'today' && location.pathname.startsWith(`/kenya/pharmacy/${t}`)) ?? 'today';
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
        onChange={(value) => navigate(value && value !== 'today' ? `/kenya/pharmacy/${value}` : '/kenya/pharmacy')?.catch(console.error)}
        mb="md"
      >
        <Tabs.List>
          <Tabs.Tab value="today">Today</Tabs.Tab>
          <Tabs.Tab value="dispense">Dispense</Tabs.Tab>
          <Tabs.Tab value="stock">Stock</Tabs.Tab>
          <Tabs.Tab value="counter">Counter sale</Tabs.Tab>
        </Tabs.List>
      </Tabs>
      {tab === 'today' && <KenyaPharmacyToday onOpenDispense={openDispense} />}
      {tab === 'stock' && <KenyaPharmacyStock servicesUrl={getConfig().afiaxServicesUrl} />}
      {tab === 'counter' && <KenyaPharmacyCounter servicesUrl={getConfig().afiaxServicesUrl} />}
      {tab === 'dispense' && (
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
