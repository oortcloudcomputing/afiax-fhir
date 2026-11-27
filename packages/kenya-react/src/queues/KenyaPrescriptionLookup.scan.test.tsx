// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { KenyaPrescriptionLookup } from './KenyaPrescriptionLookup';

// The camera itself cannot run here: the scanner "reads" a code as soon as it opens
jest.mock('./PrescriptionQrScanner', () => ({
  PrescriptionQrScanner: (props: { opened: boolean; onScan: (code: string) => void }) => {
    if (props.opened) {
      setTimeout(() => props.onScan('RX-0123-4567-8Z'), 0);
    }
    return null;
  },
}));

test('a scanned QR code fills the box and looks the prescription up', async () => {
  const medplum = new MockClient();
  const get = jest.spyOn(medplum, 'get').mockResolvedValue({
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'prescription',
        resource: { resourceType: 'MedicationRequest', id: 'rx1', status: 'active', intent: 'order', subject: { reference: 'Patient/p1' } },
      },
      { name: 'state', valueCode: 'valid' },
    ],
  });
  await act(async () => {
    renderWithMedplum(medplum, <KenyaPrescriptionLookup />);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Scan QR' }));
  });
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(String(get.mock.calls[0][0])).toContain('code=RX-0123-4567-8Z');
  expect(screen.getByLabelText(/Prescription code/)).toHaveValue('RX-0123-4567-8Z');
});
