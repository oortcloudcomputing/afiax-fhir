// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Accordion,
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  CopyButton,
  Grid,
  Group,
  Modal,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  Stepper,
  Table,
  Tabs,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaWardType, WithId } from '@medplum/core';
import {
  formatDateTime,
  formatHumanName,
  getKenyaBedHold,
  getKenyaBedState,
  getKenyaWardType,
  getReferenceString,
  KenyaLocationKindSystem,
  KenyaWardTypes,
  normalizeErrorString,
} from '@medplum/core';
import type { Location, Patient } from '@medplum/fhirtypes';
import { Document, ResourceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { BedsCall, ClinicalRecord, HospitalOffer, MyHospital, Referral, Urgency } from '../../components/kenya/bedReferralsApi';
import { urgencyColor, Urgencies, useBedsApi } from '../../components/kenya/bedReferralsApi';
import type { MapPoint } from '../../components/kenya/ReferralMap';
import { ReferralMap } from '../../components/kenya/ReferralMap';

const stateColor: Record<Referral['state'], string> = {
  waiting: 'yellow',
  accepted: 'green',
  declined: 'red',
  cancelled: 'gray',
  admitted: 'blue',
  expired: 'gray',
};
const stateLabel: Record<Referral['state'], string> = {
  waiting: 'Waiting for an answer',
  accepted: 'Bed held',
  declined: 'Declined',
  cancelled: 'Cancelled',
  admitted: 'Admitted',
  expired: 'Hold ran out',
};

/**
 * Bed referrals between hospitals (ADR-018 §C), clinician to clinician: a map of nearby hospitals
 * and what they offer, a step-by-step referral with the clinical record attached, answers to
 * referrals to this hospital, and the ambulance on the way.
 * @returns The bed referrals page.
 */
export function BedReferralsPage(): JSX.Element {
  const call = useBedsApi();
  const [tab, setTab] = useState<string | null>('find');
  const [me, setMe] = useState<MyHospital>();

  useEffect(() => {
    call?.<MyHospital>('GET', 'my-hospital')
      .then(setMe)
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [call]);

  if (!call) {
    return (
      <Document>
        <Alert color="yellow" title="Bed referrals are not set up">
          This Afiax Provider has no afiax-services address (MEDPLUM_AFIAX_SERVICES_URL). Contact your Afiax
          administrator.
        </Alert>
      </Document>
    );
  }

  return (
    <Document>
      <Group justify="space-between" mb="md">
        <Title order={2}>Bed referrals</Title>
        {me ? <Text c="dimmed">{me.name}</Text> : null}
      </Group>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="find">Find a bed</Tabs.Tab>
          <Tabs.Tab value="incoming">Incoming</Tabs.Tab>
          <Tabs.Tab value="sent">Sent</Tabs.Tab>
          <Tabs.Tab value="hospital">Our hospital</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="find">
          <FindBed call={call} me={me} onSent={() => setTab('sent')} />
        </Tabs.Panel>
        <Tabs.Panel value="incoming">
          <ReferralList call={call} direction="incoming" />
        </Tabs.Panel>
        <Tabs.Panel value="sent">
          <ReferralList call={call} direction="sent" />
        </Tabs.Panel>
        <Tabs.Panel value="hospital">{me ? <OurHospital call={call} me={me} onSaved={setMe} /> : null}</Tabs.Panel>
      </Tabs>
    </Document>
  );
}

// ── Find a bed: the map and each hospital's offer ───────────────────────────────────────────────

function FindBed(props: { readonly call: BedsCall; readonly me?: MyHospital; readonly onSent: () => void }): JSX.Element {
  const { call, me } = props;
  const [wardType, setWardType] = useState<KenyaWardType>('icu');
  const [patient, setPatient] = useState<WithId<Patient>>();
  const [hospitals, setHospitals] = useState<HospitalOffer[]>();
  const [referTo, setReferTo] = useState<HospitalOffer>();

  useEffect(() => {
    let stopped = false;
    call<HospitalOffer[]>('GET', `hospitals?wardType=${wardType}${patient ? `&patient=${patient.id}` : ''}`)
      .then((list) => !stopped && setHospitals(list))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    return () => {
      stopped = true;
    };
  }, [call, wardType, patient]);

  const points = useMemo<MapPoint[]>(() => {
    const out: MapPoint[] = me?.position ? [{ id: 'here', ...me.position, label: `${me.name} (you)`, kind: 'here' }] : [];
    for (const h of hospitals ?? []) {
      if (h.position) {
        out.push({
          id: h.hospital,
          lat: h.position.lat,
          lng: h.position.lng,
          label: `${h.name}: ${h.free} free ${KenyaWardTypes[wardType]}`,
          kind: h.free > 0 ? 'free' : 'full',
        });
      }
    }
    return out;
  }, [hospitals, me, wardType]);

  return (
    <Stack>
      <Group align="flex-end">
        <Select
          label="Bed needed"
          data={Object.entries(KenyaWardTypes).map(([value, label]) => ({ value, label }))}
          value={wardType}
          onChange={(v) => v && setWardType(v as KenyaWardType)}
          w={220}
        />
        <div style={{ flex: 1, maxWidth: 420 }}>
          <Text size="sm" fw={500} mb={4}>
            Patient (to match insurance)
          </Text>
          <ResourceInput<Patient>
            resourceType="Patient"
            name="find-patient"
            placeholder="Search the patient by name"
            onChange={(p) => setPatient(p as WithId<Patient> | undefined)}
          />
        </div>
      </Group>
      <Grid>
        <Grid.Col span={{ base: 12, md: 7 }}>
          <ReferralMap
            points={points}
            height={460}
            onSelect={(id) => setReferTo(hospitals?.find((h) => h.hospital === id && h.free > 0))}
          />
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 5 }}>
          <Stack gap="sm" mah={460} style={{ overflowY: 'auto' }}>
            {hospitals === undefined ? <Text c="dimmed">Looking for beds…</Text> : null}
            {hospitals?.length === 0 ? <Text c="dimmed">No other hospital in the network takes bed referrals yet.</Text> : null}
            {hospitals?.map((h) => (
              <OfferCard key={h.hospital} offer={h} wardType={wardType} patientChosen={!!patient} onRefer={() => setReferTo(h)} />
            ))}
          </Stack>
        </Grid.Col>
      </Grid>
      <ReferStepper
        key={referTo?.hospital ?? 'none'}
        call={call}
        to={referTo}
        wardType={wardType}
        patient={patient}
        onClose={() => setReferTo(undefined)}
        onSent={() => {
          setReferTo(undefined);
          props.onSent();
        }}
      />
    </Stack>
  );
}

