// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya encounter workspace (DHA FUNC-CPOE-001): place orders in every attested category, record
// vital signs (with BMI) and family history, set the visit type (e.g. MCH) and see the order history
// with each order's department status.

import {
  Alert,
  Badge,
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
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaCdsAlert, KenyaOrderCategoryCode, KenyaVitalSign } from '@medplum/core';
import {
  buildKenyaVitalSignObservations,
  calculateKenyaBmi,
  findKenyaOrderCategory,
  formatDateTime,
  getKenyaBmiCategory,
  getKenyaOrderCategory,
  getProjectSettingString,
  KenyaDepartments,
  KenyaEncounterTypes,
  KenyaEncounterTypeSystem,
  KenyaFamilyRelationships,
  KenyaOrderCategories,
  KenyaVitalSigns,
  normalizeErrorString,
} from '@medplum/core';
import type {
  Coding,
  Encounter,
  FamilyMemberHistory,
  MedicationRequest,
  Parameters,
  Patient,
  Reference,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { CdsAlertList } from './CdsAlertList';
import { parseCdsAlerts } from './clinical-utils';
import type { KnhtsSearchKind } from './KnhtsCodeInput';
import { KnhtsCodeInput } from './KnhtsCodeInput';

export interface EncounterOrdersPanelProps {
  readonly encounter: Encounter;
}

const searchKindByCategory: Record<KenyaOrderCategoryCode, KnhtsSearchKind> = {
  medication: 'medication',
  laboratory: 'laboratory',
  radiology: 'radiology',
  physiotherapy: 'intervention',
  nutrition: 'intervention',
  'social-work': 'intervention',
  counselling: 'intervention',
};

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
          <PlaceOrder encounter={encounter} onPlaced={refresh} />
        </Tabs.Panel>
        <Tabs.Panel value="vitals" pt="sm">
          <VitalSigns encounter={encounter} />
        </Tabs.Panel>
        <Tabs.Panel value="family" pt="sm">
          <FamilyHistory encounter={encounter} />
        </Tabs.Panel>
        <Tabs.Panel value="history" pt="sm">
          <OrderHistory encounter={encounter} version={historyVersion} />
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

function PlaceOrder({ encounter, onPlaced }: EncounterOrdersPanelProps & { onPlaced: () => void }): JSX.Element {
  const medplum = useMedplum();
  const [categoryCode, setCategoryCode] = useState<KenyaOrderCategoryCode>('medication');
  const [code, setCode] = useState<Coding>();
  const [priority, setPriority] = useState<string>('routine');
  const [note, setNote] = useState('');
  const [dosage, setDosage] = useState('');
  const [quantity, setQuantity] = useState<number | string>('');
  const [duration, setDuration] = useState<number | string>('');
  // CDS alerts for the chosen medicine, keyed by its code so a stale result is never shown
  const [checked, setChecked] = useState<{ code: string; alerts: KenyaCdsAlert[] }>();
  const [override, setOverride] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const category = getKenyaOrderCategory(categoryCode);
  const isMedication = categoryCode === 'medication';

  // Check a medicine against the patient's record as soon as it is chosen (before it is signed)
  useEffect(() => {
    if (!isMedication || !code?.code) {
      return;
    }
    const draft: MedicationRequest = {
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: encounter.subject as MedicationRequest['subject'],
      medicationCodeableConcept: { coding: [code], text: code.display },
    };
    medplum
      .post<Parameters>(medplum.fhirUrl('MedicationRequest', '$cds-check'), draft)
      .then((result) => setChecked({ code: code.code as string, alerts: parseCdsAlerts(result) }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, encounter.subject, isMedication, code]);

  const alerts = isMedication && checked && checked.code === code?.code ? checked.alerts : undefined;
  const needsOverride = !!alerts?.some((a) => a.severity === 'high');
  const missing =
    !code || (isMedication && !dosage.trim()) || (needsOverride && override.trim().length < 10) || submitting;

  function reset(): void {
    setCode(undefined);
    setNote('');
    setDosage('');
    setQuantity('');
    setDuration('');
    setOverride('');
  }

  function submit(): void {
    if (!code || !category) {
      return;
    }
    const parameter: Parameters['parameter'] = [
      { name: 'category', valueCode: categoryCode },
      { name: 'code', valueCoding: code },
      { name: 'priority', valueCode: priority },
    ];
    if (note.trim()) {
      parameter.push({ name: 'note', valueString: note.trim() });
    }
    if (isMedication) {
      parameter.push({ name: 'dosageText', valueString: dosage.trim() });
      if (typeof quantity === 'number') {
        parameter.push({ name: 'quantity', valueDecimal: quantity });
      }
      if (typeof duration === 'number') {
        parameter.push({ name: 'durationDays', valueInteger: duration });
      }
      if (needsOverride) {
        parameter.push({ name: 'overrideReason', valueString: override.trim() });
      }
    }
    setSubmitting(true);
    medplum
      .post(medplum.fhirUrl('Encounter', encounter.id as string, '$kenya-order'), {
        resourceType: 'Parameters',
        parameter,
      })
      .then(() => {
        showNotification({
          color: 'green',
          message: `${category.display} order sent to ${KenyaDepartments[category.department]}`,
        });
        reset();
        onPlaced();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setSubmitting(false));
  }

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label="Order type"
          data={KenyaOrderCategories.map((c) => ({ value: c.code, label: c.display }))}
          value={categoryCode}
          onChange={(v) => {
            setCategoryCode((v as KenyaOrderCategoryCode) ?? 'medication');
            reset();
          }}
          allowDeselect={false}
        />
        <Select
          label="Priority"
          data={[
            { value: 'routine', label: 'Routine' },
            { value: 'urgent', label: 'Urgent' },
            { value: 'stat', label: 'STAT (immediately)' },
          ]}
          value={priority}
          onChange={(v) => setPriority(v ?? 'routine')}
          allowDeselect={false}
        />
      </SimpleGrid>
      <KnhtsCodeInput
        key={categoryCode}
        kind={searchKindByCategory[categoryCode]}
        label={isMedication ? 'Medicine (KNHTS HPT registry)' : `${category?.display} (KNHTS)`}
        required
        value={code}
        onChange={(value) => {
          setCode(value);
          setOverride('');
        }}
      />
      {isMedication && (
        <>
          <TextInput
            label="Dosage instructions"
            placeholder="e.g. 500 mg three times daily for 5 days"
            required
            value={dosage}
            onChange={(e) => setDosage(e.currentTarget.value)}
          />
          <SimpleGrid cols={2}>
            <NumberInput label="Quantity to dispense" min={1} value={quantity} onChange={setQuantity} />
            <NumberInput label="Duration (days)" min={1} value={duration} onChange={setDuration} />
          </SimpleGrid>
        </>
      )}
      <Textarea
        label="Clinical note"
        autosize
        minRows={1}
        value={note}
        onChange={(e) => setNote(e.currentTarget.value)}
      />
      {alerts && <CdsAlertList alerts={alerts} emptyText="No allergy, interaction or contraindication alerts." />}
      {needsOverride && (
        <Textarea
          label="Reason for prescribing despite the alert"
          description="Required for high-severity alerts (at least 10 characters). Recorded with the order."
          required
          value={override}
          onChange={(e) => setOverride(e.currentTarget.value)}
        />
      )}
      <Group justify="flex-end">
        <Button onClick={submit} disabled={missing} loading={submitting}>
          {needsOverride ? 'Override and place order' : 'Place order'}
        </Button>
      </Group>
    </Stack>
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

interface OrderRow {
  readonly order: ServiceRequest | MedicationRequest;
  readonly task?: Task;
}

function OrderHistory({ encounter, version }: EncounterOrdersPanelProps & { version: number }): JSX.Element {
  const medplum = useMedplum();
  const [rows, setRows] = useState<OrderRow[]>();

  useEffect(() => {
    const ref = `Encounter/${encounter.id}`;
    const options = { cache: 'no-cache' as const };
    Promise.all([
      medplum.searchResources('ServiceRequest', { encounter: ref, _count: '200' }, options),
      medplum.searchResources('MedicationRequest', { encounter: ref, _count: '200' }, options),
      medplum.searchResources('Task', { encounter: ref, _count: '200' }, options),
    ])
      .then(([services, medications, tasks]) => {
        const orders = [...services, ...medications].sort((a, b) =>
          (b.authoredOn ?? '').localeCompare(a.authoredOn ?? '')
        );
        setRows(
          orders.map((order) => ({
            order,
            task: tasks.find((t) => t.focus?.reference === `${order.resourceType}/${order.id}`),
          }))
        );
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, encounter.id, version]);

  if (!rows) {
    return <Text c="dimmed">Loading…</Text>;
  }
  if (rows.length === 0) {
    return <Text c="dimmed">No orders in this encounter yet.</Text>;
  }
  return (
    <Table striped data-testid="order-history">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Ordered</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Order</Table.Th>
          <Table.Th>Priority</Table.Th>
          <Table.Th>Department</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map(({ order, task }) => (
          <Table.Tr key={`${order.resourceType}/${order.id}`}>
            <Table.Td>{formatDateTime(order.authoredOn)}</Table.Td>
            <Table.Td>{findKenyaOrderCategory(order.category)?.display ?? order.resourceType}</Table.Td>
            <Table.Td>
              {order.resourceType === 'MedicationRequest'
                ? `${order.medicationCodeableConcept?.text ?? ''} — ${order.dosageInstruction?.[0]?.text ?? ''}`
                : order.code?.text}
            </Table.Td>
            <Table.Td>{order.priority}</Table.Td>
            <Table.Td>
              <Badge color={taskColor(task?.status)} variant="light">
                {task
                  ? `${task.performerType?.[0]?.text ?? ''}: ${task.businessStatus?.text ?? task.status}`
                  : order.status}
              </Badge>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function taskColor(status: Task['status'] | undefined): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'accepted':
    case 'in-progress':
      return 'blue';
    case 'cancelled':
    case 'rejected':
    case 'failed':
      return 'red';
    default:
      return 'gray';
  }
}
