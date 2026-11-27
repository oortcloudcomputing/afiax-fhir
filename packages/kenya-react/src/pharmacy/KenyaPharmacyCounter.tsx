// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The pharmacy workspace's Counter sale tab: over-the-counter medicines for a walk-in customer.
// afiax-services finds the items (price and stock from ERPNext) and records the sale as a POS Sales
// Invoice; prices shown here are for the till only, the server prices the sale again. Prescription-
// only and controlled medicines cannot be added: they are dispensed against a prescription.

import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { formatHumanName, normalizeErrorString } from '@medplum/core';
import type { HumanName } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import { IconTrash } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useMemo, useState } from 'react';
import type { CounterReceipt } from './counter-receipt';
import { buildCounterReceiptHtml, money } from './counter-receipt';
import { printHtml } from './dispense-label';

export type CounterPayment = 'Cash' | 'M-Pesa' | 'Card';

/** An item as afiax-services reports it (GET /pharmacy/counter/items). */
export interface CounterItem {
  readonly itemCode: string;
  readonly itemName?: string;
  readonly uom?: string;
  readonly price?: number;
  readonly currency: string;
  readonly onHand: number;
  readonly prescriptionOnly: boolean;
  readonly controlled: boolean;
  readonly blocked?: string;
}

/** A recorded sale (POST /pharmacy/counter/sale). */
export interface CounterSale {
  readonly invoice: string;
  readonly total: number;
  readonly currency: string;
  readonly payment: CounterPayment;
  readonly reference?: string;
  readonly lines: readonly { itemCode: string; itemName?: string; qty: number; rate: number; amount: number }[];
  readonly postedAt: string;
}

interface CartLine {
  readonly item: CounterItem;
  readonly qty: number;
}

const MpesaReceipt = /^[A-Z0-9]{8,12}$/;

/**
 * Why the sale cannot be completed yet, or undefined when it can.
 * @param cart - The lines.
 * @param payment - How it is paid.
 * @param reference - M-Pesa receipt code or card slip.
 * @param tendered - Cash handed over.
 * @returns The reason, in words.
 */
export function counterSaleProblem(
  cart: readonly CartLine[],
  payment: CounterPayment,
  reference: string,
  tendered: number | undefined
): string | undefined {
  if (!cart.length) {
    return 'Add an item';
  }
  const over = cart.find((l) => l.qty > l.item.onHand);
  if (over) {
    return `Only ${over.item.onHand} of ${over.item.itemName ?? over.item.itemCode} in the dispensary`;
  }
  if (payment === 'M-Pesa' && !MpesaReceipt.test(reference.trim().toUpperCase())) {
    return 'Enter the M-Pesa receipt code';
  }
  const total = cartTotal(cart);
  if (payment === 'Cash' && tendered !== undefined && tendered < total) {
    return 'Cash given is less than the total';
  }
  return undefined;
}

/**
 * The cart's total at the till's prices.
 * @param cart - The lines.
 * @returns The total.
 */
export function cartTotal(cart: readonly CartLine[]): number {
  return Math.round(cart.reduce((s, l) => s + (l.item.price ?? 0) * l.qty, 0) * 100) / 100;
}

export interface KenyaPharmacyCounterProps {
  /** afiax-services; without it the tab says the till is not connected. */
  readonly servicesUrl?: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * The Counter sale tab.
 * @param props - The component props.
 * @returns The tab.
 */
export function KenyaPharmacyCounter(props: KenyaPharmacyCounterProps): JSX.Element {
  const { servicesUrl } = props;
  const fetchFn = props.fetchFn ?? fetch;
  const medplum = useMedplum();
  const base = servicesUrl?.replace(/\/$/, '');
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<CounterItem[]>();
  const [searchError, setSearchError] = useState<string>();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payment, setPayment] = useState<CounterPayment>('Cash');
  const [reference, setReference] = useState('');
  const [tendered, setTendered] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [sale, setSale] = useState<CounterReceipt>();

  const headers = useMemo(
    () => ({ Authorization: `Bearer ${medplum.getAccessToken()}`, 'Content-Type': 'application/json' }),
    [medplum]
  );

