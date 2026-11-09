// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Button, Divider, Group, NativeSelect, NumberInput, Stack, Table, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { getReferenceString, normalizeErrorString } from '@medplum/core';
import type { ChargeItem, Encounter, Invoice, Money, Parameters } from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmButton } from '../common/ConfirmButton';
import { getVisitInvoices } from './kenya-billing';

export interface KenyaVisitBillingProps {
  readonly encounter: Encounter;
  /** Called after a bill is issued or a payment recorded. */
  readonly onChange?: () => void;
}

interface BillingData {
  readonly charges: ChargeItem[];
  readonly invoices: Invoice[];
}

const paymentMethods = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa-manual', label: 'M-Pesa (confirmation code)' },
  { value: 'card', label: 'Card' },
];

/**
 * The visit's charges (raised by orders), its bill (Encounter/$kenya-invoice) and patient payments
 * against the bill (Invoice/$kenya-payment: cash, card or M-Pesa).
 * @param props - The component props.
 * @returns The billing section.
 */
export function KenyaVisitBilling(props: KenyaVisitBillingProps): JSX.Element {
  const { encounter, onChange } = props;
  const medplum = useMedplum();
  const [data, setData] = useState<BillingData>();
  const encounterRef = `Encounter/${encounter.id}`;
  const patientRef = encounter.subject?.reference as string;

  const load = useCallback(() => {
    const options = { cache: 'no-cache' as const };
    Promise.all([
      medplum.searchResources('ChargeItem', { context: encounterRef, _count: '200' }, options),
      medplum.searchResources('Invoice', { subject: patientRef, _sort: '-date', _count: '100' }, options),
    ])
      .then(([charges, invoices]) => setData({ charges, invoices: getVisitInvoices(invoices, charges, encounterRef) }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, encounterRef, patientRef]);
  useEffect(load, [load]);

  const changed = useCallback(() => {
    load();
    onChange?.();
  }, [load, onChange]);

  async function createBill(): Promise<void> {
    try {
      const result = await medplum.post<Parameters>(
        medplum.fhirUrl('Encounter', encounter.id as string, '$kenya-invoice'),
        { resourceType: 'Parameters' }
      );
      const total = result.parameter?.find((p) => p.name === 'total')?.valueMoney;
      showNotification({ color: 'green', message: `Bill issued: ${money(total)}` });
      changed();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }

  if (!data) {
    return <Text c="dimmed">Loading…</Text>;
  }
  const unbilled = data.charges.filter((c) => c.status === 'billable');
  const unpriced = unbilled.filter((c) => typeof c.priceOverride?.value !== 'number');
  const unbilledTotal = unbilled.reduce((sum, c) => sum + (c.priceOverride?.value ?? 0), 0);

  return (
    <Stack gap="sm" data-testid="kenya-visit-billing">
      <Divider label="Charges" labelPosition="left" />
      {data.charges.length === 0 ? (
        <Text c="dimmed">No charges yet. Charges are raised when orders are placed.</Text>
      ) : (
        <Table striped>
          <Table.Tbody>
            {data.charges.map((c) => (
              <Table.Tr key={c.id}>
                <Table.Td>
                  <MedplumLink to={c}>{c.code?.text ?? c.code?.coding?.[0]?.display}</MedplumLink>
                </Table.Td>
                <Table.Td>{c.quantity?.value}</Table.Td>
                <Table.Td>{typeof c.priceOverride?.value === 'number' ? money(c.priceOverride) : 'No price'}</Table.Td>
                <Table.Td>
                  <Badge variant="light" color={c.status === 'billed' ? 'green' : 'gray'}>
                    {c.status}
                  </Badge>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
      {unpriced.length > 0 && (
        <Text size="sm" c="orange">
          {unpriced.length} charge(s) have no price on the facility price list. Open each one and set its price before
          billing.
        </Text>
      )}
      {unbilled.length > 0 && (
        <Group justify="flex-end">
          <ConfirmButton
            title="Create bill"
            message={`Bill ${unbilled.length} unbilled charge(s), KES ${unbilledTotal.toLocaleString()}, as one invoice for this visit?`}
            disabled={unpriced.length > 0}
            onConfirm={createBill}
          >
            Create bill
          </ConfirmButton>
        </Group>
      )}

      <Divider label="Bills" labelPosition="left" />
      {data.invoices.length === 0 && <Text c="dimmed">No bill for this visit yet.</Text>}
      {data.invoices.map((invoice) => (
        <InvoiceRow key={invoice.id} invoice={invoice} onPaid={changed} />
      ))}
    </Stack>
  );
}

function InvoiceRow(props: { readonly invoice: Invoice; readonly onPaid: () => void }): JSX.Element {
  const { invoice, onPaid } = props;
  const medplum = useMedplum();
  const [method, setMethod] = useState('cash');
  const [amount, setAmount] = useState<number | string>('');
  const [reference, setReference] = useState('');
  const [paying, setPaying] = useState(false);
  const [receipt, setReceipt] = useState<string>();
  const number = invoice.identifier?.[0]?.value ?? getReferenceString(invoice as Invoice & { id: string });
  const needsReference = method !== 'cash';

  async function pay(): Promise<void> {
    if (typeof amount !== 'number') {
      return;
    }
    const parameter: Parameters['parameter'] = [
      { name: 'method', valueCode: method },
      { name: 'amount', valueDecimal: amount },
    ];
    if (reference.trim()) {
      parameter.push({ name: 'transactionRef', valueString: reference.trim() });
    }
    setPaying(true);
    try {
      const result = await medplum.post<Parameters>(
        medplum.fhirUrl('Invoice', invoice.id as string, '$kenya-payment'),
        { resourceType: 'Parameters', parameter }
      );
      const receiptNumber = result.parameter?.find((p) => p.name === 'receiptNumber')?.valueString;
      const balance = result.parameter?.find((p) => p.name === 'balance')?.valueMoney;
      setReceipt(`Payment recorded. Receipt ${receiptNumber ?? '—'}. Balance ${money(balance)}.`);
      setAmount('');
      setReference('');
      onPaid();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setPaying(false);
    }
  }

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <MedplumLink to={invoice}>Bill {number}</MedplumLink>
        <Text>{money(invoice.totalGross)}</Text>
        <Badge color={invoice.status === 'balanced' ? 'green' : 'blue'} variant="light">
          {invoice.status === 'balanced' ? 'paid' : invoice.status}
        </Badge>
      </Group>
      {receipt && (
        <Text size="sm" c="green" data-testid="payment-receipt">
          {receipt}
        </Text>
      )}
      {invoice.status === 'issued' && (
        <Group align="flex-end" grow>
          <NativeSelect
            label="Payment method"
            data={paymentMethods}
            value={method}
            onChange={(e) => setMethod(e.currentTarget.value)}
          />
          <NumberInput label="Amount (KES)" min={1} value={amount} onChange={setAmount} />
          <TextInput
            label={method === 'card' ? 'Card authorisation' : 'M-Pesa code'}
            disabled={!needsReference}
            value={reference}
            onChange={(e) => setReference(e.currentTarget.value)}
          />
          <Button
            onClick={() => pay()}
            loading={paying}
            disabled={typeof amount !== 'number' || (needsReference && !reference.trim())}
          >
            Record payment
          </Button>
        </Group>
      )}
    </Stack>
  );
}

function money(value: Money | undefined): string {
  return `${value?.currency ?? 'KES'} ${(value?.value ?? 0).toLocaleString()}`;
}
