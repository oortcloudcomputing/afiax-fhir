// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { ActionIcon, Badge, Button, Card, Checkbox, Group, Modal, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaClinicHours, KenyaHoursRange, KenyaVisitType, KenyaWeekday, WithId } from '@medplum/core';
import {
  buildKenyaSchedulingParameters,
  checkKenyaClinicHours,
  createReference,
  formatDateTime,
  formatHumanName,
  getKenyaClinicHours,
  getReferenceString,
  KenyaDefaultTimeZone,
  KenyaVisitTypes,
  KenyaVisitTypeSystem,
  KenyaWeekdays,
  normalizeErrorString,
  SchedulingParametersUrl,
  summariseKenyaClinicHours,
  TimeZoneExtensionUrl,
} from '@medplum/core';
import type { Bundle, Practitioner, Schedule, Slot } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

const dayLabel: Record<KenyaWeekday, string> = {
  mon: 'Monday',
  tue: 'Tuesday',
  wed: 'Wednesday',
  thu: 'Thursday',
  fri: 'Friday',
  sat: 'Saturday',
  sun: 'Sunday',
};

const defaultHours: KenyaClinicHours = {
  days: Object.fromEntries(
    (['mon', 'tue', 'wed', 'thu', 'fri'] as KenyaWeekday[]).map((d) => [
      d,
      [
        { start: '08:00', end: '13:00' },
        { start: '14:00', end: '17:00' },
      ],
    ])
  ),
  slotMinutes: 20,
  bufferMinutes: 0,
  visitTypes: ['in-person'],
  timeZone: KenyaDefaultTimeZone,
};

interface Row {
  practitioner: WithId<Practitioner>;
  schedule?: WithId<Schedule>;
  hours?: KenyaClinicHours;
  /** Free appointments in the next 7 days (first kind of visit), from Schedule/$find. */
  free?: number;
  leave: WithId<Slot>[];
}

/**
 * Clinic hours (ADR-018 §B): each practitioner's weekly working hours, appointment length and the
 * kinds of visit they take, and their leave. Patients book into these hours (Schedule/$find,
 * Appointment/$book).
 * @returns The clinic hours page.
 */
export function ClinicHoursPage(): JSX.Element {
  const medplum = useMedplum();
  const [rows, setRows] = useState<Row[]>();
  const [editing, setEditing] = useState<Row>();
  const [onLeave, setOnLeave] = useState<Row>();

  const fetchRows = useCallback(async (): Promise<Row[]> => {
    const practitioners = await medplum.searchResources('Practitioner', { _count: '200', _sort: 'name' }, { cache: 'no-cache' });
    const schedules = await medplum.searchResources('Schedule', { _count: '500' }, { cache: 'no-cache' });
    const now = new Date();
    const weekAhead = new Date(now.getTime() + 7 * 24 * 3600_000);
    return Promise.all(
      practitioners.map(async (practitioner): Promise<Row> => {
        const schedule = schedules.find((s) => s.actor?.some((a) => a.reference === getReferenceString(practitioner)));
        const hours = schedule ? getKenyaClinicHours(schedule) : undefined;
        let free: number | undefined;
        let leave: WithId<Slot>[] = [];
        if (schedule && hours) {
          const type = encodeURIComponent(`${KenyaVisitTypeSystem}|${hours.visitTypes[0] ?? 'in-person'}`);
          const bundle = await medplum
            .get<Bundle<Slot>>(
              medplum.fhirUrl('Schedule', schedule.id, '$find') +
                `?start=${now.toISOString()}&end=${weekAhead.toISOString()}&_count=500&service-type=${type}`,
              { cache: 'no-cache' }
            )
            .catch(() => undefined);
          free = bundle?.entry?.length;
          leave = await medplum.searchResources(
            'Slot',
            { schedule: getReferenceString(schedule), status: 'busy-unavailable', end: `ge${now.toISOString()}`, _sort: 'start' },
            { cache: 'no-cache' }
          );
        }
        return { practitioner, schedule, hours, free, leave };
      })
    );
  }, [medplum]);

  const reload = useCallback(async (): Promise<void> => setRows(await fetchRows()), [fetchRows]);

  useEffect(() => {
    fetchRows()
      .then(setRows)
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [fetchRows]);

  return (
    <Document>
      <Title order={2}>Clinic hours</Title>
      <Text c="dimmed" mb="md">
        Each practitioner’s working hours and leave. Patients book appointments into these hours.
      </Text>
      {rows === undefined ? <Text c="dimmed">Loading…</Text> : null}
      {rows?.length === 0 ? <Text c="dimmed">No practitioners in this facility yet.</Text> : null}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        {rows?.map((row) => (
          <Card key={row.practitioner.id} withBorder padding="md">
            <Group justify="space-between" align="flex-start">
              <div>
                <Text fw={700}>{row.practitioner.name?.[0] ? formatHumanName(row.practitioner.name[0]) : 'Practitioner'}</Text>
                <Text size="sm" c={row.hours ? undefined : 'dimmed'}>
                  {row.hours ? summariseKenyaClinicHours(row.hours) : 'No clinic hours yet'}
                </Text>
                {row.hours ? (
                  <Group gap={4} mt={4}>
                    {row.hours.visitTypes.map((v) => (
                      <Badge key={v} size="xs" variant="light">
                        {KenyaVisitTypes[v]}
                      </Badge>
                    ))}
                  </Group>
                ) : null}
              </div>
              {row.free !== undefined ? (
                <Badge color={row.free ? 'green' : 'gray'} size="lg" variant="light">
                  {row.free} free in 7 days
                </Badge>
              ) : null}
            </Group>
            {row.leave.length ? (
              <Text size="sm" c="orange" mt="xs">
                Leave: {row.leave.map((l) => `${formatDateTime(l.start)} – ${formatDateTime(l.end)}${l.comment ? ` (${l.comment})` : ''}`).join('; ')}
              </Text>
            ) : null}
            <Group mt="md" gap="xs">
              <Button size="xs" onClick={() => setEditing(row)}>
                {row.hours ? 'Edit hours' : 'Set hours'}
              </Button>
              <Button size="xs" variant="light" disabled={!row.schedule} onClick={() => setOnLeave(row)}>
                Leave
              </Button>
            </Group>
          </Card>
        ))}
      </SimpleGrid>
      {editing ? (
        <HoursDialog
          row={editing}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await reload();
          }}
        />
      ) : null}
      {onLeave ? <LeaveDialog row={onLeave} onClose={() => setOnLeave(undefined)} onSaved={reload} /> : null}
    </Document>
  );
}

