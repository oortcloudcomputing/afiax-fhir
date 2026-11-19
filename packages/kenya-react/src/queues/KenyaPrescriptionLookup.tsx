// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Dispensing by prescription code (ADR-016 step 2): a patient brings a printed prescription, or
// shows its QR code. The pharmacist types or scans the code, sees what was prescribed, what is left
// and whether it can be dispensed, and dispenses all or part of it through $kenya-dispense (checked
// on the server: validity, what is left, two pharmacists at once).

import { Alert, Badge, Button, Group, NumberInput, Paper, Stack, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString, normalizeKenyaPrescriptionCode } from '@medplum/core';
import type { MedicationRequest, Parameters, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { ConfirmButton } from '../common/ConfirmButton';

interface Lookup {
  readonly prescription: MedicationRequest;
  readonly patient?: Patient;
  readonly state: string;
  readonly reason?: string;
  readonly prescribed?: number;
  readonly dispensed: number;
  readonly remaining?: number;
}

export interface KenyaPrescriptionLookupProps {
  /** Called after a dispense, so the queue reloads. */
  readonly onDispensed?: () => void;
}

/**
 * Find a prescription by its code and dispense it.
 * @param props - The component props.
 * @returns The lookup box and, once found, the prescription with a Dispense button.
 */
export function KenyaPrescriptionLookup(props: KenyaPrescriptionLookupProps): JSX.Element {
  const medplum = useMedplum();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [found, setFound] = useState<Lookup>();
  const [quantity, setQuantity] = useState<number | string>('');
  const [searching, setSearching] = useState(false);

  async function find(): Promise<void> {
    setError(undefined);
    setFound(undefined);
    if (!normalizeKenyaPrescriptionCode(code)) {
      setError('That is not a prescription code. Codes look like RX-7KQ2-M9XD-3T.');
      return;
    }
    setSearching(true);
    try {
      const url = medplum.fhirUrl('MedicationRequest', '$kenya-prescription-lookup');
      url.searchParams.set('code', code.trim());
      const result = parseLookup(await medplum.get<Parameters>(url, { cache: 'no-cache' }));
      setFound(result);
      setQuantity(result.remaining ?? '');
    } catch (err) {
      const message = normalizeErrorString(err);
      setError(/not found/i.test(message) ? 'No prescription with that code in this facility.' : message);
    } finally {
      setSearching(false);
    }
  }

  async function dispense(): Promise<void> {
    if (!found?.prescription.id) {
      return;
    }
    try {
      const parameters: Parameters = { resourceType: 'Parameters', parameter: [] };
      if (typeof quantity === 'number') {
        parameters.parameter?.push({ name: 'quantity', valueDecimal: quantity });
      }
      const result = parseLookup(
        await medplum.post<Parameters>(
          medplum.fhirUrl('MedicationRequest', found.prescription.id, '$kenya-dispense'),
          parameters
        ),
        found
      );
      showNotification({
        color: 'green',
        message:
          result.remaining && result.remaining > 0
            ? `Dispensed. ${result.remaining} left on this prescription.`
            : 'Dispensed. The prescription is complete.',
      });
      setFound(undefined);
      setCode('');
      setQuantity('');
      props.onDispensed?.();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }

  const medicine = found?.prescription.medicationCodeableConcept;
  const medicineName = medicine?.text ?? medicine?.coding?.[0]?.display ?? 'Medicine';
  const canDispense = found?.state === 'valid';
  const quantityError =
    typeof quantity === 'number' && found?.remaining !== undefined && quantity > found.remaining
      ? `Only ${found.remaining} left`
      : undefined;

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            find().catch(console.error);
          }}
        >
          <Group align="flex-end" gap="xs" wrap="wrap">
            <TextInput
              label="Prescription code"
              description="Type it from the printed prescription, or scan its QR code"
              placeholder="RX-7KQ2-M9XD-3T"
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              autoComplete="off"
              style={{ flex: '1 1 220px' }}
            />
            <Button type="submit" loading={searching}>
              Find
            </Button>
          </Group>
        </form>
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        {found && (
          <Stack gap="xs" data-testid="prescription-found">
            <Group justify="space-between" wrap="wrap">
              <Text fw={600}>{medicineName}</Text>
              <Badge color={canDispense ? 'green' : 'gray'}>{canDispense ? 'Can be dispensed' : found.state}</Badge>
            </Group>
            <Text size="sm">For {found.patient ? patientName(found.patient) : 'the patient on the prescription'}</Text>
            {found.prescription.dosageInstruction?.[0]?.text && (
              <Text size="sm">{found.prescription.dosageInstruction[0].text}</Text>
            )}
            <Text size="sm" c="dimmed">
              {found.prescribed !== undefined ? `Prescribed ${found.prescribed}` : 'No quantity on the prescription'}
              {` · dispensed ${found.dispensed}`}
              {found.remaining !== undefined ? ` · ${found.remaining} left` : ''}
            </Text>
            {!canDispense && found.reason && (
              <Alert color="orange" variant="light">
                {found.reason}
              </Alert>
            )}
            {canDispense && (
              <Group align="flex-end" gap="xs" wrap="wrap">
                <NumberInput
                  label="Quantity to hand over now"
                  description="Less than what is left records a part fill"
                  min={0}
                  max={found.remaining}
                  value={quantity}
                  onChange={setQuantity}
                  error={quantityError}
                  style={{ flex: '1 1 180px' }}
                />
                <ConfirmButton
                  title="Dispense medicine"
                  message={`Record that ${quantity === '' ? 'this medicine' : `${quantity} of ${medicineName}`} was handed to ${
                    found.patient ? patientName(found.patient) : 'the patient'
                  }? This cannot be undone from the queue.`}
                  disabled={!!quantityError || quantity === 0}
                  onConfirm={dispense}
                >
                  Dispense
                </ConfirmButton>
              </Group>
            )}
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}

function parseLookup(parameters: Parameters, previous?: Lookup): Lookup {
  const get = (name: string): NonNullable<Parameters['parameter']>[number] | undefined =>
    parameters.parameter?.find((p) => p.name === name);
  return {
    prescription: (get('prescription')?.resource as MedicationRequest | undefined) ?? (previous?.prescription as MedicationRequest),
    patient: (get('patient')?.resource as Patient | undefined) ?? previous?.patient,
    state: get('state')?.valueCode ?? 'unknown',
    reason: get('reason')?.valueString,
    prescribed: get('prescribed')?.valueDecimal,
    dispensed: get('dispensed')?.valueDecimal ?? 0,
    remaining: get('remaining')?.valueDecimal,
  };
}

function patientName(patient: Patient): string {
  const name = patient.name?.[0];
  return [name?.given?.join(' '), name?.family].filter(Boolean).join(' ') || `Patient/${patient.id}`;
}
