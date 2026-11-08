// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Group, Modal, Stack, Table, Text, Textarea, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Encounter, MedicationAdministration, MedicationRequest, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildKenyaMedicationAdministration } from './kenya-nursing';

export interface KenyaMedicationAdministrationRecordProps {
  readonly encounter: Encounter;
}

interface MarData {
  readonly requests: MedicationRequest[];
  readonly administrations: MedicationAdministration[];
}

interface DoseDialog {
  readonly request: MedicationRequest;
  readonly given: boolean;
}

/**
 * The medication administration record (MAR) for a visit: each prescription with the doses given or
 * not given, and buttons to record the next one.
 * @param props - The component props.
 * @returns The MAR.
 */
export function KenyaMedicationAdministrationRecord(props: KenyaMedicationAdministrationRecordProps): JSX.Element {
  const { encounter } = props;
  const medplum = useMedplum();
  const [data, setData] = useState<MarData>();
  const [dialog, setDialog] = useState<DoseDialog>();
  const encounterRef = `Encounter/${encounter.id}`;

  const load = useCallback(() => {
    const options = { cache: 'no-cache' as const };
    Promise.all([
      medplum.searchResources('MedicationRequest', { encounter: encounterRef, _count: '100' }, options),
      medplum.searchResources(
        'MedicationAdministration',
        { context: encounterRef, _sort: '-effective-time', _count: '500' },
        options
      ),
    ])
      .then(([requests, administrations]) =>
        setData({
          requests: requests.filter((r) => r.status === 'active' || r.status === 'completed' || r.status === 'on-hold'),
          administrations,
        })
      )
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, encounterRef]);
  useEffect(load, [load]);

  if (!data) {
    return <Text c="dimmed">Loading…</Text>;
  }
  if (data.requests.length === 0) {
    return <Text c="dimmed">No medicines prescribed in this visit.</Text>;
  }

  return (
    <Stack gap="md" data-testid="kenya-mar">
      {data.requests.map((request) => {
        const doses = data.administrations.filter((a) => a.request?.reference === `MedicationRequest/${request.id}`);
        return (
          <Stack key={request.id} gap="xs">
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text fw={600}>{request.medicationCodeableConcept?.text ?? 'Medicine'}</Text>
                <Text size="sm" c="dimmed">
                  {request.dosageInstruction?.[0]?.text}
                </Text>
              </div>
              {request.status === 'active' ? (
                <Group gap="xs" wrap="nowrap">
                  <Button size="xs" onClick={() => setDialog({ request, given: true })}>
                    Record dose
                  </Button>
                  <Button size="xs" variant="light" color="orange" onClick={() => setDialog({ request, given: false })}>
                    Not given
                  </Button>
                </Group>
              ) : (
                <Badge variant="light" color="gray">
                  {request.status}
                </Badge>
              )}
            </Group>
            {doses.length === 0 ? (
              <Text size="sm" c="dimmed">
                No doses recorded.
              </Text>
            ) : (
              <Table>
                <Table.Tbody>
                  {doses.map((dose) => (
                    <Table.Tr key={dose.id}>
                      <Table.Td w={180}>{formatDateTime(dose.effectiveDateTime)}</Table.Td>
                      <Table.Td w={110}>
                        <Badge color={dose.status === 'completed' ? 'green' : 'orange'} variant="light">
                          {dose.status === 'completed' ? 'Given' : 'Not given'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>
                        {dose.status === 'completed' ? dose.dosage?.text : dose.statusReason?.[0]?.text}
                        {dose.note?.[0]?.text ? ` · ${dose.note[0].text}` : ''}
                      </Table.Td>
                      <Table.Td>{dose.performer?.[0]?.actor?.display}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Stack>
        );
      })}
      {dialog && (
        <DoseDialogForm
          encounter={encounter}
          dialog={dialog}
          onClose={() => setDialog(undefined)}
          onSaved={() => {
            setDialog(undefined);
            load();
          }}
        />
      )}
    </Stack>
  );
}

function DoseDialogForm(props: {
  readonly encounter: Encounter;
  readonly dialog: DoseDialog;
  readonly onClose: () => void;
  readonly onSaved: () => void;
}): JSX.Element {
  const { encounter, dialog, onClose, onSaved } = props;
  const medplum = useMedplum();
  const [when, setWhen] = useState(() => toLocalInput(new Date()));
  const [doseText, setDoseText] = useState(dialog.request.dosageInstruction?.[0]?.text ?? '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const medicine = dialog.request.medicationCodeableConcept?.text ?? 'Medicine';

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const profile = medplum.getProfile();
      await medplum.createResource(
        buildKenyaMedicationAdministration({
          request: dialog.request,
          encounter,
          given: dialog.given,
          when: new Date(when).toISOString(),
          doseText,
          note,
          performer: profile ? (createReference(profile) as Reference) : undefined,
        })
      );
      showNotification({ color: 'green', message: dialog.given ? 'Dose recorded' : 'Recorded as not given' });
      onSaved();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      opened
      onClose={onClose}
      title={dialog.given ? `Record dose: ${medicine}` : `Not given: ${medicine}`}
      centered
    >
      <Stack gap="sm">
        <TextInput label="Time" type="datetime-local" value={when} onChange={(e) => setWhen(e.currentTarget.value)} />
        {dialog.given && (
          <TextInput label="Dose given" value={doseText} onChange={(e) => setDoseText(e.currentTarget.value)} />
        )}
        <Textarea
          label={dialog.given ? 'Note' : 'Reason not given'}
          description={dialog.given ? undefined : 'For example: patient refused, vomiting, nil by mouth, not in stock'}
          required={!dialog.given}
          autosize
          minRows={2}
          value={note}
          onChange={(e) => setNote(e.currentTarget.value)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={saving}>
            Go back
          </Button>
          <Button onClick={() => save()} loading={saving} disabled={!when || (!dialog.given && !note.trim())}>
            {dialog.given ? 'Save dose' : 'Save as not given'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

function toLocalInput(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
