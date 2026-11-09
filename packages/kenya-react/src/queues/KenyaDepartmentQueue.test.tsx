// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaDepartmentSystem } from '@medplum/core';
import type { Patient, ServiceRequest, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { KenyaDepartmentQueue } from './KenyaDepartmentQueue';

async function labTask(medplum: MockClient, description: string): Promise<Task> {
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Baraka'], family: 'Mwangi' }],
  });
  const order = await medplum.createResource<ServiceRequest>({
    resourceType: 'ServiceRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: `Patient/${patient.id}` },
    code: { text: 'Full blood count' },
  });
  return medplum.createResource<Task>({
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    priority: 'routine',
    description,
    focus: { reference: `ServiceRequest/${order.id}` },
    for: { reference: `Patient/${patient.id}` },
    performerType: [{ coding: [{ system: KenyaDepartmentSystem, code: 'laboratory' }], text: 'Laboratory' }],
    authoredOn: new Date().toISOString(),
  });
}

describe('KenyaDepartmentQueue', () => {
  test('Complete asks for confirmation, then completes the order', async () => {
    const medplum = new MockClient();
    const task = await labTask(medplum, 'Laboratory: Full blood count');
    await act(async () => {
      renderWithMedplum(medplum, <KenyaDepartmentQueue department="laboratory" onDepartmentChange={jest.fn()} />);
    });
    expect(await screen.findByText('Laboratory: Full blood count')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Complete' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Mark Laboratory: Full blood count as completed?');
    expect((await medplum.readResource('Task', task.id as string)).status).toBe('requested');

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Complete' }));
    });
    await waitFor(async () => {
      expect((await medplum.readResource('Task', task.id as string)).status).toBe('completed');
    });
  });

  test('Go back leaves the order in the queue', async () => {
    const medplum = new MockClient();
    const task = await labTask(medplum, 'Laboratory: Malaria RDT');
    await act(async () => {
      renderWithMedplum(medplum, <KenyaDepartmentQueue department="laboratory" onDepartmentChange={jest.fn()} />);
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Complete' }));
    });
    await act(async () => {
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Go back' }));
    });
    expect((await medplum.readResource('Task', task.id as string)).status).toBe('requested');
  });

  test('reloads every 30 seconds and on Refresh', async () => {
    jest.useFakeTimers();
    try {
      const medplum = new MockClient();
      await act(async () => {
        renderWithMedplum(medplum, <KenyaDepartmentQueue department="laboratory" onDepartmentChange={jest.fn()} />);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(100);
      });
      expect(screen.getByText(/refreshes every 30 seconds/)).toBeInTheDocument();
      const searchSpy = jest.spyOn(medplum, 'search');
      await act(async () => {
        await jest.advanceTimersByTimeAsync(30_000);
      });
      expect(searchSpy).toHaveBeenCalledTimes(1);
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
      });
      expect(searchSpy).toHaveBeenCalledTimes(2);
    } finally {
      jest.useRealTimers();
    }
  });

  test('switching department is left to the host app', async () => {
    const medplum = new MockClient();
    const onDepartmentChange = jest.fn();
    await act(async () => {
      renderWithMedplum(
        medplum,
        <KenyaDepartmentQueue department="pharmacy" onDepartmentChange={onDepartmentChange} />
      );
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Radiology'));
    });
    expect(onDepartmentChange).toHaveBeenCalledWith('radiology');
  });
});
