// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, NumberInput, SimpleGrid, Stack, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaVitalSign } from '@medplum/core';
import {
  buildKenyaVitalSignObservations,
  calculateKenyaBmi,
  getKenyaBmiCategory,
  KenyaVitalSigns,
  normalizeErrorString,
} from '@medplum/core';
import type { Encounter, Patient, Reference } from '@medplum/fhirtypes';
import { useMedplum, useResource } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

export interface KenyaVitalSignsFormProps {
  /** The (active) encounter the readings belong to. */
  readonly encounter: Encounter;
  /** Called after readings are saved. */
  readonly onSaved?: () => void;
}

/**
 * Vital signs entry for a visit: each reading becomes an Observation (BMI calculated from weight and
 * height for adults). Readings outside NEWS2 or critical limits raise a clinical alert on the server.
 * @param props - The component props.
 * @returns The vital signs form.
 */
export function KenyaVitalSignsForm(props: KenyaVitalSignsFormProps): JSX.Element {
  const { encounter, onSaved } = props;
  const medplum = useMedplum();
  const patient = useResource(encounter.subject as Reference<Patient>);
  const [readings, setReadings] = useState<Partial<Record<KenyaVitalSign['key'], number>>>({});
  const [saving, setSaving] = useState(false);
  const bmi = calculateKenyaBmi(readings.weight, readings.height);
  const isAdult = isAdultPatient(patient);

  function set(key: KenyaVitalSign['key'], value: number | string): void {
    setReadings((r) => ({ ...r, [key]: typeof value === 'number' ? value : undefined }));
  }

  async function save(): Promise<void> {
    const observations = buildKenyaVitalSignObservations(
      readings,
      {
        subject: encounter.subject as Reference<Patient>,
        encounter: { reference: `Encounter/${encounter.id}` },
        effectiveDateTime: new Date().toISOString(),
        performer: medplum.getProfile()
          ? [{ reference: `${medplum.getProfile()?.resourceType}/${medplum.getProfile()?.id}` }]
          : undefined,
      },
      isAdult
    );
    setSaving(true);
    try {
      for (const observation of observations) {
        await medplum.createResource(observation);
      }
      showNotification({ color: 'green', message: `${observations.length} vital-sign records saved` });
      setReadings({});
      onSaved?.();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, sm: 3 }}>
        {KenyaVitalSigns.map((v) => (
          <NumberInput
            key={v.key}
            label={`${v.display} (${v.unit})`}
            decimalScale={1}
            value={readings[v.key] ?? ''}
            onChange={(value) => set(v.key, value)}
          />
        ))}
      </SimpleGrid>
      {bmi !== undefined && (
        <Text data-testid="bmi">
          BMI: <b>{bmi}</b> kg/m²{isAdult ? ` (${getKenyaBmiCategory(bmi)})` : ' (use the growth chart for children)'}
        </Text>
      )}
      <Text size="xs" c="dimmed">
        Readings outside NEWS2 or critical limits raise a clinical alert on the patient record.
      </Text>
      <Group justify="flex-end">
        <Button
          onClick={() => save()}
          loading={saving}
          disabled={Object.values(readings).every((v) => v === undefined)}
        >
          Save vital signs
        </Button>
      </Group>
    </Stack>
  );
}

function isAdultPatient(patient: Patient | undefined): boolean {
  if (!patient?.birthDate) {
    return true;
  }
  const ageMs = Date.now() - new Date(patient.birthDate).getTime();
  return ageMs >= 18 * 365.25 * 24 * 60 * 60 * 1000;
}
