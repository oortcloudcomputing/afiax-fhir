// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya encounter workspace (DHA FUNC-CPOE-001): place orders in every attested category, record
// vital signs (with BMI) and family history, set the visit type (e.g. MCH) and see the order history
// with each order's department status.

import { Alert, Group, Paper, Select, Tabs, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  getProjectSettingString,
  KenyaEncounterTypes,
  KenyaEncounterTypeSystem,
  normalizeErrorString,
} from '@medplum/core';
import type { Encounter } from '@medplum/fhirtypes';
import { KenyaFamilyHistory, KenyaOrderEntry, KenyaOrderHistory, KenyaVitalSignsForm } from '@medplum/kenya-react';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';

export interface EncounterOrdersPanelProps {
  readonly encounter: Encounter;
}

const activeStatuses = new Set<Encounter['status']>(['arrived', 'triaged', 'in-progress', 'onleave']);

export function EncounterOrdersPanel(props: EncounterOrdersPanelProps): JSX.Element | null {
  const medplum = useMedplum();
  if (!props.encounter.id || getProjectSettingString(medplum.getProject(), 'countryPack') !== 'kenya') {
    return null;
  }
  return <EncounterOrdersPanelContent {...props} />;
}

function EncounterOrdersPanelContent({ encounter }: EncounterOrdersPanelProps): JSX.Element {
  const [historyVersion, setHistoryVersion] = useState(0);
  const refresh = useCallback(() => setHistoryVersion((v) => v + 1), []);
  const active = activeStatuses.has(encounter.status);

  return (
    <Paper p="md" mb="md" withBorder data-testid="kenya-encounter-panel">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Clinical orders</Title>
        <VisitType encounter={encounter} />
      </Group>
      {!active && (
        <Alert color="gray" mb="sm">
          This encounter is {encounter.status}. Orders and vital signs can only be added to an active encounter.
        </Alert>
      )}
      <Tabs defaultValue={active ? 'order' : 'history'} keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="order" disabled={!active}>
            Place order
          </Tabs.Tab>
          <Tabs.Tab value="vitals" disabled={!active}>
            Vital signs
          </Tabs.Tab>
          <Tabs.Tab value="family">Family history</Tabs.Tab>
          <Tabs.Tab value="history">Order history</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="order" pt="sm">
          <KenyaOrderEntry encounter={encounter} onPlaced={refresh} />
        </Tabs.Panel>
        <Tabs.Panel value="vitals" pt="sm">
          <KenyaVitalSignsForm encounter={encounter} />
        </Tabs.Panel>
        <Tabs.Panel value="family" pt="sm">
          <KenyaFamilyHistory encounter={encounter} />
        </Tabs.Panel>
        <Tabs.Panel value="history" pt="sm">
          <KenyaOrderHistory encounter={encounter} version={historyVersion} />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}

function VisitType({ encounter }: EncounterOrdersPanelProps): JSX.Element {
  const medplum = useMedplum();
  const current = encounter.type
    ?.flatMap((t) => t.coding ?? [])
    .find((c) => c.system === KenyaEncounterTypeSystem)?.code;
  const [value, setValue] = useState<string | null>(current ?? null);

  function change(code: string | null): void {
    const type = KenyaEncounterTypes.find((t) => t.code === code);
    if (!type) {
      return;
    }
    setValue(code);
    const others = (encounter.type ?? []).filter((t) => !t.coding?.some((c) => c.system === KenyaEncounterTypeSystem));
    medplum
      .updateResource<Encounter>({
        ...encounter,
        type: [...others, { coding: [{ system: KenyaEncounterTypeSystem, ...type }], text: type.display }],
      })
      .then(() => showNotification({ color: 'green', message: `Visit type set to ${type.display}` }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  return (
    <Select
      aria-label="Visit type"
      placeholder="Visit type"
      w={280}
      data={KenyaEncounterTypes.map((t) => ({ value: t.code, label: t.display }))}
      value={value}
      onChange={change}
    />
  );
}
