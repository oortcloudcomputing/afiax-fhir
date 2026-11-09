// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, Paper, Stack, Text, Textarea } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { DocumentReference, Encounter, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildKenyaNursingNote, getKenyaNursingNoteText, NurseNoteType } from './kenya-nursing';

export interface KenyaNursingNotesProps {
  readonly encounter: Encounter;
}

/**
 * Nursing notes for a visit, newest first, with a box to add one. Notes cannot be edited once saved.
 * @param props - The component props.
 * @returns The nursing notes.
 */
export function KenyaNursingNotes(props: KenyaNursingNotesProps): JSX.Element {
  const { encounter } = props;
  const medplum = useMedplum();
  const [notes, setNotes] = useState<DocumentReference[]>();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const encounterRef = `Encounter/${encounter.id}`;

  const load = useCallback(() => {
    medplum
      .searchResources(
        'DocumentReference',
        { encounter: encounterRef, type: `${NurseNoteType.system}|${NurseNoteType.code}`, _sort: '-date' },
        { cache: 'no-cache' }
      )
      .then(setNotes)
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, encounterRef]);
  useEffect(load, [load]);

  async function save(): Promise<void> {
    setSaving(true);
    try {
      const profile = medplum.getProfile();
      await medplum.createResource(
        buildKenyaNursingNote(encounter, text, profile ? (createReference(profile) as Reference) : undefined)
      );
      setText('');
      load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="sm" data-testid="kenya-nursing-notes">
      <Textarea
        label="New nursing note"
        placeholder="Observations, care given, patient's condition, handover"
        autosize
        minRows={3}
        value={text}
        onChange={(e) => setText(e.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button onClick={() => save()} loading={saving} disabled={!text.trim()}>
          Save note
        </Button>
      </Group>
      {notes?.length === 0 && <Text c="dimmed">No nursing notes in this visit yet.</Text>}
      {notes?.map((note) => (
        <Paper key={note.id} withBorder p="sm">
          <Text size="xs" c="dimmed">
            {formatDateTime(note.date)}
            {note.author?.[0]?.display ? ` · ${note.author[0].display}` : ''}
          </Text>
          <Text style={{ whiteSpace: 'pre-wrap' }}>{getKenyaNursingNoteText(note)}</Text>
        </Paper>
      ))}
    </Stack>
  );
}
