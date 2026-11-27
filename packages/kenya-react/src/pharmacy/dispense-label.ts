// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Dispensing labels (user decision 2026-11-27): printed from the browser, one page per medicine,
// sized for a common thermal label roll (62 × 40 mm or 100 × 50 mm) or on A4. No printer drivers
// or hardware integration: the pharmacist picks the label printer in the print dialog.

export type DispenseLabelSize = '62x40' | '100x50' | 'a4';

export const DispenseLabelSizes: readonly { value: DispenseLabelSize; label: string }[] = [
  { value: '100x50', label: 'Label 100 × 50 mm' },
  { value: '62x40', label: 'Label 62 × 40 mm' },
  { value: 'a4', label: 'A4 paper' },
];

export interface DispenseLabel {
  readonly pharmacy: string;
  readonly patient: string;
  readonly medicine: string;
  /** e.g. "21 capsule". */
  readonly quantity: string;
  readonly directions?: string;
  /** When handed over (ISO). */
  readonly date: string;
  /** The prescription code, e.g. RX-7KQ2-M9XD-3T. */
  readonly prescriptionCode?: string;
  readonly dispensedBy?: string;
}

const pageCss: Record<DispenseLabelSize, string> = {
  '62x40': '@page { size: 62mm 40mm; margin: 2mm; } .label { font-size: 7pt; } .medicine { font-size: 9pt; }',
  '100x50': '@page { size: 100mm 50mm; margin: 3mm; } .label { font-size: 9pt; } .medicine { font-size: 12pt; }',
  a4: '@page { size: A4; margin: 15mm; } .label { font-size: 11pt; width: 100mm; border: 1px dashed #888; padding: 4mm; } .medicine { font-size: 14pt; }',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

/**
 * The labels as a printable HTML document.
 * @param labels - One label per medicine.
 * @param size - The label stock.
 * @returns The HTML.
 */
export function buildDispenseLabelsHtml(labels: readonly DispenseLabel[], size: DispenseLabelSize): string {
  const body = labels
    .map((l) => {
      const date = new Date(l.date).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
      return `<section class="label">
  <div class="row"><strong>${escapeHtml(l.pharmacy)}</strong><span>${escapeHtml(date)}</span></div>
  <div class="medicine">${escapeHtml(l.medicine)}</div>
  <div>Qty: ${escapeHtml(l.quantity)}</div>
  ${l.directions ? `<div class="directions">${escapeHtml(l.directions)}</div>` : ''}
  <div>For: <strong>${escapeHtml(l.patient)}</strong></div>
  <div class="row small">${l.prescriptionCode ? `<span>${escapeHtml(l.prescriptionCode)}</span>` : '<span></span>'}${
    l.dispensedBy ? `<span>By ${escapeHtml(l.dispensedBy)}</span>` : ''
  }</div>
  <div class="small">Keep out of reach of children</div>
</section>`;
    })
    .join('\n');
  return `<!doctype html>
<html><head><meta charset="utf-8"><title>Dispensing labels</title><style>
* { box-sizing: border-box; }
body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #000; }
.label { page-break-after: always; break-after: page; line-height: 1.25; }
.label:last-child { page-break-after: auto; break-after: auto; }
.row { display: flex; justify-content: space-between; gap: 2mm; }
.medicine { font-weight: bold; margin: 1mm 0; }
.directions { font-weight: bold; margin: 1mm 0; }
.small { font-size: 0.85em; }
${pageCss[size]}
</style></head><body>
${body}
</body></html>`;
}

/**
 * Prints the labels through a hidden frame, so the workspace stays open behind the print dialog.
 * @param labels - One label per medicine.
 * @param size - The label stock.
 */
export function printDispenseLabels(labels: readonly DispenseLabel[], size: DispenseLabelSize): void {
  printHtml(buildDispenseLabelsHtml(labels, size));
}

/**
 * Prints an HTML document through a hidden frame, so the workspace stays open behind the print dialog.
 * @param html - The document.
 */
export function printHtml(html: string): void {
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.position = 'fixed';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument;
  const win = frame.contentWindow;
  if (!doc || !win) {
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();
  win.addEventListener('afterprint', () => frame.remove());
  setTimeout(() => {
    win.focus();
    win.print();
  }, 100);
}
