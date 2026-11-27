// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The pharmacy workspace's Today view: what is waiting at the pharmacy right now. One card per patient
// visit with its medicines, how long the patient has waited (amber after 15 minutes, red after 30),
// start preparing and dispense (one medicine or all; dispensing goes through $kenya-dispense, which
// checks the prescription on the server), the prescription-code lookup, and what was dispensed today.

import { Badge, Button, Group, Paper, SegmentedControl, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { calculateAgeString, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Bundle, MedicationDispense, MedicationRequest, Patient } from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmButton } from '../common/ConfirmButton';
import { KenyaPrescriptionLookup } from '../queues/KenyaPrescriptionLookup';
import type { QueueItem } from '../queues/queue-items';
import { acceptQueueTask, completeQueueItem, loadQueueItems, queuePatientName } from '../queues/queue-items';
import type { PharmacyOrderGroup, PharmacyWaitLevel } from './pharmacy-today';
import { formatWait, groupPharmacyOrders, startOfToday, summarisePharmacyToday } from './pharmacy-today';

/** How often Today reloads, so new orders appear without refreshing. */
const TodayRefreshMs = 30_000;

const waitColor: Record<PharmacyWaitLevel, string> = { ok: 'gray', long: 'orange', 'very-long': 'red' };

type Filter = 'all' | 'new' | 'preparing';

interface DispensedToday {
  readonly dispense: MedicationDispense;
  readonly patient?: Patient;
}

export interface KenyaPharmacyTodayProps {
  /** How often to reload, in milliseconds (tests set it). */
  readonly refreshMs?: number;
  /**
   * When set, Dispense opens the Dispense tab with these prescriptions (safety checks, stock,
   * label) instead of dispensing from the card.
   */
  readonly onOpenDispense?: (prescriptionIds: string[]) => void;
}

/**
 * The pharmacy's Today view.
 * @param props - The component props.
 * @returns The view.
 */
