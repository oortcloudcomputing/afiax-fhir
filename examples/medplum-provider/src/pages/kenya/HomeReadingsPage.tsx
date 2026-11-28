// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Group, Loader, Stack, Table, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatHumanName, normalizeErrorString } from '@medplum/core';
import type { Bundle, Flag, Observation, Patient } from '@medplum/fhirtypes';
import { Document, useMedplum } from '@medplum/react';
import { IconAlertTriangle, IconHeartbeat } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';

// Readings patients take at home with My Afiax (typed in, Bluetooth devices, Health Connect),
// and the alerts afiax-services raises for readings outside the rules (ADR-012 §4).
const DATA_SOURCE = 'https://afiax.africa/fhir/CodeSystem/data-source';
const HOME_ALERT_SYSTEM = 'https://afiax.africa/fhir/CodeSystem/home-reading-alert';
const LOINC = 'http://loinc.org';

const KINDS: { kind: string; label: string; codes: string[] }[] = [
  { kind: 'bp', label: 'Blood pressure', codes: ['85354-9'] },
  { kind: 'pulse', label: 'Pulse', codes: ['8867-4'] },
  { kind: 'spo2', label: 'SpO₂', codes: ['59408-5', '2708-6'] },
  { kind: 'temperature', label: 'Temperature', codes: ['8310-5'] },
  { kind: 'glucose', label: 'Glucose', codes: ['14743-9'] },
  { kind: 'weight', label: 'Weight', codes: ['29463-7'] },
  { kind: 'respiration', label: 'Resp. rate', codes: ['9279-1'] },
  { kind: 'fhr', label: 'Fetal HR', codes: ['55283-6'] },
  { kind: 'ecg', label: 'ECG', codes: ['11524-6'] },
];

function kindOf(obs: Observation): string | undefined {
  const codes = new Set((obs.code?.coding ?? []).filter((c) => c.system === LOINC).map((c) => c.code));
  return KINDS.find((k) => k.codes.some((c) => codes.has(c)))?.kind;
}

function formatReading(obs: Observation): string {
  if (kindOf(obs) === 'bp') {
    const comp = (code: string): number | undefined =>
      obs.component?.find((c) => c.code.coding?.some((x) => x.code === code))?.valueQuantity?.value;
    return `${comp('8480-6') ?? '?'}/${comp('8462-4') ?? '?'} mmHg`;
  }
  if (kindOf(obs) === 'ecg') {
    const hr = obs.component?.find((c) => c.code.coding?.some((x) => x.code === '8867-4'))?.valueQuantity?.value;
    const seconds = obs.valueSampledData?.data && obs.valueSampledData.period
      ? Math.round((obs.valueSampledData.data.split(' ').length * obs.valueSampledData.period) / 1000)
      : undefined;
    return [seconds ? `${seconds} s strip` : 'Recording', hr ? `HR ${hr}` : ''].filter(Boolean).join(' · ');
  }
  const q = obs.valueQuantity;
  return q?.value === undefined ? '' : `${q.value} ${q.unit ?? ''}`.trim();
}

/**
 * A saved single-lead ECG strip on ECG paper (25 mm/s, 10 mm/mV), for the clinician to read.
 * @param props - The component props.
 * @param props.obs - The ECG Observation (valueSampledData in microvolts).
 * @returns The strip, or null when the Observation has none.
 */
