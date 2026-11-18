// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Button, Divider, Group, Stack } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getKenyaPrescriptionCode, getReferenceString, normalizeErrorString } from '@medplum/core';
import type { Encounter, MedicationRequest } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconPrinter } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { KenyaOrderEntry } from './KenyaOrderEntry';
import { KenyaOrderHistory } from './KenyaOrderHistory';

/** Encounter statuses in which orders can be placed. */
const KenyaOrderableEncounterStatuses: readonly Encounter['status'][] = [
  'arrived',
  'triaged',
  'in-progress',
  'onleave',
];

export interface KenyaEncounterOrdersProps {
  readonly encounter: Encounter;
}

/**
 * The encounter's orders: the order form while the visit is active, and the order history with each
 * department's status.
 * @param props - The component props.
 * @returns The orders section.
 */
export function KenyaEncounterOrders(props: KenyaEncounterOrdersProps): JSX.Element {
  const { encounter } = props;
  const [version, setVersion] = useState(0);
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const active = KenyaOrderableEncounterStatuses.includes(encounter.status);
  const canPrint = useHasPrintablePrescription(encounter, version);
  return (
    <Stack gap="md" data-testid="kenya-encounter-orders">
      {active ? (
        <KenyaOrderEntry encounter={encounter} onPlaced={refresh} />
      ) : (
        <Alert color="gray">
          This encounter is {encounter.status}. Set it to in progress (or arrived) to place orders.
        </Alert>
      )}
      <Divider label="Orders in this encounter" labelPosition="left" />
      {canPrint && (
        <Group justify="flex-end">
          <KenyaPrintPrescriptionButton encounter={encounter} />
        </Group>
      )}
      <KenyaOrderHistory encounter={encounter} version={version} />
    </Stack>
  );
}

/**
 * Whether the visit has an active prescription with a prescription code (DHA eRx, ADR-016).
 * @param encounter - The visit.
 * @param version - Changes when orders are placed, to check again.
 * @returns True when there is something to print.
 */
function useHasPrintablePrescription(encounter: Encounter, version: number): boolean {
  const medplum = useMedplum();
  const [printable, setPrintable] = useState(false);
  useEffect(() => {
    if (!encounter.id) {
      return;
    }
    medplum
      .searchResources(
        'MedicationRequest',
        { encounter: getReferenceString(encounter), status: 'active,on-hold', _count: '100' },
        { cache: 'no-cache' }
      )
      .then((requests: MedicationRequest[]) => setPrintable(requests.some((r) => !!getKenyaPrescriptionCode(r))))
      .catch(() => setPrintable(false));
  }, [medplum, encounter, version]);
  return printable;
}

export interface KenyaPrintPrescriptionButtonProps {
  readonly encounter: Encounter;
}

/**
 * Opens the visit's printed prescription (Encounter/$kenya-prescription): each medicine with its
 * prescription code and QR code, for the patient to take to any pharmacy.
 * @param props - The component props.
 * @returns The button.
 */
export function KenyaPrintPrescriptionButton(props: KenyaPrintPrescriptionButtonProps): JSX.Element {
  const { encounter } = props;
  const medplum = useMedplum();
  const [loading, setLoading] = useState(false);

  function print(): void {
    // Open the window now: browsers block windows opened after waiting for the network
    const win = window.open('', '_blank');
    setLoading(true);
    medplum
      .download(medplum.fhirUrl('Encounter', encounter.id as string, '$kenya-prescription'), {
        headers: { Accept: 'application/pdf' },
      })
      .then(async (blob) => {
        if (blob.type !== 'application/pdf') {
          // An OperationOutcome came back instead of the PDF
          const outcome = JSON.parse(await blob.text());
          throw new Error(normalizeErrorString(outcome));
        }
        const url = URL.createObjectURL(blob);
        if (win) {
          win.location.href = url;
        } else {
          const link = document.createElement('a');
          link.href = url;
          link.download = 'prescription.pdf';
          link.click();
        }
      })
      .catch((err) => {
        win?.close();
        showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      })
      .finally(() => setLoading(false));
  }

  return (
    <Button variant="light" leftSection={<IconPrinter size={16} />} loading={loading} onClick={print}>
      Print prescription
    </Button>
  );
}