export function KenyaPharmacyToday(props: KenyaPharmacyTodayProps): JSX.Element {
  const refreshMs = props.refreshMs ?? TodayRefreshMs;
  const medplum = useMedplum();
  const [items, setItems] = useState<QueueItem[]>();
  const [dispensed, setDispensed] = useState<DispensedToday[]>();
  const [loadedAt, setLoadedAt] = useState<string>();
  const [now, setNow] = useState(() => new Date());
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState<string>();

  const load = useCallback(() => {
    const at = new Date();
    Promise.all([loadQueueItems(medplum, 'pharmacy'), loadDispensedToday(medplum, at)])
      .then(([open, done]) => {
        setItems(open);
        setDispensed(done);
        setNow(at);
        setLoadedAt(at.toISOString());
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum]);
  useEffect(load, [load]);
  useEffect(() => {
    const reload = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        load();
      }
    }, refreshMs);
    // Waiting times move on between reloads
    const tick = setInterval(() => setNow(new Date()), 60_000);
    return () => {
      clearInterval(reload);
      clearInterval(tick);
    };
  }, [load, refreshMs]);

  async function run(key: string, work: () => Promise<unknown>, done: string): Promise<void> {
    setBusy(key);
    try {
      await work();
      showNotification({ color: 'green', message: done });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setBusy(undefined);
      load();
    }
  }

  const startPreparing = (group: PharmacyOrderGroup): Promise<void> =>
    run(
      group.key,
      async () => {
        for (const item of group.items.filter((i) => i.task.status === 'requested')) {
          await acceptQueueTask(medplum, item.task);
        }
      },
      'Preparing'
    );

  const dispenseItems = (key: string, lines: readonly QueueItem[]): Promise<void> =>
    run(
      key,
      async () => {
        // One at a time: the first refusal (expired, already filled, ...) stops the rest
        for (const item of lines) {
          await completeQueueItem(medplum, item, 'Dispensed');
        }
      },
      lines.length > 1 ? `Dispensed ${lines.length} medicines` : 'Dispensed'
    );

  const groups = items ? groupPharmacyOrders(items, now) : undefined;
  const summary = groups ? summarisePharmacyToday(groups) : undefined;
  const shown = groups?.filter((g) => filter === 'all' || g.stage === filter);

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Today</Title>
        <Group gap="xs">
          {loadedAt && (
            <Text size="xs" c="dimmed">
              Updated {formatDateTime(loadedAt)} · refreshes every {Math.round(refreshMs / 1000)} seconds
            </Text>
          )}
          <Button size="xs" variant="default" onClick={load}>
            Refresh
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, sm: 4 }} data-testid="pharmacy-today-summary">
        <SummaryTile label="New" value={summary?.newOrders} />
        <SummaryTile label="Being prepared" value={summary?.preparing} />
        <SummaryTile
          label="Waiting 15+ min"
          value={summary?.waitingLong}
          color={summary?.waitingLong ? 'orange' : undefined}
        />
        <SummaryTile label="Dispensed today" value={dispensed?.length} />
      </SimpleGrid>

      <KenyaPrescriptionLookup
        onDispensed={load}
        onOpen={props.onOpenDispense ? (p) => props.onOpenDispense?.([p.id as string]) : undefined}
      />

      <SegmentedControl
        value={filter}
        onChange={(value) => setFilter(value as Filter)}
        data={[
          { value: 'all', label: `All (${groups?.length ?? 0})` },
          { value: 'new', label: `New (${summary?.newOrders ?? 0})` },
          { value: 'preparing', label: `Being prepared (${summary?.preparing ?? 0})` },
        ]}
      />

      {!items && <Text c="dimmed">Loading…</Text>}
      {shown?.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">
            {groups?.length ? 'Nothing in this view.' : 'No one is waiting. New prescriptions appear here.'}
          </Text>
        </Paper>
      )}
      {shown?.map((group) => (
        <OrderCard
          key={group.key}
          group={group}
          busy={busy === group.key}
          disabled={!!busy}
          onStart={() => startPreparing(group)}
          onDispense={(lines, key) => dispenseItems(key, lines)}
          onOpenDispense={props.onOpenDispense}
        />
      ))}

      {dispensed && dispensed.length > 0 && (
        <Stack gap="xs">
          <Title order={4}>Dispensed today</Title>
          <Paper withBorder>
            <Table striped data-testid="pharmacy-dispensed-today">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Time</Table.Th>
                  <Table.Th>Patient</Table.Th>
                  <Table.Th>Medicine</Table.Th>
                  <Table.Th>Quantity</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {dispensed.map(({ dispense, patient }) => (
                  <Table.Tr key={dispense.id}>
                    <Table.Td>
                      {new Date(dispense.whenHandedOver ?? '').toLocaleTimeString('en-KE', {
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </Table.Td>
                    <Table.Td>{patient ? <MedplumLink to={patient}>{queuePatientName(patient)}</MedplumLink> : '—'}</Table.Td>
                    <Table.Td>
                      {dispense.medicationCodeableConcept?.text ??
                        dispense.medicationCodeableConcept?.coding?.[0]?.display ??
                        'Medicine'}
                    </Table.Td>
                    <Table.Td>
                      {dispense.quantity?.value ?? ''} {dispense.quantity?.unit ?? ''}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Paper>
        </Stack>
      )}
    </Stack>
  );
}

function SummaryTile(props: { readonly label: string; readonly value?: number; readonly color?: string }): JSX.Element {
  return (
    <Paper withBorder p="sm">
      <Text size="xs" c="dimmed">
        {props.label}
      </Text>
      <Text fz={28} fw={600} c={props.color}>
        {props.value ?? '–'}
      </Text>
    </Paper>
  );
}

interface OrderCardProps {
  readonly group: PharmacyOrderGroup;
  readonly busy: boolean;
  readonly disabled: boolean;
  readonly onStart: () => void;
  readonly onDispense: (lines: readonly QueueItem[], key: string) => void;
  readonly onOpenDispense?: (prescriptionIds: string[]) => void;
}

function OrderCard(props: OrderCardProps): JSX.Element {
  const { group, busy, disabled, onStart, onDispense, onOpenDispense } = props;
  const open = (lines: readonly QueueItem[]): void =>
    onOpenDispense?.(lines.map((l) => l.order?.id).filter((id): id is string => !!id));
  const patient = group.items.find((i) => i.patient)?.patient;
  const medicines = group.items.filter((i) => i.order?.resourceType === 'MedicationRequest');
  const patientText = patient ? queuePatientName(patient) : 'the patient';
  const sexAge = patient ? describePatient(patient) : undefined;

  return (
    <Paper withBorder p="md" data-testid="pharmacy-order">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap" align="flex-start">
          <div>
            <Group gap="xs">
              <Text fw={600}>{patient ? <MedplumLink to={patient}>{patientText}</MedplumLink> : 'Unknown patient'}</Text>
              {group.priority !== 'routine' && <Badge color="red">{group.priority}</Badge>}
              <Badge variant="light" color={group.stage === 'new' ? 'blue' : 'teal'}>
                {group.stage === 'new' ? 'New' : 'Being prepared'}
              </Badge>
            </Group>
            {sexAge && (
              <Text size="xs" c="dimmed">
                {sexAge}
              </Text>
            )}
          </div>
          <Badge size="lg" variant="light" color={waitColor[group.waitLevel]} title="Waiting since ordered">
            Waiting {formatWait(group.waitMinutes)}
          </Badge>
        </Group>

        <Stack gap={6}>
          {group.items.map((item) => {
            const request = item.order?.resourceType === 'MedicationRequest' ? item.order : undefined;
            return (
              <Group key={item.task.id} justify="space-between" wrap="nowrap">
                <div>
                  <Text size="sm">
                    {item.order ? <MedplumLink to={item.order}>{lineName(item)}</MedplumLink> : lineName(item)}
                  </Text>
                  {request && (
                    <Text size="xs" c="dimmed">
                      {lineDetail(request)}
                    </Text>
                  )}
                </div>
                {request && group.items.length > 1 && onOpenDispense && (
                  <Button size="xs" variant="subtle" disabled={disabled} onClick={() => open([item])}>
                    Dispense this
                  </Button>
                )}
                {request && group.items.length > 1 && !onOpenDispense && (
                  <ConfirmButton
                    size="xs"
                    variant="subtle"
                    disabled={disabled}
                    title="Dispense medicine"
                    confirmLabel="Dispense"
                    message={`Record that ${lineName(item)} was handed to ${patientText}?`}
                    onConfirm={() => onDispense([item], group.key)}
                  >
                    Dispense this
                  </ConfirmButton>
                )}
              </Group>
            );
          })}
        </Stack>

        <Group gap="xs" justify="flex-end">
          {group.stage === 'new' && (
            <Button size="xs" variant="light" onClick={onStart} loading={busy} disabled={disabled && !busy}>
              Start preparing
            </Button>
          )}
          {medicines.length > 0 && onOpenDispense && (
            <Button size="xs" disabled={disabled} onClick={() => open(medicines)}>
              {medicines.length > 1 ? `Dispense all (${medicines.length})` : 'Dispense'}
            </Button>
          )}
          {medicines.length > 0 && !onOpenDispense && (
            <ConfirmButton
              size="xs"
              loading={busy}
              disabled={disabled && !busy}
              title="Dispense"
              confirmLabel="Dispense"
              message={`Record that ${medicines.map(lineName).join(', ')} ${
                medicines.length > 1 ? 'were' : 'was'
              } handed to ${patientText}? This cannot be undone from here.`}
              onConfirm={() => onDispense(medicines, group.key)}
            >
              {medicines.length > 1 ? `Dispense all (${medicines.length})` : 'Dispense'}
            </ConfirmButton>
          )}
        </Group>
      </Stack>
    </Paper>
  );
}

function lineName(item: QueueItem): string {
  const request = item.order?.resourceType === 'MedicationRequest' ? item.order : undefined;
  return (
    item.task.description ??
    request?.medicationCodeableConcept?.text ??
    request?.medicationCodeableConcept?.coding?.[0]?.display ??
    'Order'
  );
}

function lineDetail(request: MedicationRequest): string {
  const quantity = request.dispenseRequest?.quantity;
  return [
    request.dosageInstruction?.[0]?.text,
    quantity?.value !== undefined ? `qty ${quantity.value}${quantity.unit ? ' ' + quantity.unit : ''}` : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function describePatient(patient: Patient): string | undefined {
  const sexes: Record<string, string> = { female: 'Female', male: 'Male' };
  const age = patient.birthDate ? calculateAgeString(patient.birthDate) : undefined;
  return [sexes[patient.gender ?? ''], age].filter(Boolean).join(', ') || undefined;
}

async function loadDispensedToday(
  medplum: ReturnType<typeof useMedplum>,
  now: Date
): Promise<DispensedToday[]> {
  const bundle: Bundle = await medplum.search(
    'MedicationDispense',
    new URLSearchParams([
      ['status', 'completed'],
      ['whenhandedover', `ge${startOfToday(now)}`],
      ['_sort', '-whenhandedover'],
      ['_count', '100'],
      ['_include', 'MedicationDispense:patient'],
    ]),
    { cache: 'no-cache' }
  );
  const patients = new Map<string, Patient>();
  for (const entry of bundle.entry ?? []) {
    if (entry.resource?.resourceType === 'Patient') {
      patients.set(`Patient/${entry.resource.id}`, entry.resource);
    }
  }
  return (bundle.entry ?? [])
    .filter((e) => e.resource?.resourceType === 'MedicationDispense')
    // A chemist outside the facility (Afiax Prescription Network) also records its fill here, with
    // itself as an Organization performer: not this pharmacy's work
    .filter((e) => !(e.resource as MedicationDispense).performer?.some((p) => p.actor?.type === 'Organization'))
    .map((e) => {
      const dispense = e.resource as MedicationDispense;
      return { dispense, patient: patients.get(dispense.subject?.reference ?? '') };
    });
}
