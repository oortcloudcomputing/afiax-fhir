// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Scans a printed prescription's QR code with the device camera (webcam, tablet or phone). The QR
// holds only the prescription code (prescription-pdf.ts). Chrome's own BarcodeDetector is used where
// it exists (Android, macOS, ChromeOS); elsewhere (Windows and Linux PCs) the jsQR decoder reads
// frames from a canvas. A handheld USB scanner needs none of this: it types into the code box.

import { Alert, Modal, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import { cameraErrorText, prescriptionCodeFromQr } from './qr-scan';

/** How often a frame is checked for a QR code. */
const ScanEveryMs = 250;

interface Detector {
  detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
}

async function makeDetector(): Promise<Detector | undefined> {
  const Native = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
  const supported = (globalThis as { BarcodeDetector?: { getSupportedFormats?: () => Promise<string[]> } })
    .BarcodeDetector?.getSupportedFormats;
  if (Native && supported && (await supported().catch((): string[] => [])).includes('qr_code')) {
    return new Native({ formats: ['qr_code'] });
  }
  return undefined;
}

export interface PrescriptionQrScannerProps {
  readonly opened: boolean;
  readonly onClose: () => void;
  /** Called once with the prescription code. */
  readonly onScan: (code: string) => void;
}

/**
 * A dialog that shows the camera and closes as soon as it reads a prescription QR code.
 * @param props - The component props.
 * @returns The dialog.
 */
export function PrescriptionQrScanner(props: PrescriptionQrScannerProps): JSX.Element {
  const { opened, onClose, onScan } = props;
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string>();
  const [notPrescription, setNotPrescription] = useState(false);
  const scanned = useRef(onScan);
  scanned.current = onScan;

  useEffect(() => {
    if (!opened) {
      return undefined;
    }
    setError(undefined);
    setNotPrescription(false);
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    let stopped = false;

    const start = async (): Promise<void> => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError(
          !window.isSecureContext
            ? 'The camera only works when Afiax Provider is opened over https.'
            : 'This browser cannot use a camera. Type the code, or use a handheld scanner.'
        );
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      } catch (err) {
        setError(cameraErrorText(err));
        return;
      }
      if (stopped || !video.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.current.srcObject = stream;
      await video.current.play().catch(() => undefined);

      const detector = await makeDetector();
      const jsQR = detector ? undefined : (await import('jsqr')).default;
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d', { willReadFrequently: true });
      let busy = false;

      timer = setInterval(() => {
        const v = video.current;
        if (busy || stopped || !v || v.readyState < 2 || !v.videoWidth) {
          return;
        }
        busy = true;
        const read = async (): Promise<string | undefined> => {
          if (detector) {
            return (await detector.detect(v))[0]?.rawValue;
          }
          if (!jsQR || !context) {
            return undefined;
          }
          canvas.width = v.videoWidth;
          canvas.height = v.videoHeight;
          context.drawImage(v, 0, 0);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data;
        };
        read()
          .then((text) => {
            if (stopped || !text) {
              return;
            }
            const code = prescriptionCodeFromQr(text);
            if (!code) {
              setNotPrescription(true);
              return;
            }
            stopped = true;
            scanned.current(code);
          })
          .catch(() => undefined)
          .finally(() => {
            busy = false;
          });
      }, ScanEveryMs);
    };

    start().catch(() => setError('The camera could not start. Type the code, or use a handheld scanner.'));
    return () => {
      stopped = true;
      if (timer) {
        clearInterval(timer);
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [opened]);

  return (
    <Modal opened={opened} onClose={onClose} title="Scan the prescription QR code" centered size="lg">
      <Stack gap="sm">
        {error ? (
          <Alert color="orange" variant="light">
            {error}
          </Alert>
        ) : (
          <>
            <video
              ref={video}
              muted
              playsInline
              style={{ width: '100%', borderRadius: 8, background: '#000', aspectRatio: '4 / 3', objectFit: 'cover' }}
            />
            <Text size="sm" c="dimmed">
              Hold the QR code on the printed prescription in front of the camera. It closes by itself when it reads it.
            </Text>
            {notPrescription && (
              <Alert color="orange" variant="light">
                That QR code is not an Afiax prescription. Scan the one on the prescription, or type the code.
              </Alert>
            )}
          </>
        )}
      </Stack>
    </Modal>
  );
}