function EcgStrip({ obs }: { obs: Observation }): JSX.Element | null {
  const sd = obs.valueSampledData;
  if (!sd?.data || !sd.period) {
    return null;
  }
  const period = sd.period;
  const samples = sd.data.split(/\s+/).map(Number).filter(Number.isFinite).map((v) => (sd.origin?.value ?? 0) + v * (sd.factor ?? 1));
  const pxPerSecond = 125;
  const pxPerMv = 50;
  const height = 160;
  const width = (samples.length * period * pxPerSecond) / 1000;
  const sorted = [...samples].sort((a, b) => a - b);
  const mid = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const pts = samples
    .map((v, i) => `${((i * period * pxPerSecond) / 1000).toFixed(1)},${(height / 2 - ((v - mid) / 1000) * pxPerMv).toFixed(1)}`)
    .join(' ');
  const grid: JSX.Element[] = [];
  for (let x = 0, i = 0; x <= width; x += pxPerSecond * 0.04, i++) {
    grid.push(<line key={`v${i}`} x1={x} y1={0} x2={x} y2={height} stroke="#f8b4b4" strokeWidth={i % 5 === 0 ? 0.9 : 0.3} />);
  }
  for (let y = 0, i = 0; y <= height; y += pxPerMv * 0.1, i++) {
    grid.push(<line key={`h${i}`} x1={0} y1={y} x2={width} y2={y} stroke="#f8b4b4" strokeWidth={i % 5 === 0 ? 0.9 : 0.3} />);
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <svg width={width} height={height} role="img" aria-label="Single-lead ECG strip">
        {grid}
        <polyline points={pts} fill="none" stroke="#111827" strokeWidth={1.2} />
      </svg>
      <Text size="xs" c="dimmed">
        Single lead (patient's chest strap), 25 mm/s, 10 mm/mV. Not interpreted by Afiax.
      </Text>
    </div>
  );
}

const when = (iso: string | undefined): string =>
  iso ? new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

interface PatientRow {
  patient: Patient;
  latest: Record<string, Observation>;
  readings: Observation[];
  newest: string;
}

/**
 * Home readings: open alerts first (a clinician marks each reviewed), then every patient who sent
 * readings recently with their latest of each kind. Informational only: it does not replace
 * bedside monitoring or its alarms.
 * @returns The page.
 */
export function HomeReadingsPage(): JSX.Element {
  const medplum = useMedplum();
  const [flags, setFlags] = useState<{ flag: Flag; patient?: Patient }[]>();
  const [rows, setRows] = useState<PatientRow[]>();
  const [open, setOpen] = useState<string>();
  const [reviewing, setReviewing] = useState<string>();

  const load = useCallback(async (): Promise<void> => {
    const [flagBundle, obsBundle] = await Promise.all([
      medplum.search('Flag', 'status=active&_include=Flag:subject&_sort=-_lastUpdated&_count=100', { cache: 'no-cache' }),
      medplum.search(
        'Observation',
        `category=vital-signs&_tag=${encodeURIComponent(`${DATA_SOURCE}|patient-reported`)}&_sort=-date&_count=300&_include=Observation:subject`,
        { cache: 'no-cache' }
      ),
    ]);
    const patients = new Map<string, Patient>();
    for (const b of [flagBundle, obsBundle] as Bundle[]) {
      for (const e of b.entry ?? []) {
        if (e.resource?.resourceType === 'Patient' && e.resource.id) {
          patients.set(`Patient/${e.resource.id}`, e.resource);
        }
      }
    }
    setFlags(
      ((flagBundle as Bundle).entry ?? [])
        .map((e) => e.resource)
        .filter((r): r is Flag => r?.resourceType === 'Flag' && !!r.code.coding?.some((c) => c.system === HOME_ALERT_SYSTEM))
        .map((flag) => ({ flag, patient: patients.get(flag.subject.reference ?? '') }))
    );
    const byPatient = new Map<string, PatientRow>();
    for (const e of (obsBundle as Bundle).entry ?? []) {
      const obs = e.resource;
      if (obs?.resourceType !== 'Observation' || obs.status === 'entered-in-error') {
        continue;
      }
      const ref = obs.subject?.reference ?? '';
      const patient = patients.get(ref);
      const kind = kindOf(obs);
      if (!patient || !kind) {
        continue;
      }
      let row = byPatient.get(ref);
      if (!row) {
        row = { patient, latest: {}, readings: [], newest: obs.effectiveDateTime ?? '' };
        byPatient.set(ref, row);
      }
      row.readings.push(obs);
      row.latest[kind] ??= obs; // sorted newest first
    }
    setRows([...byPatient.values()].sort((a, b) => b.newest.localeCompare(a.newest)));
  }, [medplum]);

  useEffect(() => {
    load().catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    const timer = setInterval(() => {
      load().catch(console.error);
    }, 60_000);
    return () => clearInterval(timer);
  }, [load]);

  async function markReviewed(flag: Flag): Promise<void> {
    setReviewing(flag.id);
    try {
      await medplum.updateResource<Flag>({ ...flag, status: 'inactive', period: { ...flag.period, end: new Date().toISOString() } });
      await load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setReviewing(undefined);
    }
  }

  return (
    <Document>
      <Title order={2}>Home readings</Title>
      <Text c="dimmed" mb="md">
        Vital signs your patients take at home with My Afiax. Informational only: they help you review patients
        remotely and do not replace bedside monitoring or its alarms.
      </Text>

      {!flags || !rows ? <Loader /> : null}

      {flags?.length === 0 ? (
        <Alert color="green" mb="lg" icon={<IconHeartbeat />}>
          No home readings waiting for review.
        </Alert>
      ) : null}
      {flags?.length ? (
        <Stack mb="lg">
          <Title order={4}>Needs review ({flags.length})</Title>
          {flags.map(({ flag, patient }) => (
            <Card key={flag.id} withBorder padding="sm">
              <Group justify="space-between" wrap="nowrap">
                <Group wrap="nowrap">
                  <IconAlertTriangle color="var(--mantine-color-red-6)" />
                  <div>
                    <Text fw={700}>
                      {patient ? (
                        <Link to={`/Patient/${patient.id}`}>{formatHumanName(patient.name?.[0]) || 'Patient'}</Link>
                      ) : (
                        flag.subject.display ?? flag.subject.reference
                      )}
                    </Text>
                    <Text size="sm">{flag.code.text}</Text>
                    <Text size="xs" c="dimmed">
                      Since {when(flag.period?.start)}
                    </Text>
                  </div>
                </Group>
                <Button variant="light" loading={reviewing === flag.id} onClick={() => markReviewed(flag)}>
                  Mark reviewed
                </Button>
              </Group>
            </Card>
          ))}
        </Stack>
      ) : null}

      {rows?.length === 0 ? <Text c="dimmed">No home readings yet.</Text> : null}
      {rows?.length ? (
        <>
          <Title order={4} mb="xs">
            Patients sending readings
          </Title>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Patient</Table.Th>
                {KINDS.map((k) => (
                  <Table.Th key={k.kind}>{k.label}</Table.Th>
                ))}
                <Table.Th>Last reading</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map((row) => {
                const ref = `Patient/${row.patient.id}`;
                return [
                  <Table.Tr key={ref} style={{ cursor: 'pointer' }} onClick={() => setOpen(open === ref ? undefined : ref)}>
                    <Table.Td>
                      <Link to={`/Patient/${row.patient.id}`} onClick={(e) => e.stopPropagation()}>
                        {formatHumanName(row.patient.name?.[0]) || 'Patient'}
                      </Link>
                    </Table.Td>
                    {KINDS.map((k) => (
                      <Table.Td key={k.kind}>{row.latest[k.kind] ? formatReading(row.latest[k.kind]) : '–'}</Table.Td>
                    ))}
                    <Table.Td>{when(row.newest)}</Table.Td>
                  </Table.Tr>,
                  open === ref ? (
                    <Table.Tr key={`${ref}-detail`}>
                      <Table.Td colSpan={KINDS.length + 2}>
                        <Table>
                          <Table.Tbody>
                            {row.readings.slice(0, 30).map((o) => [
                              <Table.Tr key={o.id}>
                                <Table.Td>{when(o.effectiveDateTime)}</Table.Td>
                                <Table.Td>{KINDS.find((k) => k.kind === kindOf(o))?.label}</Table.Td>
                                <Table.Td fw={600}>{formatReading(o)}</Table.Td>
                                <Table.Td>
                                  <Badge variant="light" color="gray">
                                    {o.device?.display ?? (o.method?.coding?.[0]?.code === 'health-connect' ? 'Health Connect' : 'typed in')}
                                  </Badge>
                                </Table.Td>
                              </Table.Tr>,
                              kindOf(o) === 'ecg' && o.valueSampledData ? (
                                <Table.Tr key={`${o.id}-strip`}>
                                  <Table.Td colSpan={4}>
                                    <EcgStrip obs={o} />
                                  </Table.Td>
                                </Table.Tr>
                              ) : null,
                            ])}
                          </Table.Tbody>
                        </Table>
                      </Table.Td>
                    </Table.Tr>
                  ) : null,
                ];
              })}
            </Table.Tbody>
          </Table>
          <Text size="xs" c="dimmed" mt="xs">
            Click a patient to see their last 30 readings.
          </Text>
        </>
      ) : null}
    </Document>
  );
}