function OfferCard(props: {
  readonly offer: HospitalOffer;
  readonly wardType: KenyaWardType;
  readonly patientChosen: boolean;
  readonly onRefer: () => void;
}): JSX.Element {
  const { offer: h, wardType } = props;
  return (
    <Card withBorder padding="sm">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div>
          <Text fw={700}>{h.name}</Text>
          <Text size="sm" c="dimmed">
            {h.distanceKm === undefined ? '' : `${h.distanceKm} km away`}
            {h.phone ? ` · ${h.phone}` : ''}
          </Text>
        </div>
        <Badge color={h.free > 0 ? 'green' : 'gray'} size="lg">
          {h.free} free
        </Badge>
      </Group>
      <Group gap={4} mt={6}>
        {(Object.keys(KenyaWardTypes) as KenyaWardType[])
          .filter((t) => (h.beds[t] ?? 0) > 0 || t === wardType)
          .map((t) => (
            <Badge key={t} variant={t === wardType ? 'filled' : 'light'} color={(h.beds[t] ?? 0) > 0 ? 'teal' : 'gray'} size="sm">
              {KenyaWardTypes[t]} {h.beds[t] ?? 0}
            </Badge>
          ))}
      </Group>
      <Group gap={4} mt={6}>
        {h.insurers.length === 0 ? (
          <Text size="xs" c="dimmed">
            No insurers listed
          </Text>
        ) : (
          h.insurers.map((i) => (
            <Badge
              key={i}
              size="xs"
              variant={h.covered?.includes(i) ? 'filled' : 'outline'}
              color={h.covered?.includes(i) ? 'green' : 'gray'}
            >
              {h.covered?.includes(i) ? '✓ ' : ''}
              {i}
            </Badge>
          ))
        )}
      </Group>
      {props.patientChosen && h.covered?.length === 0 && h.insurers.length > 0 ? (
        <Text size="xs" c="orange" mt={4}>
          None of the patient’s insurers is accepted here
        </Text>
      ) : null}
      <Button mt="xs" size="xs" disabled={h.free === 0} onClick={props.onRefer}>
        Refer here
      </Button>
    </Card>
  );
}

