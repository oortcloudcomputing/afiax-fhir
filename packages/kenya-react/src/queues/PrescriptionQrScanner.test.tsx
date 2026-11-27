// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderWithMedplum, screen } from '../test-utils/render';
import { KenyaPrescriptionLookup } from './KenyaPrescriptionLookup';
import { cameraErrorText, prescriptionCodeFromQr } from './qr-scan';

describe('PrescriptionQrScanner', () => {
  test('reads only prescription codes', () => {
    expect(prescriptionCodeFromQr(' RX-0123-4567-8Z\n')).toBe('RX-0123-4567-8Z');
    expect(prescriptionCodeFromQr('https://example.com')).toBeUndefined();
    expect(prescriptionCodeFromQr('RX-0123-4567-8U')).toBeUndefined();
  });

  test('says why the camera did not start', () => {
    expect(cameraErrorText({ name: 'NotAllowedError' })).toMatch(/blocked/);
    expect(cameraErrorText({ name: 'NotFoundError' })).toMatch(/No camera/);
    expect(cameraErrorText({ name: 'NotReadableError' })).toMatch(/in use/);
    expect(cameraErrorText(new Error('x'))).toMatch(/could not start/);
  });

  test('Scan QR opens the scanner, which explains when there is no camera', async () => {
    const medplum = new MockClient();
    await act(async () => {
      renderWithMedplum(medplum, <KenyaPrescriptionLookup />);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Scan QR' }));
    });
    expect(await screen.findByText('Scan the prescription QR code')).toBeInTheDocument();
    expect(await screen.findByText(/cannot use a camera|only works when Afiax Provider is opened over https/)).toBeInTheDocument();
  });
});
