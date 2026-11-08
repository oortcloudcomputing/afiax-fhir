// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya department queues (DHA FUNC-CPOE-001 "orders route to appropriate departments"): each
// department sees the orders routed to it, accepts them and completes them. The pharmacy dispenses
// medication orders, which records a MedicationDispense. The queue reloads itself, and completing or
// dispensing asks for confirmation first.

import { Badge, Button, Group, Paper, SegmentedControl, Stack, Table, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaDepartmentCode } from '@medplum/core';
import {
  formatDateTime,
  getReferenceString,
  KenyaDepartments,
  KenyaDepartmentSystem,
  normalizeErrorString,
} from '@medplum/core';
import type {
  MedicationDispense,
  MedicationRequest,
  Patient,
  Resource,
  ServiceRequest,
  Task,
} from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmButton } from '../common/ConfirmButton';

interface QueueItem {
  readonly task: Task;
  readonly order?: ServiceRequest | MedicationRequest;
  readonly patient?: Patient;
}

const openStatuses = 'requested,accepted,in-progress';

/** How often the queue reloads on its own, so new orders appear without refreshing the page. */
const QueueRefreshMs = 30_000;

export interface KenyaDepartmentQueueProps {
  /** The department whose queue to show. */
  readonly department: KenyaDepartmentCode;
  /** Called when the user switches department (the host app navigates). */
  readonly onDepartmentChange: (department: KenyaDepartmentCode) => void;
}

/**
 * A department's queue of open orders: accept them, then complete them (the pharmacy dispenses).
 * @param props - The component props.
 * @returns The queue.
 */