// ── The referral, step by step ──────────────────────────────────────────────────────────────────

function ReferStepper(props: {
  readonly call: BedsCall;
  readonly to?: HospitalOffer;
  readonly wardType: KenyaWardType;
  readonly patient?: WithId<Patient>;
  readonly onClose: () => void;
  readonly onSent: () => void;
}): JSX.Element {
  const { call, to } = props;
  const [step, setStep] = useState(0);
  const [patient, setPatient] = useState<WithId<Patient> | undefined>(props.patient);
  const [urgency, setUrgency] = useState<Urgency>('urgent');
  const [reason, setReason] = useState('');
  const [condition, setCondition] = useState('');
  const [oxygen, setOxygen] = useState(false);
  const [ventilation, setVentilation] = useState(false);
  const [summary, setSummary] = useState<{ record: ClinicalRecord; insurers: string[] }>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!patient) {
      return undefined;
    }
    let stopped = false;
    call<{ record: ClinicalRecord; insurers: string[] }>('GET', `summary?patient=${patient.id}`)
      .then((s) => !stopped && setSummary(s))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    return () => {
      stopped = true;
    };
  }, [call, patient]);

  const covered = to?.insurers.filter((i) => summary?.insurers.some((p) => sameInsurer(p, i))) ?? [];
  const canNext = [!!patient, !!reason.trim(), true, true][step];
  const name = patient?.name?.[0] ? formatHumanName(patient.name[0]) : 'the patient';

  async function send(): Promise<void> {
    if (!to || !patient) {
      return;
    }
    setBusy(true);
    try {
      await call('POST', 'referrals', {
        hospital: to.hospital,
        wardType: props.wardType,
        patient: patient.id,
        urgency,
        summary: { reason: reason.trim(), condition: condition.trim() || undefined, oxygen, ventilation },
      });
      showNotification({ color: 'green', message: `Referral sent to ${to.name}` });
      props.onSent();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={!!to} onClose={props.onClose} size="xl" title={`Refer for a ${KenyaWardTypes[props.wardType]} bed at ${to?.name ?? ''}`}>
      <Card withBorder padding="lg">
        <Stepper active={step} onStepClick={(s) => s < step && setStep(s)} size="sm">
          <Stepper.Step label="Patient" description="Who and how urgent">
            <Stack mt="md">
              <ResourceInput<Patient>
                resourceType="Patient"
                name="refer-patient"
                defaultValue={props.patient}
                placeholder="Search the patient by name"
                onChange={(p) => setPatient(p as WithId<Patient> | undefined)}
              />
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Urgency
                </Text>
                <SegmentedControl
                  value={urgency}
                  onChange={(v) => setUrgency(v as Urgency)}
                  data={(Object.keys(Urgencies) as Urgency[]).map((u) => ({ value: u, label: Urgencies[u] }))}
                  color={urgencyColor[urgency]}
                />
              </div>
            </Stack>
          </Stepper.Step>
          <Stepper.Step label="Clinical summary" description="Attached automatically">
            <Stack mt="md">
              <Textarea
                label="Why the patient needs the bed"
                required
                autosize
                minRows={2}
                value={reason}
                onChange={(e) => setReason(e.currentTarget.value)}
              />
              <Textarea
                label="Current condition (optional)"
                autosize
                minRows={2}
                value={condition}
                onChange={(e) => setCondition(e.currentTarget.value)}
              />
              <Group>
                <Checkbox label="On oxygen" checked={oxygen} onChange={(e) => setOxygen(e.currentTarget.checked)} />
                <Checkbox label="Needs ventilation" checked={ventilation} onChange={(e) => setVentilation(e.currentTarget.checked)} />
              </Group>
              <Text size="sm" fw={600}>
                Attached from {name}’s record
              </Text>
              {summary ? <RecordView record={summary.record} /> : <Text c="dimmed">Reading the record…</Text>}
            </Stack>
          </Stepper.Step>
          <Stepper.Step label="Insurance" description="Matched with the hospital">
            <Stack mt="md">
              <Text size="sm">
                {name}’s insurers: {summary?.insurers.length ? summary.insurers.join(', ') : 'none recorded'}
              </Text>
              <Text size="sm">
                {to?.name} accepts: {to?.insurers.length ? to.insurers.join(', ') : 'no insurers listed'}
              </Text>
              {covered.length ? (
                <Alert color="green" title="Covered">
                  {covered.join(', ')}
                </Alert>
              ) : (
                <Alert color="orange" title="No accepted insurer matches">
                  The hospital may ask for a deposit or another way to pay. You can still send the referral.
                </Alert>
              )}
            </Stack>
          </Stepper.Step>
          <Stepper.Step label="Review" description="Send">
            <Stack mt="md" gap={6}>
              <Group gap="xs">
                <Badge color={urgencyColor[urgency]}>{Urgencies[urgency]}</Badge>
                <Text fw={600}>
                  {KenyaWardTypes[props.wardType]} bed at {to?.name}
                  {to?.distanceKm === undefined ? '' : ` (${to.distanceKm} km)`}
                </Text>
              </Group>
              <Text size="sm">Patient: {name}</Text>
              <Text size="sm">Reason: {reason}</Text>
              {condition ? <Text size="sm">Condition: {condition}</Text> : null}
              <Text size="sm">
                Record attached: {summary?.record.vitals.length ?? 0} vital signs, {summary?.record.labs.length ?? 0} results,{' '}
                {summary?.record.conditions.length ?? 0} diagnoses, {summary?.record.medicines.length ?? 0} medicines
              </Text>
              <Text size="sm">Insurance: {covered.length ? `covered (${covered.join(', ')})` : 'no match'}</Text>
              <Text size="xs" c="dimmed" mt="xs">
                The hospital sees age, sex, the summary and the record now; the name only when it accepts.
              </Text>
            </Stack>
          </Stepper.Step>
        </Stepper>
        <Group justify="space-between" mt="xl">
          <Button variant="default" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
            Back
          </Button>
          {step < 3 ? (
            <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
              Next
            </Button>
          ) : (
            <Button color={urgencyColor[urgency]} loading={busy} onClick={() => send()}>
              Send the referral
            </Button>
          )}
        </Group>
      </Card>
    </Modal>
  );
}

