// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { MedicationRequest, Parameters, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { KenyaPrescriptionLookup } from './KenyaPrescriptionLookup';

const prescription: MedicationRequest = {
  resourceType: 'MedicationRequest',
  id: 'rx1',
  status: 'active',
  intent: 'order',
  subject: { reference: 'Patient/p1' },
  medicationCodeableConcept: { text: 'Amoxicillin 500 mg capsule' },
  dosageInstruction: [{ text: '1 capsule by mouth three times a day for 7 days' }],
  dispenseRequest: { quantity: { value: 21 } },
};
const patient: Patient = { resourceType: 'Patient', id: 'p1', name: [{ given: ['Amina'], family: 'Otieno' }] };

function lookupResult(extra: Parameters['parameter']): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [{ name: 'prescription', resource: prescription }, { name: 'patient', resource: patient }, ...(extra ?? [])],
  };
}

async function findCode(medplum: MockClient, code: string): Promise<void> {
  await act(async () => {
    renderWithMedplum(medplum, <KenyaPrescriptionLookup onDispensed={jest.fn()} />);
  });
  fireEvent.change(screen.getByLabelText(/Prescription code/), { target: { value: code } });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Find' }));
  });
}

describe('KenyaPrescriptionLookup', () => {
  test('refuses something that is not a prescription code, without asking the server', async () => {
    const medplum = new MockClient();
    const get = jest.spyOn(medplum, 'get');
    await findCode(medplum, 'hello');
    expect(await screen.findByText(/That is not a prescription code/)).toBeInTheDocument();
    expect(get).not.toHaveBeenCalled();
  });

  test('finds a prescription, then dispenses part of it', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'get').mockResolvedValue(
      lookupResult([
        { name: 'state', valueCode: 'valid' },
        { name: 'prescribed', valueDecimal: 21 },
        { name: 'dispensed', valueDecimal: 0 },
        { name: 'remaining', valueDecimal: 21 },
      ])
    );
    const post = jest.spyOn(medplum, 'post').mockResolvedValue({
      resourceType: 'Parameters',
      parameter: [
        { name: 'state', valueCode: 'valid' },
        { name: 'dispensed', valueDecimal: 14 },
        { name: 'remaining', valueDecimal: 7 },
      ],
    } satisfies Parameters);
    await findCode(medplum, 'rx 7kq2 m9xd 3t');

    const found = await screen.findByTestId('prescription-found');
    expect(found).toHaveTextContent('Amoxicillin 500 mg capsule');
    expect(found).toHaveTextContent('For Amina Otieno');
    expect(found).toHaveTextContent('Prescribed 21 · dispensed 0 · 21 left');

    // More than is left is stopped before the server
    fireEvent.change(screen.getByLabelText(/Quantity to hand over now/), { target: { value: '30' } });
    expect(await screen.findByText('Only 21 left')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Quantity to hand over now/), { target: { value: '14' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dispense' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Record that 14 of Amoxicillin 500 mg capsule was handed to Amina Otieno?');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Dispense' }));
    });
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(String(post.mock.calls[0][0])).toContain('MedicationRequest/rx1/$kenya-dispense');
    expect(post.mock.calls[0][1]).toEqual({
      resourceType: 'Parameters',
      parameter: [{ name: 'quantity', valueDecimal: 14 }],
    });
    expect(await screen.findByText('Dispensed. 7 left on this prescription.')).toBeInTheDocument();
  });

  test('an expired prescription shows why, and cannot be dispensed', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'get').mockResolvedValue(
      lookupResult([
        { name: 'state', valueCode: 'expired' },
        { name: 'reason', valueString: 'This prescription expired on 2026-10-01' },
        { name: 'dispensed', valueDecimal: 0 },
      ])
    );
    await findCode(medplum, 'RX-7KQ2-M9XD-3T');
    expect(await screen.findByText('This prescription expired on 2026-10-01')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dispense' })).not.toBeInTheDocument();
  });

  test('a code from another facility is not found', async () => {
    const medplum = new MockClient();
    jest.spyOn(medplum, 'get').mockRejectedValue(new Error('Not found'));
    await findCode(medplum, 'RX-7KQ2-M9XD-3T');
    expect(await screen.findByText('No prescription with that code in this facility.')).toBeInTheDocument();
  });
});