export function KenyaDepartmentQueue(props: KenyaDepartmentQueueProps): JSX.Element {
  const { department, onDepartmentChange } = props;
  const medplum = useMedplum();
  const [items, setItems] = useState<QueueItem[]>();
  const [loadedAt, setLoadedAt] = useState<string>();

  const load = useCallback(() => {
    medplum
      .search(
        'Task',
        new URLSearchParams([
          ['performer', `${KenyaDepartmentSystem}|${department}`],
          ['status', openStatuses],
          ['_sort', 'authored-on'],
          ['_count', '100'],
          ['_include', 'Task:focus'],
          ['_include', 'Task:patient'],
        ]),
        { cache: 'no-cache' }
      )
      .then((bundle) => {
        const included = new Map<string, Resource>();
        for (const entry of bundle.entry ?? []) {
          if (entry.resource) {
            included.set(getReferenceString(entry.resource), entry.resource);
          }
        }
        const tasks = (bundle.entry ?? [])
          .filter((e) => e.search?.mode !== 'include' && e.resource?.resourceType === 'Task')
          .map((e) => e.resource as Task);
        // Use the included resources; read any the server did not include
        const resolve = async <T extends Resource>(reference: string | undefined): Promise<T | undefined> => {
          if (!reference) {
            return undefined;
          }
          return (
            (included.get(reference) as T | undefined) ?? medplum.readReference<T>({ reference }).catch(() => undefined)
          );
        };
        return Promise.all(
          tasks.map(async (task) => ({
            task,
            order: await resolve<ServiceRequest | MedicationRequest>(task.focus?.reference),
            patient: await resolve<Patient>(task.for?.reference),
          }))
        );
      })
      .then((loaded) => {
        setItems(loaded);
        setLoadedAt(new Date().toISOString());
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, department]);
  useEffect(load, [load]);
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'hidden') {
        load();
      }
    }, QueueRefreshMs);
    return () => clearInterval(timer);
  }, [load]);

  async function advance(item: QueueItem, action: 'accept' | 'complete'): Promise<void> {
    try {
      if (action === 'complete' && item.order?.resourceType === 'MedicationRequest') {
        await medplum.createResource<MedicationDispense>({
          resourceType: 'MedicationDispense',
          status: 'completed',
          medicationCodeableConcept: item.order.medicationCodeableConcept,
          subject: item.order.subject,
          context: item.order.encounter,
          authorizingPrescription: [{ reference: getReferenceString(item.order) }],
          quantity: item.order.dispenseRequest?.quantity,
          daysSupply: item.order.dispenseRequest?.expectedSupplyDuration,
          dosageInstruction: item.order.dosageInstruction,
          whenHandedOver: new Date().toISOString(),
          performer: medplum.getProfile()
            ? [{ actor: { reference: getReferenceString(medplum.getProfile() as Resource) } }]
            : undefined,
        });
      }
      await medplum.updateResource<Task>({
        ...item.task,
        status: action === 'accept' ? 'in-progress' : 'completed',
        businessStatus: { text: action === 'accept' ? 'in progress' : completedText(department) },
        owner:
          item.task.owner ??
          (medplum.getProfile() ? { reference: getReferenceString(medplum.getProfile() as Resource) } : undefined),
        lastModified: new Date().toISOString(),
      });
      showNotification({ color: 'green', message: action === 'accept' ? 'Order accepted' : completedText(department) });
      load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={2}>Department queue</Title>
        <Group gap="xs">
          {loadedAt && (
            <Text size="xs" c="dimmed">
              Updated {formatDateTime(loadedAt)} · refreshes every 30 seconds
            </Text>
          )}
          <Button size="xs" variant="default" onClick={load}>
            Refresh
          </Button>
        </Group>
      </Group>
      <SegmentedControl
        data={Object.entries(KenyaDepartments).map(([value, label]) => ({ value, label }))}
        value={department}
        onChange={(value) => onDepartmentChange(value as KenyaDepartmentCode)}
      />
      {!items && <Text c="dimmed">Loading…</Text>}
      {items?.length === 0 && <Text c="dimmed">No open orders for {KenyaDepartments[department]}.</Text>}
      {items && items.length > 0 && (
        <Paper withBorder>
          <Table striped data-testid="department-queue">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Ordered</Table.Th>
                <Table.Th>Patient</Table.Th>
                <Table.Th>Order</Table.Th>
                <Table.Th>Priority</Table.Th>
                <Table.Th>Status</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {items.map((item) => (
                <Table.Tr key={item.task.id}>
                  <Table.Td>{formatDateTime(item.task.authoredOn)}</Table.Td>
                  <Table.Td>
                    {item.patient ? <MedplumLink to={item.patient}>{patientName(item.patient)}</MedplumLink> : '—'}
                  </Table.Td>
                  <Table.Td>
                    {item.order ? (
                      <MedplumLink to={item.order}>{item.task.description}</MedplumLink>
                    ) : (
                      item.task.description
                    )}
                    {item.order?.resourceType === 'MedicationRequest' && (
                      <Text size="xs" c="dimmed">
                        {item.order.dosageInstruction?.[0]?.text}
                        {item.order.dispenseRequest?.quantity?.value
                          ? ` · qty ${item.order.dispenseRequest.quantity.value}`
                          : ''}
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={item.task.priority === 'routine' ? 'gray' : 'red'}>{item.task.priority}</Badge>
                  </Table.Td>
                  <Table.Td>{item.task.businessStatus?.text ?? item.task.status}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      {item.task.status === 'requested' && (
                        <Button size="xs" variant="light" onClick={() => advance(item, 'accept')}>
                          Accept
                        </Button>
                      )}
                      <ConfirmButton
                        size="xs"
                        title={department === 'pharmacy' ? 'Dispense medicine' : 'Complete order'}
                        message={
                          department === 'pharmacy'
                            ? `Record that ${item.task.description ?? 'this medicine'} was handed to ${
                                item.patient ? patientName(item.patient) : 'the patient'
                              }? This cannot be undone from the queue.`
                            : `Mark ${item.task.description ?? 'this order'} as completed? It will leave the queue.`
                        }
                        onConfirm={() => advance(item, 'complete')}
                      >
                        {department === 'pharmacy' ? 'Dispense' : 'Complete'}
                      </ConfirmButton>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

function completedText(department: string): string {
  return department === 'pharmacy' ? 'Dispensed' : 'Completed';
}

function patientName(patient: Patient): string {
  const name = patient.name?.[0];
  return [name?.given?.join(' '), name?.family].filter(Boolean).join(' ') || `Patient/${patient.id}`;
}
