// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { normalizeKenyaPrescriptionCode } from '@medplum/core';

/**
 * The prescription code in a scanned QR text, if it is one.
 * @param text - What the QR code holds.
 * @returns The code as printed (for example RX-7KQ2-M9XD-3T), or undefined when it is not a prescription.
 */
export function prescriptionCodeFromQr(text: string): string | undefined {
  const trimmed = text.trim();
  return normalizeKenyaPrescriptionCode(trimmed) ? trimmed : undefined;
}

/**
 * Explains why the camera could not start.
 * @param err - The getUserMedia error.
 * @returns What to tell the pharmacist.
 */
export function cameraErrorText(err: unknown): string {
  const name = (err as { name?: string } | undefined)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return 'The camera is blocked. Allow the camera for this site in the browser (the camera icon in the address bar), then try again.';
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return 'No camera found on this device. Type the code, or use a handheld scanner.';
  }
  if (name === 'NotReadableError') {
    return 'The camera is in use by another app. Close it and try again.';
  }
  return 'The camera could not start. Type the code, or use a handheld scanner.';
}
