// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaDepartmentSystem } from '@medplum/core';
import type { Bundle, Encounter, MedicationDispense, MedicationRequest, Patient, Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { KenyaPharmacyToday } from './KenyaPharmacyToday';

async function prescribe(
  medplum: MockClient,
  patient: Patient,
  encounter: Encounter,
  medicine: string,
  minutesAgo: number
): Promise<Task> {
  const order = await medplum.createResource<MedicationRequest>({
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: `Patient/${patient.id}` },
    encounter: { reference: `Encounter/${encounter.id}` },
    medicationCodeableConcept: { text: medicine },
    dosageInstruction: [{ text: '1 three times a day' }],
    dispenseRequest: { quantity: { value: 21, unit: 'capsule' } },
  });
  return medplum.createResource<Task>({
    resourceType: 'Task',
    status: 'requested',
    intent: 'order',
    priority: 'routine',
    description: `Pharmacy: ${medicine}`,
    focus: { reference: `MedicationRequest/${order.id}` },
    for: { reference: `Patient/${patient.id}` },
    encounter: { reference: `Encounter/${encounter.id}` },
    performerType: [{ coding: [{ system: KenyaDepartmentSystem, code: 'pharmacy' }], text: 'Pharmacy' }],
    authoredOn: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
  });
}

async function setup(medplum: MockClient): Promise<{ first: Task; second: Task }> {
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Amina'], family: 'Otieno' }],
    gender: 'female',
    birthDate: '1990-01-01',
  });
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { code: 'AMB' },
    subject: { reference: `Patient/${patient.id}` },
  });
  const first = await prescribe(medplum, patient, encounter, 'Amoxicillin 500 mg capsule', 20);
  const second = await prescribe(medplum, patient, encounter, 'Paracetamol 500 mg tablet', 19);
  return { first, second };
}

describe('KenyaPharmacyToday', () => {
  test('one card per visit with the wait, counts, and Start preparing', async () => {
    const medplum = new MockClient();
    const { first, second } = await setup(medplum);
    await act(async () => {
      renderWithMedplum(medplum, <KenyaPharmacyToday />);
    });
    const cards = await screen.findAllByTestId('pharmacy-order');
    expect(cards).toHaveLength(1);
    const card = cards[0];
    expect(card).toHaveTextContent('Amina Otieno');
    expect(card).toHaveTextContent('Female');
    expect(card).toHaveTextContent('Pharmacy: Amoxicillin 500 mg capsule');
    expect(card).toHaveTextContent('1 three times a day · qty 21 capsule');
    expect(card).toHaveTextContent('Waiting 20 min');
    expect(card).toHaveTextContent('New');
    const summary = screen.getByTestId('pharmacy-today-summary');
    expect(summary).toHaveTextContent('New1');
    expect(summary).toHaveTextContent('Waiting 15+ min1');
    expect(screen.getByLabelText(/Prescription code/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Start preparing' }));
    });
    await waitFor(async () => {
      expect((await medplum.readResource('Task', first.id as string)).status).toBe('in-progress');
      expect((await medplum.readResource('Task', second.id as string)).status).toBe('in-progress');
    });
    expect(await screen.findByText('Being prepared', { selector: '.mantine-Badge-label' })).toBeInTheDocument();
  });

  test('Dispense all asks first, then dispenses each medicine through $kenya-dispense', async () => {
    const medplum = new MockClient();
    await setup(medplum);
    const post = jest.spyOn(medplum, 'post').mockResolvedValue({ resourceType: 'Parameters' });
    await act(async () => {
      renderWithMedplum(medplum, <KenyaPharmacyToday />);
    });
    const card = (await screen.findAllByTestId('pharmacy-order'))[0];
    await act(async () => {
      fireEvent.click(within(card).getByRole('button', { name: 'Dispense all (2)' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(
      'Record that Pharmacy: Amoxicillin 500 mg capsule, Pharmacy: Paracetamol 500 mg tablet were handed to Amina Otieno?'
    );
    expect(post).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Dispense' }));
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    expect(String(post.mock.calls[0][0])).toContain('$kenya-dispense');
  });

  test('Dispensed today leaves out fills by chemists outside the facility', async () => {
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ given: ['Juma'], family: 'Kamau' }] });
    const dispense = (medicine: string, actor: MedicationDispense['performer']): MedicationDispense => ({
      resourceType: 'MedicationDispense',
      id: medicine,
      status: 'completed',
      subject: { reference: `Patient/${patient.id}` },
      medicationCodeableConcept: { text: medicine },
      quantity: { value: 10, unit: 'tablet' },
      whenHandedOver: new Date().toISOString(),
      performer: actor,
    });
    const search = medplum.search.bind(medplum);
    jest.spyOn(medplum, 'search').mockImplementation(((type: string, query: unknown, options: unknown) =>
      type === 'MedicationDispense'
        ? Promise.resolve<Bundle>({
            resourceType: 'Bundle',
            type: 'searchset',
            entry: [
              { resource: dispense('Metformin 500 mg tablet', [{ actor: { reference: 'Practitioner/123' } }]) },
              {
                resource: dispense('Ibuprofen 400 mg tablet', [
                  { actor: { type: 'Organization', identifier: { value: 'PPB-1' }, display: 'Chemist' } },
                ]),
              },
              { resource: patient, search: { mode: 'include' } },
            ],
          })
        : search(type as 'Task', query as URLSearchParams, options as object)) as typeof medplum.search);
    await act(async () => {
      renderWithMedplum(medplum, <KenyaPharmacyToday />);
    });
    const table = await screen.findByTestId('pharmacy-dispensed-today');
    expect(table).toHaveTextContent('Juma Kamau');
    expect(table).toHaveTextContent('Metformin 500 mg tablet');
    expect(table).not.toHaveTextContent('Ibuprofen');
    expect(screen.getByTestId('pharmacy-today-summary')).toHaveTextContent('Dispensed today1');
    expect(screen.getByText('No one is waiting. New prescriptions appear here.')).toBeInTheDocument();
  });
});
