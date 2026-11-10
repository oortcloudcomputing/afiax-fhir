// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { createReference, formatDate, normalizeErrorString } from '@medplum/core';
import type { Immunization, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { buildKenyaImmunization, getKenyaVaccineName, KenyaVaccines } from './kenya-immunization';

export interface KenyaImmunizationsProps {
  readonly patient: Patient;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * A patient's vaccinations, newest first, and a form to record one (DHA KPS Immunization profile,
 * ATC vaccine codes). Doses not given are recorded with the reason.
 * @param props - The component props.
 * @returns The immunization history and the record form.
 */
export function KenyaImmunizations(props: KenyaImmunizationsProps): JSX.Element {
  const { patient } = props;
  const medplum = useMedplum();
  const [immunizations, setImmunizations] = useState<Immunization[]>();
  const [vaccineCode, setVaccineCode] = useState<string | null>(null);
  const [doseNumber, setDoseNumber] = useState<number>(1);
  const [date, setDate] = useState(today());
  const [lotNumber, setLotNumber] = useState('');
  const [notGiven, setNotGiven] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const patientRef = `Patient/${patient.id}`;
  const vaccine = KenyaVaccines.find((v) => v.code === vaccineCode);

  const load = useCallback(() => {
    medplum
      .searchResources('Immunization', { patient: patientRef, _sort: '-date', _count: '200' }, { cache: 'no-cache' })
      .then(setImmunizations)
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, patientRef]);
  useEffect(load, [load]);

  const futureDate = date > today();
  const canSave = !!vaccine && !!date && !futureDate && doseNumber >= 1 && (!notGiven || !!reason.trim());

  async function save(): Promise<void> {
    if (!vaccine) {
      return;
    }
    setSaving(true);
    try {
      const profile = medplum.getProfile();
      await medplum.createResource(
        buildKenyaImmunization({
          patient,
          vaccine,
          doseNumber,
          // Noon Kenya time keeps the calendar date in any timezone
          occurrence: `${date}T12:00:00+03:00`,
          lotNumber: notGiven ? undefined : lotNumber,
          notGivenReason: notGiven ? reason : undefined,
          performer: profile ? (createReference(profile) as Reference) : undefined,
          location: patient.managingOrganization,
        })
      );
      showNotification({
        color: 'green',
        message: notGiven ? 'Dose recorded as not given' : `${vaccine.label} dose ${doseNumber} recorded`,
      });
      setVaccineCode(null);
      setDoseNumber(1);
      setDate(today());
      setLotNumber('');
      setNotGiven(false);
      setReason('');
      load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="md" data-testid="kenya-immunizations">
      <Paper withBorder p="md">
        <Stack gap="sm">
          <Title order={4}>Record vaccination</Title>
          <Group grow align="flex-start">
            <Select
              label="Vaccine"
              placeholder="Choose a vaccine"
              searchable
              data={KenyaVaccines.map((v) => ({ value: v.code, label: `${v.label} (${v.code})` }))}
              value={vaccineCode}
              onChange={(value) => {
                setVaccineCode(value);
                setDoseNumber(1);
              }}
            />
            <NumberInput
              label="Dose number"
              min={1}
              max={vaccine?.doses ?? 10}
              value={doseNumber}
              onChange={(value) => setDoseNumber(typeof value === 'number' ? value : 1)}
            />
            <TextInput
              label="Date given"
              type="date"
              max={today()}
              value={date}
              error={futureDate ? 'The date cannot be in the future' : undefined}
              onChange={(e) => setDate(e.currentTarget.value)}
            />
          </Group>
          <Group grow align="flex-start">
            <TextInput
              label="Batch / lot number"
              value={lotNumber}
              disabled={notGiven}
              onChange={(e) => setLotNumber(e.currentTarget.value)}
            />
            <Stack gap={4}>
              <Checkbox
                mt="xl"
                label="Not given"
                checked={notGiven}
                onChange={(e) => setNotGiven(e.currentTarget.checked)}
              />
              {notGiven && (
                <TextInput
                  label="Reason not given"
                  placeholder="e.g. child unwell, vaccine out of stock, caregiver declined"
                  value={reason}
                  onChange={(e) => setReason(e.currentTarget.value)}
                />
              )}
            </Stack>
          </Group>
          <Group justify="flex-end">
            <Button onClick={() => save()} loading={saving} disabled={!canSave}>
              Save vaccination
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Title order={4}>Vaccination history</Title>
      {immunizations?.length === 0 && <Text c="dimmed">No vaccinations recorded yet.</Text>}
      {!!immunizations?.length && (
        <Table striped>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Vaccine</Table.Th>
              <Table.Th>Dose</Table.Th>
              <Table.Th>Batch</Table.Th>
              <Table.Th>Status</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {immunizations.map((im) => (
              <Table.Tr key={im.id}>
                <Table.Td>{formatDate(im.occurrenceDateTime)}</Table.Td>
                <Table.Td>{getKenyaVaccineName(im)}</Table.Td>
                <Table.Td>{im.protocolApplied?.[0]?.doseNumberPositiveInt ?? ''}</Table.Td>
                <Table.Td>{im.lotNumber ?? ''}</Table.Td>
                <Table.Td>
                  {im.status === 'completed' ? (
                    <Badge color="green">Given</Badge>
                  ) : (
                    <Badge color="gray">
                      {im.status === 'not-done' ? `Not given: ${im.statusReason?.text ?? ''}` : im.status}
                    </Badge>
                  )}
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