/**
 * The same loose match as afiax-services: case, punctuation, "insurance" and "ltd" ignored.
 * @param a - One insurer's name.
 * @param b - Another insurer's name.
 * @returns True when they are the same insurer.
 */
function sameInsurer(a: string, b: string): boolean {
  const key = (s: string): string => {
    const words = s
      .toLowerCase()
      .replace(/\(.*?\)/g, ' ')
      .replace(/[^a-z0-9 ]/g, ' ')
      .split(/\s+/)
      .filter((w) => w && !['insurance', 'assurance', 'company', 'co', 'ltd', 'limited', 'plc', 'kenya', 'health', 'the'].includes(w));
    return words.join(' ') === 'social authority' || words[0] === 'sha' ? 'sha' : words.join(' ');
  };
  return key(a) === key(b);
}

function RecordView({ record }: { readonly record: ClinicalRecord }): JSX.Element {
  const rows = (items: ClinicalRecord['vitals']): JSX.Element[] =>
    items.map((i) => (
      <Table.Tr key={i.name + (i.at ?? '')}>
        <Table.Td>{i.name}</Table.Td>
        <Table.Td fw={600} c={i.flag && !/normal/i.test(i.flag) ? 'orange' : undefined}>
          {i.value ?? ''}
          {i.flag ? ` (${i.flag})` : ''}
        </Table.Td>
        <Table.Td c="dimmed">{i.at ? formatDateTime(i.at) : ''}</Table.Td>
      </Table.Tr>
    ));
  const section = (title: string, items: ClinicalRecord['vitals']): JSX.Element | null =>
    items.length ? (
      <Accordion.Item value={title}>
        <Accordion.Control>
          {title} ({items.length})
        </Accordion.Control>
        <Accordion.Panel>
          <Table fz="sm">
            <Table.Tbody>{rows(items)}</Table.Tbody>
          </Table>
        </Accordion.Panel>
      </Accordion.Item>
    ) : null;
  const empty = !record.vitals.length && !record.labs.length && !record.conditions.length && !record.medicines.length;
  if (empty) {
    return (
      <Text size="sm" c="dimmed">
        Nothing recorded yet for this patient.
      </Text>
    );
  }
  return (
    <Accordion multiple defaultValue={['Vital signs', 'Investigations']} variant="contained">
      {section('Vital signs', record.vitals)}
      {section('Investigations', record.labs)}
      {section('Diagnoses', record.conditions)}
      {section('Medicines', record.medicines)}
      {section('Allergies', record.allergies)}
    </Accordion>
  );
}

