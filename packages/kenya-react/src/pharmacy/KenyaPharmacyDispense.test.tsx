// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaHealthProductSystem } from '@medplum/core';
import type { MedicationRequest, Parameters, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { buildDispenseLabelsHtml } from './dispense-label';
import { KenyaPharmacyDispense } from './KenyaPharmacyDispense';

async function prescribe(medplum: MockClient, patient: Patient, code: string, text: string): Promise<MedicationRequest> {
  return medplum.createResource<MedicationRequest>({
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: `Patient/${patient.id}` },
    medicationCodeableConcept: { coding: [{ system: KenyaHealthProductSystem, code, display: text }], text },
    dosageInstruction: [{ text: '1 three times a day for 7 days' }],
    dispenseRequest: { quantity: { value: 21, unit: 'capsule' } },
  });
}

const status: Parameters['parameter'] = [
  { name: 'state', valueCode: 'valid' },
  { name: 'dispensed', valueDecimal: 0 },
  { name: 'prescribed', valueDecimal: 21 },
  { name: 'remaining', valueDecimal: 21 },
];

const allergy: NonNullable<Parameters['parameter']>[number] = {
  name: 'alert',
  part: [
    { name: 'id', valueString: 'allergy:1' },
    { name: 'severity', valueCode: 'high' },
    { name: 'category', valueCode: 'allergy' },
    { name: 'title', valueString: 'Allergy: amoxicillin conflicts with recorded allergy to Penicillin' },
    { name: 'detail', valueString: 'The patient has a recorded allergy to Penicillin.' },
    { name: 'recommendation', valueString: 'Do not prescribe.' },
  ],
};

describe('KenyaPharmacyDispense', () => {
  test('a high alert needs a reason, out-of-stock medicine is left, then the label is ready', async () => {
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      name: [{ given: ['Amina'], family: 'Otieno' }],
      gender: 'female',
      birthDate: '1990-01-01',
    });
    const amoxicillin = await prescribe(medplum, patient, 'PH12907', 'Amoxicillin 500 mg Oral Capsule');
    const paracetamol = await prescribe(medplum, patient, 'PH10001', 'Paracetamol 500 mg Oral Tablet');

    const get = medplum.get.bind(medplum);
    jest.spyOn(medplum, 'get').mockImplementation(((url: string | URL, options?: unknown) => {
      const text = String(url);
      if (text.includes('$kenya-dispense-check')) {
        const body: Parameters = {
          resourceType: 'Parameters',
          parameter: text.includes(amoxicillin.id as string) ? [...(status ?? []), allergy] : status,
        };
        return Promise.resolve(body);
      }
      return get(url, options as never);
    }) as typeof medplum.get);
    const post = jest.spyOn(medplum, 'post').mockResolvedValue({ resourceType: 'Parameters' });
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        items: [
          {
            code: 'PH12907',
            state: 'in-stock',
            itemCode: 'PH12907',
            onHand: 100,
            usable: 100,
            uom: 'Capsule',
            batch: { batchNo: 'AMX-2401', expiry: '2027-03-31', qty: 60 },
            message: '100 Capsule in stock',
          },
          { code: 'PH10001', state: 'out-of-stock', onHand: 0, usable: 0, message: 'Out of stock in the dispensary' },
        ],
      }),
    });

    await act(async () => {
      renderWithMedplum(
        medplum,
        <KenyaPharmacyDispense
          prescriptionIds={[amoxicillin.id as string, paracetamol.id as string]}
          servicesUrl="http://services.test"
          fetchFn={fetchFn as unknown as typeof fetch}
          onPick={jest.fn()}
        />
      );
    });

    const lines = await screen.findAllByTestId('dispense-line');
    expect(lines).toHaveLength(2);
    expect(screen.getByText('Amina Otieno')).toBeInTheDocument();
    expect(String(fetchFn.mock.calls[0][0])).toBe(
      'http://services.test/pharmacy/stock?items=' + encodeURIComponent('PH12907:21,PH10001:21')
    );
    expect(await within(lines[0]).findByText(/Batch/)).toHaveTextContent('Batch AMX-2401, expires 2027-03-31');
    expect(within(lines[0]).getByTestId('dispense-alert')).toHaveTextContent('Penicillin');
    expect(within(lines[1]).getAllByText('Out of stock in the dispensary').length).toBeGreaterThan(0);

    // Nothing can go yet: the alert needs a reason, the paracetamol is out of stock
    expect(screen.getByRole('button', { name: 'Dispense' })).toBeDisabled();
    await act(async () => {
      fireEvent.change(within(lines[0]).getByLabelText(/Your reason/), {
        target: { value: 'Rash in childhood only; prescriber confirmed' },
      });
    });
    expect(screen.getByText('1 medicine cannot be dispensed now and will be left.')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dispense' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Record that Amoxicillin 500 mg Oral Capsule was handed to Amina Otieno?');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Dispense' }));
    });
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    expect(String(post.mock.calls[0][0])).toContain(`MedicationRequest/${amoxicillin.id}/$kenya-dispense`);
    expect(post.mock.calls[0][1]).toEqual({
      resourceType: 'Parameters',
      parameter: [
        { name: 'quantity', valueDecimal: 21 },
        { name: 'safetyOverride', valueString: 'Rash in childhood only; prescriber confirmed' },
      ],
    });
    expect(await screen.findByTestId('dispense-labels')).toHaveTextContent('Label ready for Amina Otieno');
  });

  test('labels are escaped and sized for the roll', () => {
    const html = buildDispenseLabelsHtml(
      [
        {
          pharmacy: 'Thika <Test> Hospital',
          patient: 'Amina Otieno',
          medicine: 'Amoxicillin 500 mg Oral Capsule',
          quantity: '21 capsule',
          directions: '1 three times a day for 7 days',
          date: '2026-11-27T10:00:00Z',
          prescriptionCode: 'RX-7KQ2-M9XD-3T',
          dispensedBy: 'Jane Wanjiru',
        },
      ],
      '62x40'
    );
    expect(html).toContain('size: 62mm 40mm');
    expect(html).toContain('Thika &lt;Test&gt; Hospital');
    expect(html).toContain('RX-7KQ2-M9XD-3T');
    expect(html).toContain('Keep out of reach of children');
  });
});
