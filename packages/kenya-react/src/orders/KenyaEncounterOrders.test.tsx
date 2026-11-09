// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaHealthProductSystem, KenyaOrderCategorySystem } from '@medplum/core';
import type { Encounter, MedicationRequest, Parameters, Patient, Task, ValueSet } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderWithMedplum, screen } from '../test-utils/render';
import { KenyaEncounterOrders } from './KenyaEncounterOrders';

const amoxicillin = { system: KenyaHealthProductSystem, code: 'GE10160', display: 'Amoxicillin 500 mg Oral Capsule' };

const allergyAlert: Parameters = {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'alert',
      part: [
        { name: 'id', valueString: 'allergy:pen' },
        { name: 'severity', valueCode: 'high' },
        { name: 'category', valueCode: 'allergy' },
        { name: 'title', valueString: 'Allergy: Amoxicillin conflicts with recorded allergy to penicillin' },
        { name: 'detail', valueString: 'The patient has a recorded allergy to penicillin.' },
      ],
    },
  ],
};

async function setup(status: Encounter['status']): Promise<{ medplum: MockClient; encounter: Encounter }> {
  const medplum = new MockClient();
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Otieno' }] });
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status,
    class: { code: 'AMB' },
    subject: { reference: `Patient/${patient.id}` },
  });
  const realGet = medplum.get.bind(medplum);
  jest
    .spyOn(medplum, 'get')
    .mockImplementation(((url: string | URL, options?: RequestInit) =>
      url.toString().includes('$knhts-search')
        ? Promise.resolve({ resourceType: 'ValueSet', expansion: { contains: [amoxicillin] } } as ValueSet)
        : realGet(url, options)) as typeof medplum.get);
  return { medplum, encounter };
}

describe('KenyaEncounterOrders', () => {
  test('a medicine with a high-severity CDS alert needs an override reason', async () => {
    const { medplum, encounter } = await setup('in-progress');
    const realPost = medplum.post.bind(medplum);
    const postSpy = jest.spyOn(medplum, 'post').mockImplementation(((url: string | URL, body: unknown) => {
      if (url.toString().includes('$cds-check')) {
        return Promise.resolve(allergyAlert);
      }
      if (url.toString().includes('$kenya-order')) {
        return Promise.resolve({ resourceType: 'Parameters' });
      }
      return realPost(url, body);
    }) as typeof medplum.post);

    await act(async () => {
      renderWithMedplum(medplum, <KenyaEncounterOrders encounter={encounter} />);
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /Medicine \(KNHTS HPT registry\)/ }), {
        target: { value: 'amox' },
      });
    });
    fireEvent.click(await screen.findByText('Amoxicillin 500 mg Oral Capsule (GE10160)', {}, { timeout: 3000 }));
    expect(await screen.findByText(/conflicts with recorded allergy to penicillin/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /Dosage instructions/ }), {
        target: { value: '500 mg three times daily' },
      });
    });
    const button = screen.getByRole('button', { name: 'Override and place order' });
    expect(button).toBeDisabled();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /Reason for prescribing despite the alert/ }), {
        target: { value: 'Penicillin allergy disproved by oral challenge' },
      });
    });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(postSpy).toHaveBeenCalledWith(
      medplum.fhirUrl('Encounter', encounter.id as string, '$kenya-order'),
      expect.objectContaining({
        parameter: expect.arrayContaining([
          { name: 'category', valueCode: 'medication' },
          { name: 'code', valueCoding: amoxicillin },
          { name: 'overrideReason', valueString: 'Penicillin allergy disproved by oral challenge' },
        ]),
      })
    );
  });

  test('a finished encounter shows its orders but cannot take new ones', async () => {
    const { medplum, encounter } = await setup('finished');
    const order = await medplum.createResource<MedicationRequest>({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      authoredOn: '2026-11-08T08:00:00Z',
      category: [{ coding: [{ system: KenyaOrderCategorySystem, code: 'medication' }] }],
      subject: encounter.subject as MedicationRequest['subject'],
      encounter: { reference: `Encounter/${encounter.id}` },
      medicationCodeableConcept: { coding: [amoxicillin], text: amoxicillin.display },
      dosageInstruction: [{ text: '500 mg three times daily' }],
    });
    await medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'completed',
      intent: 'order',
      focus: { reference: `MedicationRequest/${order.id}` },
      encounter: { reference: `Encounter/${encounter.id}` },
      performerType: [{ text: 'Pharmacy' }],
      businessStatus: { text: 'Dispensed' },
    });

    await act(async () => {
      renderWithMedplum(medplum, <KenyaEncounterOrders encounter={encounter} />);
    });
    expect(screen.getByText(/This encounter is finished/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Place order' })).not.toBeInTheDocument();
    expect(await screen.findByTestId('order-history')).toHaveTextContent('Pharmacy: Dispensed');
  });
});
