// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The receipt for a counter sale, printed from the browser on an 80 mm receipt roll (A4 prints a
// narrow column). The ERPNext invoice number is the reference for returns and eTIMS.

import { escapeHtml } from './dispense-label';

export interface CounterReceipt {
  readonly pharmacy: string;
  readonly invoice: string;
  readonly postedAt: string;
  readonly currency: string;
  readonly lines: readonly { itemName?: string; itemCode: string; qty: number; rate: number; amount: number }[];
  readonly total: number;
  readonly payment: string;
  readonly reference?: string;
  /** Cash handed over, for the change line. */
  readonly tendered?: number;
  readonly servedBy?: string;
}

/**
 * A money amount as on the receipt.
 * @param n - The amount.
 * @returns e.g. "1,250.00".
 */
export function money(n: number): string {
  return n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * The receipt as a printable HTML document.
 * @param r - The sale.
 * @returns The HTML.
 */
export function buildCounterReceiptHtml(r: CounterReceipt): string {
  const when = new Date(r.postedAt).toLocaleString('en-KE', { timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short' });
  const rows = r.lines
    .map(
      (l) =>
        `<tr><td>${escapeHtml(l.itemName ?? l.itemCode)}<br><small>${l.qty} × ${money(l.rate)}</small></td><td class="n">${money(l.amount)}</td></tr>`
    )
    .join('');
  const change =
    r.tendered !== undefined && r.tendered >= r.total
      ? `<tr><td>Cash</td><td class="n">${money(r.tendered)}</td></tr><tr><td>Change</td><td class="n">${money(r.tendered - r.total)}</td></tr>`
      : '';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(r.invoice)}</title><style>
@page { size: 80mm auto; margin: 4mm; }
body { font-family: system-ui, sans-serif; font-size: 9pt; width: 72mm; margin: 0; }
h1 { font-size: 11pt; margin: 0 0 2mm; text-align: center; }
p { margin: 0 0 2mm; text-align: center; }
table { width: 100%; border-collapse: collapse; }
td { padding: 1mm 0; vertical-align: top; }
.n { text-align: right; white-space: nowrap; }
.total td { border-top: 1px solid #000; font-weight: bold; font-size: 10pt; }
small { color: #444; }
</style></head><body>
<h1>${escapeHtml(r.pharmacy)}</h1>
<p>${escapeHtml(when)}<br>Receipt ${escapeHtml(r.invoice)}</p>
<table>${rows}
<tr class="total"><td>Total ${escapeHtml(r.currency)}</td><td class="n">${money(r.total)}</td></tr>
<tr><td>Paid by ${escapeHtml(r.payment)}${r.reference ? ` (${escapeHtml(r.reference)})` : ''}</td><td></td></tr>
${change}
</table>
${r.servedBy ? `<p>Served by ${escapeHtml(r.servedBy)}</p>` : ''}
<p>Thank you. Keep this receipt for any return.</p>
</body></html>`;
}
