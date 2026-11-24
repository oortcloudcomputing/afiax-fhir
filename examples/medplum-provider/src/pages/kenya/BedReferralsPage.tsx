// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Checkbox, Group, Modal, Select, Stack, Tabs, Text, Textarea, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaWardType, WithId } from '@medplum/core';
import {
  formatDateTime,
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
import { useCallback, useEffect, useState } from 'react';
import { getConfig } from '../../config';

interface HospitalBeds {
  hospital: string;
  name: string;
  distanceKm?: number;
  phone?: string;
  free: number;
}

interface Referral {
  id: string;
  direction: 'incoming' | 'sent';
  state: 'waiting' | 'accepted' | 'declined' | 'cancelled' | 'admitted' | 'expired';
  view: {
    wardType: KenyaWardType;
    wardTypeDisplay: string;
    from: string;
    referrer?: string;
    patient: { gender?: string; age?: number };
    summary: { reason: string; condition?: string; oxygen?: boolean; ventilation?: boolean };
  };
  to: string;
  createdAt?: string;
  reason?: string;
  bed?: { id: string; name?: string; until?: string };
  patient?: { reference: string; display?: string };
}

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
 * Bed referrals between hospitals (ADR-018 §C), clinician to clinician: find a hospital with a
 * free ICU or ward bed, refer a patient, and answer referrals to this hospital.
 * @returns The bed referrals page.
 */
export function BedReferralsPage(): JSX.Element {
  const medplum = useMedplum();
  const servicesUrl = getConfig().afiaxServicesUrl;
  const [tab, setTab] = useState<string | null>('find');

  const call = useCallback(
    async <T,>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
      await medplum.refreshIfExpired();
      const res = await fetch(`${servicesUrl?.replace(/\/$/, '')}/beds/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${medplum.getAccessToken()}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as T & { message?: string };
      if (!res.ok) {
        throw new Error(json.message ?? `Bed referrals answered ${res.status}`);
      }
      return json;
    },
    [medplum, servicesUrl]
  );

  if (!servicesUrl) {
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
      <Title order={2} mb="md">
        Bed referrals
      </Title>
      <Tabs value={tab} onChange={setTab} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="find">Find a bed</Tabs.Tab>
          <Tabs.Tab value="incoming">Incoming</Tabs.Tab>
          <Tabs.Tab value="sent">Sent</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="find">
          <FindBed call={call} onSent={() => setTab('sent')} />
        </Tabs.Panel>
        <Tabs.Panel value="incoming">
          <ReferralList call={call} direction="incoming" />
        </Tabs.Panel>
        <Tabs.Panel value="sent">
          <ReferralList call={call} direction="sent" />
        </Tabs.Panel>
      </Tabs>
    </Document>
  );
}

type Call = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>;

function FindBed({ call, onSent }: { readonly call: Call; readonly onSent: () => void }): JSX.Element {
  const [wardType, setWardType] = useState<KenyaWardType>('icu');
  const [hospitals, setHospitals] = useState<HospitalBeds[]>();
  const [referTo, setReferTo] = useState<HospitalBeds>();

  useEffect(() => {
    let stopped = false;
    call<HospitalBeds[]>('GET', `hospitals?wardType=${wardType}`)
      .then((list) => !stopped && setHospitals(list))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    return () => {
      stopped = true;
    };
  }, [call, wardType]);

  return (
    <Stack>
      <Select
        label="Bed needed"
        data={Object.entries(KenyaWardTypes).map(([value, label]) => ({ value, label }))}
        value={wardType}
        onChange={(v) => v && setWardType(v as KenyaWardType)}
        maw={300}
      />
      {hospitals === undefined ? <Text c="dimmed">Looking for beds…</Text> : null}
      {hospitals?.length === 0 ? <Text c="dimmed">No other hospital in the network takes bed referrals yet.</Text> : null}
      {hospitals?.map((h) => (
        <Card key={h.hospital} withBorder padding="sm">
          <Group justify="space-between">
            <div>
              <Text fw={700}>{h.name}</Text>
              <Text size="sm" c="dimmed">
                {h.distanceKm === undefined ? '' : `${h.distanceKm} km away`}
                {h.phone ? ` · ${h.phone}` : ''}
              </Text>
            </div>
            <Group>
              <Badge color={h.free > 0 ? 'green' : 'gray'} size="lg">
                {h.free} free {KenyaWardTypes[wardType]}
              </Badge>
              <Button disabled={h.free === 0} onClick={() => setReferTo(h)}>
                Refer a patient
              </Button>
            </Group>
          </Group>
        </Card>
      ))}
      <ReferDialog
        call={call}
        to={referTo}
        wardType={wardType}
        onClose={() => setReferTo(undefined)}
        onSent={() => {
          setReferTo(undefined);
          onSent();
        }}
      />
    </Stack>
  );
}

function ReferDialog(props: {
  readonly call: Call;
  readonly to?: HospitalBeds;
  readonly wardType: KenyaWardType;
  readonly onClose: () => void;
  readonly onSent: () => void;
}): JSX.Element {
  const [patient, setPatient] = useState<Patient>();
  const [reason, setReason] = useState('');
  const [condition, setCondition] = useState('');
  const [oxygen, setOxygen] = useState(false);
  const [ventilation, setVentilation] = useState(false);
  const [busy, setBusy] = useState(false);

  async function send(): Promise<void> {
    if (!props.to || !patient) {
      return;
    }
    setBusy(true);
    try {
      await props.call('POST', 'referrals', {
        hospital: props.to.hospital,
        wardType: props.wardType,
        patient: patient.id,
        summary: { reason: reason.trim(), condition: condition.trim() || undefined, oxygen, ventilation },
      });
      showNotification({ color: 'green', message: `Referral sent to ${props.to.name}` });
      props.onSent();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal opened={!!props.to} onClose={props.onClose} title={`Refer for a ${KenyaWardTypes[props.wardType]} bed at ${props.to?.name ?? ''}`} size="lg">
      <Stack>
        <ResourceInput<Patient> resourceType="Patient" name="patient" placeholder="Search the patient by name" onChange={(p) => setPatient(p)} />
        <Textarea label="Why the patient needs the bed" required value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Textarea label="Current condition (vital signs, level of consciousness)" value={condition} onChange={(e) => setCondition(e.currentTarget.value)} />
        <Group>
          <Checkbox label="On oxygen" checked={oxygen} onChange={(e) => setOxygen(e.currentTarget.checked)} />
          <Checkbox label="Needs ventilation" checked={ventilation} onChange={(e) => setVentilation(e.currentTarget.checked)} />
        </Group>
        <Text size="sm" c="dimmed">
          The hospital sees the patient’s age, sex and this summary. It sees the patient’s name and record only when it
          accepts.
        </Text>
        <Button loading={busy} disabled={!patient || !reason.trim()} onClick={() => send()}>
          Send the referral
        </Button>
      </Stack>
    </Modal>
  );
}

function ReferralList({ call, direction }: { readonly call: Call; readonly direction: 'incoming' | 'sent' }): JSX.Element {
  const medplum = useMedplum();
  const [list, setList] = useState<Referral[]>();
  const [accepting, setAccepting] = useState<Referral>();
  const [declining, setDeclining] = useState<Referral>();

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
    // New referrals and answers without reloading the page
    const timer = setInterval(tick, 20_000);
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
        <Card key={r.id} withBorder padding="sm">
          <Group justify="space-between" align="flex-start">
            <div>
              <Group gap="xs">
                <Text fw={700}>
                  {r.view.wardTypeDisplay} bed {direction === 'incoming' ? `from ${r.view.from}` : `at ${r.to}`}
                </Text>
                <Badge color={stateColor[r.state]}>{stateLabel[r.state]}</Badge>
              </Group>
              <Text size="sm">
                {[r.patient?.display, r.view.patient.gender, r.view.patient.age === undefined ? undefined : `${r.view.patient.age} years`]
                  .filter(Boolean)
                  .join(', ')}
                {r.view.referrer ? ` · referred by ${r.view.referrer}` : ''}
                {r.createdAt ? ` · ${formatDateTime(r.createdAt)}` : ''}
              </Text>
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
                {r.view.summary.ventilation ? <Badge variant="outline" color="red">Needs ventilation</Badge> : null}
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
            </div>
            <Group gap="xs">
              {direction === 'incoming' && r.state === 'waiting' ? (
                <>
                  <Button size="xs" onClick={() => setAccepting(r)}>
                    Accept
                  </Button>
                  <Button size="xs" variant="light" color="red" onClick={() => setDeclining(r)}>
                    Decline
                  </Button>
                </>
              ) : null}
              {direction === 'incoming' && r.state === 'accepted' ? (
                <Button size="xs" onClick={() => admit(r)}>
                  Admit now
                </Button>
              ) : null}
              {direction === 'sent' && (r.state === 'waiting' || r.state === 'accepted') ? (
                <Button size="xs" variant="light" color="gray" onClick={() => act(() => call('POST', `referrals/${r.id}/cancel`), 'Referral cancelled')}>
                  Cancel
                </Button>
              ) : null}
            </Group>
          </Group>
        </Card>
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
          act(() => call('POST', `referrals/${declining?.id}/decline`, { reason }), 'Referral declined').then(() => setDeclining(undefined))
        }
      />
    </Stack>
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
        <TextInput label="Why" placeholder="For example: no free bed after all, no specialist on call" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
        <Button color="red" onClick={() => props.onDecline(reason)}>
          Decline
        </Button>
      </Stack>
    </Modal>
  );
}