// ── Incoming and sent ───────────────────────────────────────────────────────────────────────────

function ReferralList({ call, direction }: { readonly call: BedsCall; readonly direction: 'incoming' | 'sent' }): JSX.Element {
  const medplum = useMedplum();
  const [list, setList] = useState<Referral[]>();
  const [accepting, setAccepting] = useState<Referral>();
  const [declining, setDeclining] = useState<Referral>();
  const [dispatching, setDispatching] = useState<Referral>();

  const fetchList = useCallback(() => call<Referral[]>('GET', `referrals?direction=${direction}`), [call, direction]);
  const reload = useCallback(async (): Promise<void> => setList(await fetchList()), [fetchList]);

  useEffect(() => {
    let stopped = false;
    const tick = (): void => {
      fetchList()
        .then((l) => !stopped && setList(l))
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    };
    tick();
    // The ambulance moves and answers come in: check every 10 seconds while this page is open
    const timer = setInterval(tick, 10_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [fetchList]);

  async function act(work: () => Promise<unknown>, done: string): Promise<void> {
    try {
      await work();
      showNotification({ color: 'green', message: done });
      await reload();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  async function admit(r: Referral): Promise<void> {
    const { bed, patient } = r;
    if (!bed || !patient) {
      return;
    }
    await act(async () => {
      await medplum.post(medplum.fhirUrl('Location', bed.id, '$kenya-bed'), {
        resourceType: 'Parameters',
        parameter: [
          { name: 'action', valueCode: 'admit' },
          { name: 'patient', valueReference: { reference: patient.reference } },
          { name: 'referral', valueString: r.id },
        ],
      });
      await call('POST', `referrals/${r.id}/admitted`);
    }, `${patient.display ?? 'The patient'} admitted to ${bed.name ?? 'the bed'}`);
  }

  if (!list) {
    return <Text c="dimmed">Loading…</Text>;
  }
  if (!list.length) {
    return <Text c="dimmed">{direction === 'incoming' ? 'No referrals to this hospital.' : 'You have not referred anyone yet.'}</Text>;
  }

  return (
    <Stack>
      {list.map((r) => (
        <ReferralCard
          key={r.id}
          referral={r}
          direction={direction}
          onAccept={() => setAccepting(r)}
          onDecline={() => setDeclining(r)}
          onAdmit={() => admit(r)}
          onAmbulance={() => setDispatching(r)}
          onCancel={() => act(() => call('POST', `referrals/${r.id}/cancel`), 'Referral cancelled')}
        />
      ))}
      <AcceptDialog
        referral={accepting}
        onClose={() => setAccepting(undefined)}
        onAccept={(bed) =>
          act(() => call('POST', `referrals/${accepting?.id}/accept`, { bed }), 'Referral accepted: the bed is held for 2 hours').then(() =>
            setAccepting(undefined)
          )
        }
      />
      <DeclineDialog
        referral={declining}
        onClose={() => setDeclining(undefined)}
        onDecline={(reason) =>
          act(() => call('POST', `referrals/${declining?.id}/decline`, { reason }), 'Referral declined').then(() =>
            setDeclining(undefined)
          )
        }
      />
      <AmbulanceDialog key={dispatching?.id ?? 'none'} call={call} referral={dispatching} onClose={() => setDispatching(undefined)} onSent={reload} />
    </Stack>
  );
}

function ReferralCard(props: {
  readonly referral: Referral;
  readonly direction: 'incoming' | 'sent';
  readonly onAccept: () => void;
  readonly onDecline: () => void;
  readonly onAdmit: () => void;
  readonly onAmbulance: () => void;
  readonly onCancel: () => void;
}): JSX.Element {
  const { referral: r, direction } = props;
  const urgency = r.view.urgency ?? 'urgent';
  const who = [r.patient?.display, r.view.patient.gender, r.view.patient.age === undefined ? undefined : `${r.view.patient.age} years`]
    .filter(Boolean)
    .join(', ');
  return (
    <Card
      withBorder
      padding="sm"
      style={urgency === 'emergency' && r.state === 'waiting' ? { borderLeft: '5px solid var(--mantine-color-red-6)' } : undefined}
    >
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div style={{ flex: 1 }}>
          <Group gap="xs">
            <Badge color={urgencyColor[urgency]}>{Urgencies[urgency]}</Badge>
            <Text fw={700}>
              {r.view.wardTypeDisplay} bed {direction === 'incoming' ? `from ${r.view.from}` : `at ${r.to}`}
            </Text>
            <Badge color={stateColor[r.state]} variant="light">
              {stateLabel[r.state]}
            </Badge>
          </Group>
          <Text size="sm" mt={2}>
            {who}
            {r.view.referrer ? ` · referred by ${r.view.referrer}` : ''}
            {r.createdAt ? ` · ${formatDateTime(r.createdAt)}` : ''}
          </Text>
          {r.view.patient.insurers?.length ? (
            <Text size="sm" c="dimmed">
              Insurance: {r.view.patient.insurers.join(', ')}
            </Text>
          ) : null}
          <Text size="sm" mt={4}>
            {r.view.summary.reason}
          </Text>
          {r.view.summary.condition ? (
            <Text size="sm" c="dimmed">
              {r.view.summary.condition}
            </Text>
          ) : null}
          <Group gap={6} mt={4}>
            {r.view.summary.oxygen ? <Badge variant="outline">On oxygen</Badge> : null}
            {r.view.summary.ventilation ? (
              <Badge variant="outline" color="red">
                Needs ventilation
              </Badge>
            ) : null}
          </Group>
          {r.bed && r.state === 'accepted' ? (
            <Text size="sm" mt={4} fw={600}>
              {r.bed.name} held{r.bed.until ? ` until ${formatDateTime(r.bed.until)}` : ''}
            </Text>
          ) : null}
          {r.reason ? (
            <Text size="sm" c="red" mt={4}>
              {r.reason}
            </Text>
          ) : null}
          {r.view.record ? (
            <div style={{ marginTop: 8 }}>
              <RecordView record={r.view.record} />
            </div>
          ) : null}
          {r.state === 'accepted' || r.ambulance ? <AmbulanceMap referral={r} /> : null}
        </div>
        <Stack gap="xs">
          {direction === 'incoming' && r.state === 'waiting' ? (
            <>
              <Button size="xs" onClick={props.onAccept}>
                Accept
              </Button>
              <Button size="xs" variant="light" color="red" onClick={props.onDecline}>
                Decline
              </Button>
            </>
          ) : null}
          {direction === 'incoming' && r.state === 'accepted' ? (
            <Button size="xs" onClick={props.onAdmit}>
              Admit now
            </Button>
          ) : null}
          {direction === 'sent' && r.state === 'accepted' && !r.ambulance ? (
            <Button size="xs" color="red" onClick={props.onAmbulance}>
              Send ambulance
            </Button>
          ) : null}
          {direction === 'sent' && (r.state === 'waiting' || r.state === 'accepted') ? (
            <Button size="xs" variant="light" color="gray" onClick={props.onCancel}>
              Cancel
            </Button>
          ) : null}
        </Stack>
      </Group>
    </Card>
  );
}

function ambulanceStatus(r: Referral): string {
  if (r.ambulance?.arrived) {
    return `Ambulance ${r.ambulance.plate} arrived ${formatDateTime(r.ambulance.arrived)}`;
  }
  if (r.ambulance?.position) {
    return `Ambulance ${r.ambulance.plate} on the way, about ${r.ambulance.etaMinutes ?? '?'} min`;
  }
  if (r.ambulance) {
    return `Ambulance ${r.ambulance.plate} sent; waiting for its first position`;
  }
  return 'No ambulance sent yet';
}

function AmbulanceMap({ referral: r }: { readonly referral: Referral }): JSX.Element | null {
  const points = useMemo<MapPoint[]>(() => {
    const out: MapPoint[] = [];
    if (r.fromPosition) {
      out.push({ id: 'from', ...r.fromPosition, label: r.view.from, kind: 'here' });
    }
    if (r.toPosition) {
      out.push({ id: 'to', ...r.toPosition, label: r.to, kind: 'free' });
    }
    if (r.ambulance?.position && !r.ambulance.arrived) {
      out.push({ id: 'ambulance', ...r.ambulance.position, label: `Ambulance ${r.ambulance.plate}`, kind: 'ambulance' });
    }
    return out;
  }, [r]);
  const line = useMemo(
    () => (r.ambulance?.position && r.toPosition && !r.ambulance.arrived ? ([r.ambulance.position, r.toPosition] as const) : undefined),
    [r]
  );
  if (points.length < 2) {
    return null;
  }
  return (
    <Stack gap={4} mt="sm">
      <Text size="sm" fw={600} c={r.ambulance && !r.ambulance.arrived ? 'red' : undefined}>
        {ambulanceStatus(r)}
      </Text>
      <ReferralMap points={points} line={line} height={220} />
    </Stack>
  );
}

function AmbulanceDialog(props: {
  readonly call: BedsCall;
  readonly referral?: Referral;
  readonly onClose: () => void;
  readonly onSent: () => Promise<void>;
}): JSX.Element {
  const [plate, setPlate] = useState('');
  const [crewPhone, setCrewPhone] = useState('');
  const [link, setLink] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function send(): Promise<void> {
    if (!props.referral) {
      return;
    }
    setBusy(true);
    try {
      const out = await props.call<{ trackUrl: string }>('POST', `referrals/${props.referral.id}/ambulance`, {
        plate,
        crewPhone: crewPhone.trim() || undefined,
      });
      setLink(out.trackUrl);
      await props.onSent();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={!!props.referral} onClose={props.onClose} title={`Send an ambulance to ${props.referral?.to ?? ''}`}>
      {link ? (
        <Stack>
          <Alert color="green" title="Ambulance on record">
            {crewPhone ? 'The crew got this link by SMS.' : 'Give this link to the crew.'} When they open it, both hospitals see the
            ambulance on the map.
          </Alert>
          <TextInput value={link} readOnly />
          <CopyButton value={link}>{({ copied, copy }) => <Button onClick={copy}>{copied ? 'Copied' : 'Copy the link'}</Button>}</CopyButton>
        </Stack>
      ) : (
        <Stack>
          <TextInput label="Number plate" required placeholder="KCA 123A" value={plate} onChange={(e) => setPlate(e.currentTarget.value)} />
          <TextInput
            label="Crew phone (gets the tracking link by SMS)"
            placeholder="+2547…"
            value={crewPhone}
            onChange={(e) => setCrewPhone(e.currentTarget.value)}
          />
          <Text size="xs" c="dimmed">
            Afiax does not dispatch ambulances: use your own or your operator’s, and record it here to track it.
          </Text>
          <Button loading={busy} disabled={!plate.trim()} onClick={() => send()}>
            Record and send the link
          </Button>
        </Stack>
      )}
    </Modal>
  );
}

function AcceptDialog(props: {
  readonly referral?: Referral;
  readonly onClose: () => void;
  readonly onAccept: (bed: string) => Promise<void>;
}): JSX.Element {
  const medplum = useMedplum();
  const [beds, setBeds] = useState<{ value: string; label: string }[]>();
  const [bed, setBed] = useState<string | null>(null);
  const wardType = props.referral?.view.wardType;

  useEffect(() => {
    if (!wardType) {
      return undefined;
    }
    let stopped = false;
    const kind = (code: string): string => `${KenyaLocationKindSystem}|${code}`;
    Promise.all([
      medplum.searchResources('Location', { type: kind('ward'), _count: '200' }, { cache: 'no-cache' }),
      medplum.searchResources('Location', { type: kind('bed'), _count: '1000', _sort: 'name' }, { cache: 'no-cache' }),
    ])
      .then(([wards, all]) => {
        const ofType = new Map<string, WithId<Location>>(
          wards.filter((w) => getKenyaWardType(w) === wardType).map((w) => [getReferenceString(w), w])
        );
        const free = all.filter((b) => ofType.has(b.partOf?.reference ?? '') && getKenyaBedState(b) === 'U' && !getKenyaBedHold(b));
        if (!stopped) {
          setBeds(free.map((b) => ({ value: b.id, label: `${ofType.get(b.partOf?.reference ?? '')?.name}: ${b.name}` })));
        }
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    return () => {
      stopped = true;
    };
  }, [medplum, wardType]);

  return (
    <Modal opened={!!props.referral} onClose={props.onClose} title={`Accept: hold a ${props.referral?.view.wardTypeDisplay ?? ''} bed`}>
      <Stack>
        <Select
          label="Bed to hold for 2 hours"
          placeholder={beds?.length === 0 ? 'No free bed of this type' : 'Choose a bed'}
          data={beds ?? []}
          value={bed}
          onChange={setBed}
        />
        <Text size="sm" c="dimmed">
          Only a clinician or the facility admin can accept. The patient’s record is added here so the ward can admit
          them on arrival.
        </Text>
        <Button disabled={!bed} onClick={() => bed && props.onAccept(bed)}>
          Accept and hold the bed
        </Button>
      </Stack>
    </Modal>
  );
}

function DeclineDialog(props: {
  readonly referral?: Referral;
  readonly onClose: () => void;
  readonly onDecline: (reason: string) => Promise<void>;
}): JSX.Element {
  const [reason, setReason] = useState('');
  return (
    <Modal opened={!!props.referral} onClose={props.onClose} title="Decline the referral">
      <Stack>
        <TextInput
          label="Why"
          placeholder="For example: no free bed after all, no specialist on call"
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
        />
        <Button color="red" onClick={() => props.onDecline(reason)}>
          Decline
        </Button>
      </Stack>
    </Modal>
  );
}

// ── Our hospital: accepted insurers (facility admins) ───────────────────────────────────────────

function OurHospital(props: { readonly call: BedsCall; readonly me: MyHospital; readonly onSaved: (me: MyHospital) => void }): JSX.Element {
  const [insurers, setInsurers] = useState<string[]>(props.me.insurers);
  const [busy, setBusy] = useState(false);
  const options = [...new Set([...props.me.known, ...props.me.insurers])];

  async function save(): Promise<void> {
    setBusy(true);
    try {
      const out = await props.call<MyHospital>('POST', 'my-hospital', { insurers });
      props.onSaved({ ...props.me, ...out });
      showNotification({ color: 'green', message: 'Accepted insurers saved' });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack maw={600}>
      <Text>Insurers {props.me.name} accepts. Referring clinicians see them, matched with their patient’s insurance.</Text>
      <MultiSelect
        label="Accepted insurers"
        data={options}
        value={insurers}
        onChange={setInsurers}
        searchable
        disabled={!props.me.canEdit}
        placeholder="Choose insurers"
      />
      {props.me.canEdit ? (
        <Button loading={busy} onClick={() => save()} w={200}>
          Save
        </Button>
      ) : (
        <Text size="sm" c="dimmed">
          Only the facility admin can change these.
        </Text>
      )}
    </Stack>
  );
}