function HoursDialog(props: { readonly row: Row; readonly onClose: () => void; readonly onSaved: () => Promise<void> }): JSX.Element {
  const medplum = useMedplum();
  const [hours, setHours] = useState<KenyaClinicHours>(props.row.hours ?? defaultHours);
  const [busy, setBusy] = useState(false);
  const problems = checkKenyaClinicHours(hours);

  const setDay = (day: KenyaWeekday, ranges: KenyaHoursRange[]): void => setHours((h) => ({ ...h, days: { ...h.days, [day]: ranges } }));

  async function save(): Promise<void> {
    setBusy(true);
    try {
      const { practitioner, schedule } = props.row;
      // $find and $book read the time zone from the practitioner
      if (!practitioner.extension?.some((e) => e.url === TimeZoneExtensionUrl)) {
        await medplum.updateResource<Practitioner>({
          ...practitioner,
          extension: [...(practitioner.extension ?? []), { url: TimeZoneExtensionUrl, valueCode: hours.timeZone }],
        });
      }
      const extension = [...(schedule?.extension ?? []).filter((e) => e.url !== SchedulingParametersUrl), buildKenyaSchedulingParameters(hours)];
      if (schedule) {
        await medplum.updateResource<Schedule>({ ...schedule, active: true, extension });
      } else {
        await medplum.createResource<Schedule>({ resourceType: 'Schedule', active: true, actor: [createReference(practitioner)], extension });
      }
      showNotification({ color: 'green', message: 'Clinic hours saved' });
      await props.onSaved();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened onClose={props.onClose} size="lg" title={`Clinic hours: ${props.row.practitioner.name?.[0] ? formatHumanName(props.row.practitioner.name[0]) : ''}`}>
      <Stack>
        {KenyaWeekdays.map((day) => {
          const ranges = hours.days[day] ?? [];
          return (
            <Group key={day} align="flex-start" wrap="nowrap">
              <Checkbox
                w={120}
                mt={6}
                label={dayLabel[day]}
                checked={ranges.length > 0}
                onChange={(e) => setDay(day, e.currentTarget.checked ? [{ start: '08:00', end: '17:00' }] : [])}
              />
              <Stack gap={4} style={{ flex: 1 }}>
                {ranges.map((r, i) => (
                  <Group key={`${day}-${i}`} gap="xs" wrap="nowrap">
                    <TextInput
                      type="time"
                      size="xs"
                      value={r.start}
                      onChange={(e) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, start: e.currentTarget.value } : x)))}
                    />
                    <Text size="sm">to</Text>
                    <TextInput
                      type="time"
                      size="xs"
                      value={r.end}
                      onChange={(e) => setDay(day, ranges.map((x, j) => (j === i ? { ...x, end: e.currentTarget.value } : x)))}
                    />
                    <ActionIcon variant="subtle" color="gray" aria-label="Remove" onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}>
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Group>
                ))}
                {ranges.length ? (
                  <Button
                    size="compact-xs"
                    variant="subtle"
                    leftSection={<IconPlus size={14} />}
                    w="fit-content"
                    onClick={() => setDay(day, [...ranges, { start: '14:00', end: '17:00' }])}
                  >
                    Add time
                  </Button>
                ) : null}
              </Stack>
            </Group>
          );
        })}
        <Group grow>
          <Select
            label="Appointment length"
            data={['10', '15', '20', '30', '45', '60'].map((v) => ({ value: v, label: `${v} minutes` }))}
            value={String(hours.slotMinutes)}
            onChange={(v) => v && setHours((h) => ({ ...h, slotMinutes: Number(v) }))}
          />
          <Select
            label="Gap after each"
            data={['0', '5', '10', '15'].map((v) => ({ value: v, label: v === '0' ? 'None' : `${v} minutes` }))}
            value={String(hours.bufferMinutes)}
            onChange={(v) => v && setHours((h) => ({ ...h, bufferMinutes: Number(v) }))}
          />
        </Group>
        <Checkbox.Group
          label="Kinds of visit"
          value={[...hours.visitTypes]}
          onChange={(v) => setHours((h) => ({ ...h, visitTypes: v as KenyaVisitType[] }))}
        >
          <Group mt={4}>
            {(Object.keys(KenyaVisitTypes) as KenyaVisitType[]).map((v) => (
              <Checkbox key={v} value={v} label={KenyaVisitTypes[v]} />
            ))}
          </Group>
        </Checkbox.Group>
        {problems.length ? (
          <Stack gap={2}>
            {problems.map((p) => (
              <Text key={p} size="sm" c="red">
                {p}
              </Text>
            ))}
          </Stack>
        ) : null}
        <Button loading={busy} disabled={problems.length > 0} onClick={() => save()}>
          Save clinic hours
        </Button>
      </Stack>
    </Modal>
  );
}

