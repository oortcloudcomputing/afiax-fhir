// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The pharmacy workspace's Stock tab: what is in the dispensary, read-only from ERPNext through
// afiax-services (GET /pharmacy/stock/all). Stock is received, moved and counted in ERPNext; this
// tab shows the pharmacist what needs attention: out of stock, at or under the reorder level,
// expired stock still on the shelf, and batches expiring soon.

import { Alert, Badge, Button, Group, SegmentedControl, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';

export type StockFlag = 'out-of-stock' | 'low' | 'expired' | 'expiring';

export interface StockBatch {
  readonly batchNo: string;
  readonly expiry?: string;
  readonly qty: number;
  readonly status: 'ok' | 'expiring' | 'expired';
}

/** One item in the dispensary, as afiax-services reports it. */
export interface StockRow {
  readonly itemCode: string;
  readonly itemName?: string;
  readonly genericCode?: string;
  readonly uom?: string;
  readonly onHand: number;
  readonly usable: number;
  readonly expiredQty: number;
  readonly reorderLevel?: number;
  readonly nextExpiry?: string;
  readonly batches: readonly StockBatch[];
  readonly flags: readonly StockFlag[];
}

export interface StockList {
  readonly warehouse: string;
  readonly asOf: string;
  readonly expiringDays: number;
  readonly items: readonly StockRow[];
}

export type StockFilter = 'attention' | 'all' | StockFlag;

const FlagLabels: Record<StockFlag, { label: string; color: string }> = {
  'out-of-stock': { label: 'Out of stock', color: 'red' },
  low: { label: 'Reorder', color: 'orange' },
  expired: { label: 'Expired on shelf', color: 'red' },
  expiring: { label: 'Expiring soon', color: 'yellow' },
};

/**
 * The rows a filter and search show.
 * @param items - All rows.
 * @param filter - The filter.
 * @param query - Search text (name, item code or KNHTS generic code).
 * @returns The rows to show.
 */
export function filterStock(items: readonly StockRow[], filter: StockFilter, query: string): StockRow[] {
  const q = query.trim().toLowerCase();
  return items.filter((i) => {
    if (filter === 'attention' && !i.flags.length) {
      return false;
    }
    if (filter !== 'attention' && filter !== 'all' && !i.flags.includes(filter)) {
      return false;
    }
    return (
      !q ||
      (i.itemName ?? '').toLowerCase().includes(q) ||
      i.itemCode.toLowerCase().includes(q) ||
      (i.genericCode ?? '').toLowerCase().includes(q)
    );
  });
}

export interface KenyaPharmacyStockProps {
  /** afiax-services; without it the tab says stock is not connected. */
  readonly servicesUrl?: string;
  readonly fetchFn?: typeof fetch;
}

/**
 * The Stock tab.
 * @param props - The component props.
 * @returns The tab.
 */
export function KenyaPharmacyStock(props: KenyaPharmacyStockProps): JSX.Element {
  const { servicesUrl } = props;
  const fetchFn = props.fetchFn ?? fetch;
  const medplum = useMedplum();
  const [list, setList] = useState<StockList>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<StockFilter>('all');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<string>();

  const load = useCallback(() => {
    if (!servicesUrl) {
      setError('Stock is not connected here yet.');
      return;
    }
    setLoading(true);
    setError(undefined);
    fetchFn(`${servicesUrl.replace(/\/$/, '')}/pharmacy/stock/all`, {
      headers: { Authorization: `Bearer ${medplum.getAccessToken()}` },
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as Partial<StockList> & { message?: string };
        if (!res.ok || !body.items) {
          throw new Error(body.message ?? `Stock could not be loaded (${res.status})`);
        }
        setList(body as StockList);
      })
      .catch((err) => setError(normalizeErrorString(err)))
      .finally(() => setLoading(false));
  }, [servicesUrl, fetchFn, medplum]);

  useEffect(() => load(), [load]);

  const counts = useMemo(() => {
    const items = list?.items ?? [];
    const count = (f: StockFlag): number => items.filter((i) => i.flags.includes(f)).length;
    return {
      attention: items.filter((i) => i.flags.length).length,
      'out-of-stock': count('out-of-stock'),
      low: count('low'),
      expired: count('expired'),
      expiring: count('expiring'),
    };
  }, [list]);
  const rows = useMemo(() => filterStock(list?.items ?? [], filter, query), [list, filter, query]);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Stock</Title>
          <Text size="sm" c="dimmed">
            {list
              ? `${list.warehouse}, as of ${list.asOf}. Stock is received and counted in ERPNext.`
              : 'The dispensary’s stock, from ERPNext.'}
          </Text>
        </div>
        <Button variant="default" onClick={load} loading={loading}>
          Refresh
        </Button>
      </Group>

      {error && (
        <Alert color="red" title="Stock">
          {error}
        </Alert>
      )}

      {list && (
        <>
          <Group gap="sm" wrap="wrap">
            <SegmentedControl
              value={filter}
              onChange={(v) => setFilter(v as StockFilter)}
              data={[
                { value: 'all', label: `All (${list.items.length})` },
                { value: 'attention', label: `Needs attention (${counts.attention})` },
                { value: 'out-of-stock', label: `Out (${counts['out-of-stock']})` },
                { value: 'low', label: `Reorder (${counts.low})` },
                { value: 'expired', label: `Expired (${counts.expired})` },
                { value: 'expiring', label: `Expiring (${counts.expiring})` },
              ]}
            />
            <TextInput
              placeholder="Search name or code"
              aria-label="Search stock"
              value={query}
              onChange={(e) => setQuery(e.currentTarget.value)}
              style={{ flex: 1, minWidth: 200 }}
            />
          </Group>

          {rows.length === 0 ? (
            <Text c="dimmed">{list.items.length ? 'Nothing matches.' : 'No stock in the dispensary yet.'}</Text>
          ) : (
            <Table striped highlightOnHover>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Medicine</Table.Th>
                  <Table.Th ta="right">In date</Table.Th>
                  <Table.Th ta="right">On hand</Table.Th>
                  <Table.Th ta="right">Reorder at</Table.Th>
                  <Table.Th>Next expiry</Table.Th>
                  <Table.Th />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map((i) => (
                  <Fragment key={i.itemCode}>
                    <Table.Tr
                      onClick={() => setOpen(open === i.itemCode ? undefined : i.itemCode)}
                      style={{ cursor: i.batches.length ? 'pointer' : undefined }}
                    >
                      <Table.Td>
                        <Text fw={500}>{i.itemName ?? i.itemCode}</Text>
                        <Text size="xs" c="dimmed">
                          {i.itemCode}
                          {i.genericCode ? ` · ${i.genericCode}` : ''}
                        </Text>
                      </Table.Td>
                      <Table.Td ta="right">
                        {i.usable} {i.uom ?? ''}
                      </Table.Td>
                      <Table.Td ta="right">{i.onHand}</Table.Td>
                      <Table.Td ta="right">{i.reorderLevel ?? '–'}</Table.Td>
                      <Table.Td>{i.nextExpiry ?? '–'}</Table.Td>
                      <Table.Td>
                        <Group gap={4}>
                          {i.flags.map((f) => (
                            <Badge key={f} color={FlagLabels[f].color} variant="light">
                              {FlagLabels[f].label}
                            </Badge>
                          ))}
                        </Group>
                      </Table.Td>
                    </Table.Tr>
                    {open === i.itemCode && i.batches.length > 0 && (
                      <Table.Tr>
                        <Table.Td colSpan={6}>
                          <Table withRowBorders={false} fz="sm">
                            <Table.Thead>
                              <Table.Tr>
                                <Table.Th>Batch</Table.Th>
                                <Table.Th>Expiry</Table.Th>
                                <Table.Th ta="right">Quantity</Table.Th>
                                <Table.Th />
                              </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                              {i.batches.map((b) => (
                                <Table.Tr key={b.batchNo}>
                                  <Table.Td>{b.batchNo}</Table.Td>
                                  <Table.Td>{b.expiry ?? 'No expiry'}</Table.Td>
                                  <Table.Td ta="right">{b.qty}</Table.Td>
                                  <Table.Td>
                                    {b.status === 'expired' && (
                                      <Badge color="red" variant="light">
                                        Expired: take off the shelf
                                      </Badge>
                                    )}
                                    {b.status === 'expiring' && (
                                      <Badge color="yellow" variant="light">
                                        Within {list.expiringDays} days
                                      </Badge>
                                    )}
                                  </Table.Td>
                                </Table.Tr>
                              ))}
                            </Table.Tbody>
                          </Table>
                        </Table.Td>
                      </Table.Tr>
                    )}
                  </Fragment>
                ))}
              </Table.Tbody>
            </Table>
          )}
        </>
      )}
    </Stack>
  );
}
