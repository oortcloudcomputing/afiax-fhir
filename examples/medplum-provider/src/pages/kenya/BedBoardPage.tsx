// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Card, Group, Modal, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaBedState, KenyaWardType, WithId } from '@medplum/core';
import {
  buildKenyaBed,
  buildKenyaWard,
  formatHumanName,
  getKenyaBedState,
  getKenyaWardType,
  getReferenceString,
  KenyaLocationKindSystem,
  KenyaWardTypes,
  normalizeErrorString,
} from '@medplum/core';
import type { Encounter, Location, Parameters, Patient, Reference, Resource } from '@medplum/fhirtypes';
import { Document, ResourceInput, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';

/** How each bed state looks on the board. */
const stateLook: Record<KenyaBedState, { label: string; color: string }> = {
  U: { label: 'Free', color: 'green' },
  O: { label: 'Occupied', color: 'blue' },
  H: { label: 'Cleaning', color: 'yellow' },
  C: { label: 'Closed', color: 'gray' },
};

interface Board {
  wards: WithId<Location>[];
  beds: WithId<Location>[];
  /** Who is in each bed ("Location/<id>"), from the active inpatient Encounters. */
  occupants: Map<string, { encounter: WithId<Encounter>; patient?: Patient }>;
}

/**
 * The bed board (ADR-018 §C): each ward with its beds, free, occupied, being cleaned or closed.
 * Nurses and bed managers admit, transfer and discharge patients from here; every change goes
 * through Location/$kenya-bed, which checks the bed first.
 * @returns The bed board page.
 */
export function BedBoardPage(): JSX.Element {
  const medplum = useMedplum();
  const [board, setBoard] = useState<Board>();
  const [bedFor, setBedFor] = useState<{ bed: WithId<Location>; action: 'admit' | 'transfer' | 'close' }>();
  const [adding, setAdding] = useState<'ward' | WithId<Location>>();

  const fetchBoard = useCallback(async (): Promise<Board> => {
    const kind = (code: string): string => `${KenyaLocationKindSystem}|${code}`;
    const [wards, beds, inpatients] = await Promise.all([
      medplum.searchResources('Location', { type: kind('ward'), _count: '200', _sort: 'name' }, { cache: 'no-cache' }),
      medplum.searchResources('Location', { type: kind('bed'), _count: '1000', _sort: 'name' }, { cache: 'no-cache' }),
      medplum.search('Encounter', { class: 'IMP', status: 'in-progress', _include: 'Encounter:subject', _count: '1000' }, { cache: 'no-cache' }),
    ]);
    // _include brings the patients into the same bundle as the encounters
    const included = (inpatients.entry ?? []).map((x) => x.resource as Resource | undefined);
    const patients = new Map(
      included.filter((r): r is WithId<Patient> => r?.resourceType === 'Patient').map((p) => [getReferenceString(p), p])
    );
    const occupants = new Map<string, { encounter: WithId<Encounter>; patient?: Patient }>();
    for (const e of included) {
      if (e?.resourceType !== 'Encounter') {
        continue;
      }
      const at = e.location?.find((l) => l.status === 'active')?.location.reference;
      if (at) {
        occupants.set(at, { encounter: e as WithId<Encounter>, patient: patients.get(e.subject?.reference ?? '') });
      }
    }
    return { wards, beds, occupants };
  }, [medplum]);

  const reload = useCallback(async (): Promise<void> => setBoard(await fetchBoard()), [fetchBoard]);

  useEffect(() => {
    fetchBoard()
      .then(setBoard)
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [fetchBoard]);

  async function act(bed: WithId<Location>, action: string, extra: NonNullable<Parameters['parameter']> = []): Promise<void> {
    try {
      await medplum.post(medplum.fhirUrl('Location', bed.id, '$kenya-bed'), {
        resourceType: 'Parameters',
        parameter: [{ name: 'action', valueCode: action }, ...extra],
      });
      setBedFor(undefined);
      await reload();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
      await reload();
    }
  }

  if (!board) {
    return (
      <Document>
        <Text>Loading the bed board…</Text>
      </Document>
    );
  }

  const freeBeds = board.beds.filter((b) => getKenyaBedState(b) === 'U');
  const totals = (beds: Location[]): string => {
    const free = beds.filter((b) => getKenyaBedState(b) === 'U').length;
    return `${free} free of ${beds.length}`;
  };

  return (
    <Document>
      <Group justify="space-between" mb="md">
        <div>
          <Title order={2}>Bed board</Title>
          <Text c="dimmed">{totals(board.beds)} beds</Text>
        </div>
        <Button variant="light" onClick={() => setAdding('ward')}>
          Add a ward
        </Button>
      </Group>

      {board.wards.length === 0 ? (
        <Text c="dimmed">No wards yet. Add your wards, then their beds.</Text>
      ) : null}

      <Stack gap="xl">
        {board.wards.map((ward) => {
          const beds = board.beds.filter((b) => b.partOf?.reference === getReferenceString(ward));
          const type = getKenyaWardType(ward);
          return (
            <div key={ward.id}>
              <Group justify="space-between" mb="xs">
                <Group gap="xs">
                  <Title order={4}>{ward.name}</Title>
                  {type ? <Badge variant="outline">{KenyaWardTypes[type]}</Badge> : null}
                  <Text size="sm" c="dimmed">
                    {totals(beds)}
                  </Text>
                </Group>
                <Button size="xs" variant="subtle" onClick={() => setAdding(ward)}>
                  Add beds
                </Button>
              </Group>
              <SimpleGrid cols={{ base: 2, sm: 4, lg: 6 }} spacing="sm">
                {beds.map((bed) => {
                  const state = getKenyaBedState(bed);
                  const who = board.occupants.get(getReferenceString(bed));
                  const name = who?.patient?.name?.[0] ? formatHumanName(who.patient.name[0]) : undefined;
                  return (
                    <Card key={bed.id} withBorder padding="sm" data-testid={`bed-${bed.name}`}>
                      <Group justify="space-between" mb={4}>
                        <Text fw={700}>{bed.name}</Text>
                        <Badge color={stateLook[state].color}>{stateLook[state].label}</Badge>
                      </Group>
                      <Text size="sm" mih={20}>
                        {bedCaption(state, name, bed.description)}
                      </Text>
                      <Group gap={4} mt="xs">
                        {state === 'U' ? (
                          <>
                            <Button size="compact-xs" onClick={() => setBedFor({ bed, action: 'admit' })}>
                              Admit
                            </Button>
                            <Button size="compact-xs" variant="subtle" color="gray" onClick={() => setBedFor({ bed, action: 'close' })}>
                              Close
                            </Button>
                          </>
                        ) : null}
                        {state === 'O' ? (
                          <>
                            <Button size="compact-xs" variant="light" onClick={() => setBedFor({ bed, action: 'transfer' })}>
                              Transfer
                            </Button>
                            <Button size="compact-xs" variant="light" color="red" onClick={() => act(bed, 'discharge')}>
                              Discharge
                            </Button>
                          </>
                        ) : null}
                        {state === 'H' ? (
                          <Button size="compact-xs" variant="light" color="green" onClick={() => act(bed, 'cleaned')}>
                            Cleaned
                          </Button>
                        ) : null}
                        {state === 'C' ? (
                          <Button size="compact-xs" variant="light" onClick={() => act(bed, 'reopen')}>
                            Reopen
                          </Button>
                        ) : null}
                      </Group>
                    </Card>
                  );
                })}
              </SimpleGrid>
            </div>
          );
        })}
      </Stack>

      <BedDialog
        target={bedFor}
        freeBeds={freeBeds}
        wards={board.wards}
        onClose={() => setBedFor(undefined)}
        onDone={(bed, action, extra) => act(bed, action, extra)}
      />
      <AddDialog
        target={adding}
        onClose={() => setAdding(undefined)}
        onAdded={async () => {
          setAdding(undefined);
          await reload();
        }}
      />
    </Document>
  );
}

/**
 * What a bed tile says under its label.
 * @param state - The bed's state.
 * @param patientName - The occupant's name.
 * @param closedWhy - Why it is closed.
 * @returns The caption.
 */
function bedCaption(state: KenyaBedState, patientName: string | undefined, closedWhy: string | undefined): string {
  if (state === 'O') {
    return patientName ?? 'Patient';
  }
  return state === 'C' ? (closedWhy ?? '') : '';
}

function BedDialog(props: {
  readonly target?: { bed: WithId<Location>; action: 'admit' | 'transfer' | 'close' };
  readonly freeBeds: WithId<Location>[];
  readonly wards: WithId<Location>[];
  readonly onClose: () => void;
  readonly onDone: (bed: WithId<Location>, action: string, extra: NonNullable<Parameters['parameter']>) => Promise<void>;
}): JSX.Element {
  const { target } = props;
  const [patient, setPatient] = useState<Reference<Patient>>();
  const [toBed, setToBed] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const wardName = (b: Location): string => props.wards.find((w) => getReferenceString(w) === b.partOf?.reference)?.name ?? '';
  const titles = { admit: 'Admit a patient', transfer: 'Move to another bed', close: 'Close this bed' };
  return (
    <Modal opened={!!target} onClose={props.onClose} title={target ? `${titles[target.action]}: ${target.bed.name}` : ''}>
      {target?.action === 'admit' ? (
        <Stack>
          <ResourceInput<Patient>
            resourceType="Patient"
            name="patient"
            placeholder="Search the patient by name"
            onChange={(p) => setPatient(p ? { reference: `Patient/${p.id}`, display: p.name?.[0] ? formatHumanName(p.name[0]) : undefined } : undefined)}
          />
          <Button disabled={!patient} onClick={() => props.onDone(target.bed, 'admit', [{ name: 'patient', valueReference: patient }])}>
            Admit
          </Button>
        </Stack>
      ) : null}
      {target?.action === 'transfer' ? (
        <Stack>
          <Select
            label="Free bed"
            placeholder={props.freeBeds.length ? 'Choose a bed' : 'No free beds'}
            data={props.freeBeds.filter((b) => b.id !== target.bed.id).map((b) => ({ value: b.id, label: `${wardName(b)}: ${b.name}` }))}
            value={toBed}
            onChange={setToBed}
            searchable
          />
          <Button disabled={!toBed} onClick={() => props.onDone(target.bed, 'transfer', [{ name: 'toBed', valueReference: { reference: `Location/${toBed}` } }])}>
            Move the patient
          </Button>
        </Stack>
      ) : null}
      {target?.action === 'close' ? (
        <Stack>
          <TextInput label="Why" placeholder="For example: broken oxygen point" value={reason} onChange={(e) => setReason(e.currentTarget.value)} />
          <Button color="gray" onClick={() => props.onDone(target.bed, 'close', reason.trim() ? [{ name: 'reason', valueString: reason.trim() }] : [])}>
            Close the bed
          </Button>
        </Stack>
      ) : null}
    </Modal>
  );
}

function AddDialog(props: {
  readonly target?: 'ward' | WithId<Location>;
  readonly onClose: () => void;
  readonly onAdded: () => Promise<void>;
}): JSX.Element {
  const medplum = useMedplum();
  const [name, setName] = useState('');
  const [type, setType] = useState<KenyaWardType>('general');
  const [count, setCount] = useState('4');
  const ward = props.target && props.target !== 'ward' ? props.target : undefined;

  async function save(): Promise<void> {
    try {
      if (!ward) {
        await medplum.createResource(buildKenyaWard(name.trim(), type));
      } else {
        const n = Math.min(Math.max(Number(count) || 0, 1), 60);
        const prefix = name.trim() || 'Bed';
        for (let i = 1; i <= n; i++) {
          await medplum.createResource(buildKenyaBed(`${prefix} ${i}`, ward));
        }
      }
      setName('');
      await props.onAdded();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  return (
    <Modal opened={!!props.target} onClose={props.onClose} title={ward ? `Add beds to ${ward.name}` : 'Add a ward'}>
      <Stack>
        {ward ? (
          <>
            <TextInput label="Bed label" placeholder="Bed" value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <TextInput label="How many" value={count} onChange={(e) => setCount(e.currentTarget.value)} />
          </>
        ) : (
          <>
            <TextInput label="Ward name" placeholder="For example: ICU, Female medical" value={name} onChange={(e) => setName(e.currentTarget.value)} />
            <Select
              label="Type"
              data={Object.entries(KenyaWardTypes).map(([value, label]) => ({ value, label }))}
              value={type}
              onChange={(v) => v && setType(v as KenyaWardType)}
            />
          </>
        )}
        <Button disabled={!ward && !name.trim()} onClick={() => save()}>
          {ward ? 'Add beds' : 'Add the ward'}
        </Button>
      </Stack>
    </Modal>
  );
}