function LeaveDialog(props: { readonly row: Row; readonly onClose: () => void; readonly onSaved: () => Promise<void> }): JSX.Element {
  const medplum = useMedplum();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: KenyaDefaultTimeZone });
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [reason, setReason] = useState('Leave');
  const [busy, setBusy] = useState(false);
  const schedule = props.row.schedule;

  async function add(): Promise<void> {
    if (!schedule || to < from) {
      return;
    }
    setBusy(true);
    try {
      // Whole days in Nairobi time (UTC+3)
      await medplum.createResource<Slot>({
        resourceType: 'Slot',
        schedule: createReference(schedule),
        status: 'busy-unavailable',
        start: new Date(`${from}T00:00:00+03:00`).toISOString(),
        end: new Date(`${to}T23:59:00+03:00`).toISOString(),
        comment: reason.trim() || 'Leave',
      });
      showNotification({ color: 'green', message: 'Leave added: those days cannot be booked' });
      await props.onSaved();
      props.onClose();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setBusy(false);
    }
  }

  async function remove(slot: WithId<Slot>): Promise<void> {
    try {
      await medplum.deleteResource('Slot', slot.id);
      showNotification({ color: 'green', message: 'Leave removed' });
      await props.onSaved();
      props.onClose();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  return (
    <Modal opened onClose={props.onClose} title="Leave">
      <Stack>
        {props.row.leave.map((l) => (
          <Group key={l.id} justify="space-between">
            <Text size="sm">
              {formatDateTime(l.start)} – {formatDateTime(l.end)} {l.comment ? `(${l.comment})` : ''}
            </Text>
            <Button size="compact-xs" variant="subtle" color="red" onClick={() => remove(l)}>
              Remove
            </Button>
          </Group>
        ))}
        <Group grow>
          <TextInput type="date" label="From" value={from} min={today} onChange={(e) => setFrom(e.currentTarget.value)} />
          <TextInput type="date" label="To" value={to} min={from} onChange={(e) => setTo(e.currentTarget.value)} />
        </Group>
        <TextInput label="Reason" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Button loading={busy} disabled={to < from} onClick={() => add()}>
          Add leave
        </Button>
      </Stack>
    </Modal>
  );
}
