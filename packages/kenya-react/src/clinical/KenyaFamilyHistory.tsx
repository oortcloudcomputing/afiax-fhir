// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Select, SimpleGrid, Stack, Table, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { KenyaFamilyRelationships, normalizeErrorString } from '@medplum/core';
import type { Coding, Encounter, FamilyMemberHistory, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { KnhtsCodeInput } from '../coding/KnhtsCodeInput';

export interface KenyaFamilyHistoryProps {
  /** The visit (its patient's family history is shown and added to). */
  readonly encounter: Encounter;
}

/**
 * The patient's family history: relatives' conditions, coded in ICD-11 from KNHTS.
 * @param props - The component props.
 * @returns The family history list and form.
 */
export function KenyaFamilyHistory(props: KenyaFamilyHistoryProps): JSX.Element {
  const { encounter } = props;
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
