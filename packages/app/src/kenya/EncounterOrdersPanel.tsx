// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya encounter workspace (DHA FUNC-CPOE-001): place orders in every attested category, record
// vital signs (with BMI) and family history, set the visit type (e.g. MCH) and see the order history
// with each order's department status.

import {
  Alert,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaVitalSign } from '@medplum/core';
import {
  buildKenyaVitalSignObservations,
  calculateKenyaBmi,
  getKenyaBmiCategory,
  getProjectSettingString,
  KenyaEncounterTypes,
  KenyaEncounterTypeSystem,
  KenyaFamilyRelationships,
  KenyaVitalSigns,
  normalizeErrorString,
} from '@medplum/core';
import type { Coding, Encounter, FamilyMemberHistory, Patient, Reference } from '@medplum/fhirtypes';
import { KenyaOrderEntry, KenyaOrderHistory, KnhtsCodeInput } from '@medplum/kenya-react';
import { useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

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
          <VitalSigns encounter={encounter} />
        </Tabs.Panel>
        <Tabs.Panel value="family" pt="sm">
          <FamilyHistory encounter={encounter} />
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

function VitalSigns({ encounter }: EncounterOrdersPanelProps): JSX.Element {
  const medplum = useMedplum();
  const patient = useResource(encounter.subject as Reference<Patient>);
  const [readings, setReadings] = useState<Partial<Record<KenyaVitalSign['key'], number>>>({});
  const [saving, setSaving] = useState(false);
  const bmi = calculateKenyaBmi(readings.weight, readings.height);
  const isAdult = isAdultPatient(patient);

  function set(key: KenyaVitalSign['key'], value: number | string): void {
    setReadings((r) => ({ ...r, [key]: typeof value === 'number' ? value : undefined }));
  }

  async function save(): Promise<void> {
    const observations = buildKenyaVitalSignObservations(
      readings,
      {
        subject: encounter.subject as Reference<Patient>,
        encounter: { reference: `Encounter/${encounter.id}` },
        effectiveDateTime: new Date().toISOString(),
        performer: medplum.getProfile()
          ? [{ reference: `${medplum.getProfile()?.resourceType}/${medplum.getProfile()?.id}` }]
          : undefined,
      },
      isAdult
    );
    setSaving(true);
    try {
      for (const observation of observations) {
        await medplum.createResource(observation);
      }
      showNotification({ color: 'green', message: `${observations.length} vital-sign records saved` });
      setReadings({});
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, sm: 3 }}>
        {KenyaVitalSigns.map((v) => (
          <NumberInput
            key={v.key}
            label={`${v.display} (${v.unit})`}
            decimalScale={1}
            value={readings[v.key] ?? ''}
            onChange={(value) => set(v.key, value)}
          />
        ))}
      </SimpleGrid>
      {bmi !== undefined && (
        <Text data-testid="bmi">
          BMI: <b>{bmi}</b> kg/m²{isAdult ? ` (${getKenyaBmiCategory(bmi)})` : ' (use the growth chart for children)'}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Readings outside NEWS2 or critical limits raise a clinical alert on the patient record.
      </Text>
      <Group justify="flex-end">
        <Button
          onClick={() => save()}
          loading={saving}
          disabled={Object.values(readings).every((v) => v === undefined)}
        >
          Save vital signs
        </Button>
      </Group>
    </Stack>
  );
}

function isAdultPatient(patient: Patient | undefined): boolean {
  if (!patient?.birthDate) {
    return true;
  }
  const ageMs = Date.now() - new Date(patient.birthDate).getTime();
  return ageMs >= 18 * 365.25 * 24 * 60 * 60 * 1000;
}

function FamilyHistory({ encounter }: EncounterOrdersPanelProps): JSX.Element {
  const medplum = useMedplum();
  const [items, setItems] = useState<FamilyMemberHistory[]>([]);
  const [relationship, setRelationship] = useState<string | null>(null);
  const [condition, setCondition] = useState<Coding>();
  const [note, setNote] = useState('');
  const patientRef = encounter.subject?.reference as string;

  const load = useCallback(() => {
    medplum
      .searchResources('FamilyMemberHistory', { patient: patientRef, _sort: '-_lastUpdated' }, { cache: 'no-cache' })
      .then(setItems)
      .catch(console.error);
  }, [medplum, patientRef]);
  useEffect(load, [load]);

  function save(): void {
    const rel = KenyaFamilyRelationships.find((r) => r.code === relationship);
    if (!rel || !condition) {
      return;
    }
    medplum
      .createResource<FamilyMemberHistory>({
        resourceType: 'FamilyMemberHistory',
        status: 'completed',
        patient: encounter.subject as Reference<Patient>,
        date: new Date().toISOString().slice(0, 10),
        relationship: {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/v3-RoleCode', code: rel.code, display: rel.display },
          ],
          text: rel.display,
        },
        condition: [{ code: { coding: [condition], text: condition.display } }],
        note: note.trim() ? [{ text: note.trim() }] : undefined,
      })
      .then(() => {
        setRelationship(null);
        setCondition(undefined);
        setNote('');
        load();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  return (
    <Stack gap="sm">
      {items.length > 0 ? (
        <Table>
          <Table.Tbody>
            {items.map((item) => (
              <Table.Tr key={item.id}>
                <Table.Td>{item.relationship?.text}</Table.Td>
                <Table.Td>
                  {item.condition?.map((c) => c.code?.text ?? c.code?.coding?.[0]?.display).join(', ')}
                </Table.Td>
                <Table.Td>{item.note?.[0]?.text}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text c="dimmed">No family history recorded.</Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label="Relative"
          data={KenyaFamilyRelationships.map((r) => ({ value: r.code, label: r.display }))}
          value={relationship}
          onChange={setRelationship}
        />
        <KnhtsCodeInput kind="diagnosis" label="Condition (ICD-11)" value={condition} onChange={setCondition} />
      </SimpleGrid>
      <TextInput label="Note" value={note} onChange={(e) => setNote(e.currentTarget.value)} />
      <Group justify="flex-end">
        <Button onClick={save} disabled={!relationship || !condition}>
          Add family history
        </Button>
      </Group>
    </Stack>
  );
}
