// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Shared by the department queues and the pharmacy workspace: load the queue Tasks with their order
// and patient, accept a Task, complete it (the pharmacy dispenses through $kenya-dispense).

import type { KenyaDepartmentCode, MedplumClient } from '@medplum/core';
import { getReferenceString, KenyaDepartmentSystem } from '@medplum/core';
import type { MedicationRequest, Parameters, Patient, Resource, ServiceRequest, Task } from '@medplum/fhirtypes';

export interface QueueItem {
  readonly task: Task;
  readonly order?: ServiceRequest | MedicationRequest;
  readonly patient?: Patient;
}

/** The Task statuses that keep an order in a queue. */
export const OpenQueueStatuses = 'requested,accepted,in-progress';

/**
 * Loads a department's open queue Tasks, oldest first, with their order and patient.
 * @param medplum - The client.
 * @param department - The department.
 * @returns The queue items.
 */
export async function loadQueueItems(medplum: MedplumClient, department: KenyaDepartmentCode): Promise<QueueItem[]> {
  const bundle = await medplum.search(
    'Task',
    new URLSearchParams([
      ['performer', `${KenyaDepartmentSystem}|${department}`],
      ['status', OpenQueueStatuses],
      ['_sort', 'authored-on'],
      ['_count', '100'],
      ['_include', 'Task:focus'],
      ['_include', 'Task:patient'],
    ]),
    { cache: 'no-cache' }
  );
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
}

/**
 * Accepts a queue Task: in progress, owned by the signed-in user unless it has an owner.
 * @param medplum - The client.
 * @param task - The Task.
 * @returns The updated Task.
 */
export function acceptQueueTask(medplum: MedplumClient, task: Task): Promise<Task> {
  const profile = medplum.getProfile();
  return medplum.updateResource<Task>({
    ...task,
    status: 'in-progress',
    businessStatus: { text: 'in progress' },
    owner: task.owner ?? (profile ? { reference: getReferenceString(profile as Resource) } : undefined),
    lastModified: new Date().toISOString(),
  });
}

/**
 * Completes a queue item. A prescription is dispensed through $kenya-dispense (everything left on
 * it; the server records the MedicationDispense and closes the Task); any other order is marked done.
 * @param medplum - The client.
 * @param item - The queue item.
 * @param completedText - The business status for a non-medicine order.
 */
export async function completeQueueItem(medplum: MedplumClient, item: QueueItem, completedText: string): Promise<void> {
  if (item.order?.resourceType === 'MedicationRequest' && item.order.id) {
    await medplum.post<Parameters>(medplum.fhirUrl('MedicationRequest', item.order.id, '$kenya-dispense'), {
      resourceType: 'Parameters',
      parameter: [],
    });
    return;
  }
  const profile = medplum.getProfile();
  await medplum.updateResource<Task>({
    ...item.task,
    status: 'completed',
    businessStatus: { text: completedText },
    owner: item.task.owner ?? (profile ? { reference: getReferenceString(profile as Resource) } : undefined),
    lastModified: new Date().toISOString(),
  });
}

/**
 * A patient's display name.
 * @param patient - The patient.
 * @returns Given and family names, or the reference when the patient has no name.
 */
export function queuePatientName(patient: Patient): string {
  const name = patient.name?.[0];
  return [name?.given?.join(' '), name?.family].filter(Boolean).join(' ') || `Patient/${patient.id}`;
}
