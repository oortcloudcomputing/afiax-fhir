// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Badge, Table, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { findKenyaOrderCategory, formatDateTime, normalizeErrorString } from '@medplum/core';
import type { Encounter, MedicationRequest, ServiceRequest, Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

export interface KenyaOrderRow {
  readonly order: ServiceRequest | MedicationRequest;
  readonly task?: Task;
}

export interface KenyaOrderHistoryProps {
  readonly encounter: Encounter;
  /** Change it to reload (for example after an order is placed). */
  readonly version?: number;
}

/**
 * The encounter's orders, newest first, each with its department's status.
 * @param props - The component props.
 * @returns The order history table.
 */
export function KenyaOrderHistory(props: KenyaOrderHistoryProps): JSX.Element {
  const { encounter, version } = props;
  const medplum = useMedplum();
  const [rows, setRows] = useState<KenyaOrderRow[]>();

  useEffect(() => {
    const ref = `Encounter/${encounter.id}`;
    const options = { cache: 'no-cache' as const };
    Promise.all([
      medplum.searchResources('ServiceRequest', { encounter: ref, _count: '200' }, options),
      medplum.searchResources('MedicationRequest', { encounter: ref, _count: '200' }, options),
      medplum.searchResources('Task', { encounter: ref, _count: '200' }, options),
    ])
      .then(([services, medications, tasks]) => {
        const orders = [...services, ...medications].sort((a, b) =>
          (b.authoredOn ?? '').localeCompare(a.authoredOn ?? '')
        );
        setRows(
          orders.map((order) => ({
            order,
            task: tasks.find((t) => t.focus?.reference === `${order.resourceType}/${order.id}`),
          }))
        );
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, encounter.id, version]);

  if (!rows) {
    return <Text c="dimmed">Loading…</Text>;
  }
  if (rows.length === 0) {
    return <Text c="dimmed">No orders in this encounter yet.</Text>;
  }
  return (
    <Table striped data-testid="order-history">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Ordered</Table.Th>
          <Table.Th>Type</Table.Th>
          <Table.Th>Order</Table.Th>
          <Table.Th>Priority</Table.Th>
          <Table.Th>Department</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map(({ order, task }) => (
          <Table.Tr key={`${order.resourceType}/${order.id}`}>
            <Table.Td>{formatDateTime(order.authoredOn)}</Table.Td>
            <Table.Td>{findKenyaOrderCategory(order.category)?.display ?? order.resourceType}</Table.Td>
            <Table.Td>
              {order.resourceType === 'MedicationRequest'
                ? `${order.medicationCodeableConcept?.text ?? ''} — ${order.dosageInstruction?.[0]?.text ?? ''}`
                : order.code?.text}
            </Table.Td>
            <Table.Td>{order.priority}</Table.Td>
            <Table.Td>
              <Badge color={taskColor(task?.status)} variant="light">
                {task
                  ? `${task.performerType?.[0]?.text ?? ''}: ${task.businessStatus?.text ?? task.status}`
                  : order.status}
              </Badge>
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function taskColor(status: Task['status'] | undefined): string {
  switch (status) {
    case 'completed':
      return 'green';
    case 'accepted':
    case 'in-progress':
      return 'blue';
    case 'cancelled':
    case 'rejected':
    case 'failed':
      return 'red';
    default:
      return 'gray';
  }
}