  useEffect(() => {
    const q = query.trim();
    if (!base || q.length < 2) {
      setFound(undefined);
      setSearchError(undefined);
      return undefined;
    }
    let live = true;
    const timer = setTimeout(() => {
      fetchFn(`${base}/pharmacy/counter/items?q=${encodeURIComponent(q)}`, { headers })
        .then(async (res) => {
          const body = (await res.json().catch(() => ({}))) as { items?: CounterItem[]; message?: string };
          if (!res.ok || !body.items) {
            throw new Error(body.message ?? `Items could not be found (${res.status})`);
          }
          if (live) {
            setFound(body.items);
            setSearchError(undefined);
          }
        })
        .catch((err) => live && setSearchError(normalizeErrorString(err)));
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [base, query, fetchFn, headers]);

  const total = cartTotal(cart);
  const currency = cart[0]?.item.currency ?? 'KES';
  const problem = counterSaleProblem(cart, payment, reference, payment === 'Cash' ? tendered : undefined);

  function add(item: CounterItem): void {
    setCart((c) =>
      c.some((l) => l.item.itemCode === item.itemCode)
        ? c.map((l) => (l.item.itemCode === item.itemCode ? { ...l, qty: l.qty + 1 } : l))
        : [...c, { item, qty: 1 }]
    );
    setQuery('');
    setFound(undefined);
  }

  function reset(): void {
    setCart([]);
    setPayment('Cash');
    setReference('');
    setTendered(undefined);
    setError(undefined);
    setSale(undefined);
  }

  async function complete(): Promise<void> {
    if (!base || problem) {
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const res = await fetchFn(`${base}/pharmacy/counter/sale`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          lines: cart.map((l) => ({ itemCode: l.item.itemCode, qty: l.qty })),
          payment,
          reference: reference.trim() ? reference.trim().toUpperCase() : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as Partial<CounterSale> & { message?: string };
      if (!res.ok || !body.invoice) {
        throw new Error(body.message ?? `The sale was not recorded (${res.status})`);
      }
      const done = body as CounterSale;
      const profile = medplum.getProfile() as { name?: HumanName[] } | undefined;
      setSale({
        pharmacy: medplum.getActiveLogin()?.project?.display ?? 'Pharmacy',
        invoice: done.invoice,
        postedAt: done.postedAt,
        currency: done.currency,
        lines: done.lines,
        total: done.total,
        payment: done.payment,
        reference: done.reference,
        tendered: payment === 'Cash' ? tendered : undefined,
        servedBy: profile?.name?.[0] ? formatHumanName(profile.name[0]) : undefined,
      });
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setBusy(false);
    }
  }

  if (!base) {
    return (
      <Stack gap="md">
        <Title order={2}>Counter sale</Title>
        <Alert color="red">The till is not connected here yet.</Alert>
      </Stack>
    );
  }

  if (sale) {
    return (
      <Stack gap="md">
        <Title order={2}>Counter sale</Title>
        <Alert color="green" title={`Sale recorded: ${sale.invoice}`}>
          {sale.currency} {money(sale.total)} paid by {sale.payment}
          {sale.reference ? ` (${sale.reference})` : ''}
          {sale.tendered !== undefined && sale.tendered >= sale.total
            ? `. Change: ${sale.currency} ${money(sale.tendered - sale.total)}`
            : ''}
          .
        </Alert>
        <Group>
          <Button onClick={() => printHtml(buildCounterReceiptHtml(sale))}>Print receipt</Button>
          <Button variant="default" onClick={reset}>
            New sale
          </Button>
        </Group>
      </Stack>
    );
  }

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>Counter sale</Title>
        <Text size="sm" c="dimmed">
          Over-the-counter medicines for a walk-in customer. Prescription-only medicines are dispensed against a
          prescription in the Dispense tab.
        </Text>
      </div>

      <div>
        <TextInput
          placeholder="Find a medicine by name or code"
          aria-label="Find a medicine"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          autoFocus
        />
        {searchError && (
          <Text c="red" size="sm" mt={4}>
            {searchError}
          </Text>
        )}
        {found && (
          <Paper withBorder mt={4} p="xs">
            {found.length === 0 ? (
              <Text c="dimmed" size="sm">
                Nothing found.
              </Text>
            ) : (
              <Stack gap={4}>
                {found.map((i) => (
                  <Group key={i.itemCode} justify="space-between" wrap="nowrap">
                    <div>
                      <Text fw={500}>{i.itemName ?? i.itemCode}</Text>
                      <Text size="xs" c="dimmed">
                        {i.itemCode} · {i.onHand} {i.uom ?? ''} in stock
                        {i.price !== undefined ? ` · ${i.currency} ${money(i.price)}` : ' · no price'}
                      </Text>
                      {i.blocked && (
                        <Text size="xs" c="red">
                          {i.blocked}
                        </Text>
                      )}
                    </div>
                    <Button
                      size="xs"
                      variant="light"
                      disabled={!!i.blocked || i.price === undefined}
                      onClick={() => add(i)}
                      aria-label={`Add ${i.itemName ?? i.itemCode}`}
                    >
                      Add
                    </Button>
                  </Group>
                ))}
              </Stack>
            )}
          </Paper>
        )}
      </div>

      {cart.length > 0 && (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Medicine</Table.Th>
              <Table.Th w={120}>Quantity</Table.Th>
              <Table.Th ta="right">Price</Table.Th>
              <Table.Th ta="right">Amount</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cart.map((l) => (
              <Table.Tr key={l.item.itemCode}>
                <Table.Td>
                  {l.item.itemName ?? l.item.itemCode}
                  {l.qty > l.item.onHand && (
                    <Badge color="red" variant="light" ml="xs">
                      Only {l.item.onHand}
                    </Badge>
                  )}
                </Table.Td>
                <Table.Td>
                  <NumberInput
                    aria-label={`Quantity of ${l.item.itemName ?? l.item.itemCode}`}
                    min={1}
                    max={l.item.onHand}
                    allowDecimal={false}
                    value={l.qty}
                    onChange={(v) =>
                      setCart((c) =>
                        c.map((x) => (x.item.itemCode === l.item.itemCode ? { ...x, qty: Math.max(1, Number(v) || 1) } : x))
                      )
                    }
                  />
                </Table.Td>
                <Table.Td ta="right">{money(l.item.price ?? 0)}</Table.Td>
                <Table.Td ta="right">{money((l.item.price ?? 0) * l.qty)}</Table.Td>
                <Table.Td>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    aria-label={`Remove ${l.item.itemName ?? l.item.itemCode}`}
                    onClick={() => setCart((c) => c.filter((x) => x.item.itemCode !== l.item.itemCode))}
                  >
                    <IconTrash size={16} />
                  </ActionIcon>
                </Table.Td>
              </Table.Tr>
            ))}
            <Table.Tr>
              <Table.Td colSpan={3}>
                <Text fw={700}>Total</Text>
              </Table.Td>
              <Table.Td ta="right">
                <Text fw={700}>
                  {currency} {money(total)}
                </Text>
              </Table.Td>
              <Table.Td />
            </Table.Tr>
          </Table.Tbody>
        </Table>
      )}

      {cart.length > 0 && (
        <Paper withBorder p="md">
          <Stack gap="sm">
            <SegmentedControl
              value={payment}
              onChange={(v) => setPayment(v as CounterPayment)}
              data={['Cash', 'M-Pesa', 'Card']}
            />
            {payment === 'Cash' && (
              <Group align="flex-end">
                <NumberInput
                  label="Cash given"
                  min={0}
                  value={tendered ?? ''}
                  onChange={(v) => setTendered(v === '' ? undefined : Number(v))}
                  w={180}
                />
                {tendered !== undefined && tendered >= total && (
                  <Text fw={500}>
                    Change: {currency} {money(tendered - total)}
                  </Text>
                )}
              </Group>
            )}
            {payment === 'M-Pesa' && (
              <TextInput
                label="M-Pesa receipt code"
                description="From the customer's M-Pesa message"
                placeholder="SKL3ABC12D"
                value={reference}
                onChange={(e) => setReference(e.currentTarget.value.toUpperCase())}
                w={240}
              />
            )}
            {payment === 'Card' && (
              <TextInput
                label="Card slip number (optional)"
                value={reference}
                onChange={(e) => setReference(e.currentTarget.value)}
                w={240}
              />
            )}
            {error && <Alert color="red">{error}</Alert>}
            <Group>
              <Button onClick={() => complete().catch(console.error)} loading={busy} disabled={!!problem}>
                Complete sale: {currency} {money(total)}
              </Button>
              {problem && (
                <Text size="sm" c="dimmed">
                  {problem}
                </Text>
              )}
              <Button variant="subtle" color="gray" onClick={reset} ml="auto">
                Clear
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
