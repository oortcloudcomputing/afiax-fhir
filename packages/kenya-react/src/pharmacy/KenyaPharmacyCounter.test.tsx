// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { buildCounterReceiptHtml } from './counter-receipt';
import type { CounterItem } from './KenyaPharmacyCounter';
import { cartTotal, counterSaleProblem, KenyaPharmacyCounter } from './KenyaPharmacyCounter';

const pcm: CounterItem = {
  itemCode: 'PH7913',
  itemName: 'Paracetamol 500 mg Oral Tablet',
  uom: 'Tablet',
  price: 2,
  currency: 'KES',
  onHand: 500,
  prescriptionOnly: false,
  controlled: false,
};
const amox: CounterItem = {
  itemCode: 'PH12907',
  itemName: 'Amoxicillin 500 mg Oral Capsule',
  uom: 'Capsule',
  price: 10,
  currency: 'KES',
  onHand: 156,
  prescriptionOnly: true,
  controlled: false,
  blocked: 'Prescription only: dispense it against a prescription in the Dispense tab',
};

const ok = (body: unknown): { ok: boolean; status: number; json: () => Promise<unknown> } => ({ ok: true, status: 200, json: async () => body });

describe('KenyaPharmacyCounter', () => {
  test('totals and what stops a sale', () => {
    const cart = [{ item: pcm, qty: 10 }];
    expect(cartTotal(cart)).toBe(20);
    expect(counterSaleProblem([], 'Cash', '', undefined)).toBe('Add an item');
    expect(counterSaleProblem(cart, 'Cash', '', 10)).toBe('Cash given is less than the total');
    expect(counterSaleProblem(cart, 'Cash', '', undefined)).toBeUndefined();
    expect(counterSaleProblem(cart, 'M-Pesa', 'x', undefined)).toBe('Enter the M-Pesa receipt code');
    expect(counterSaleProblem(cart, 'M-Pesa', 'skl3abc12d', undefined)).toBeUndefined();
    expect(counterSaleProblem([{ item: pcm, qty: 501 }], 'Card', '', undefined)).toMatch(/Only 500/);
  });

  test('find, add, pay cash, sale recorded with change and a receipt', async () => {
    jest.useFakeTimers();
    const fetchFn = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/counter/items')) {
        return ok({ items: [pcm, amox] });
      }
      expect(JSON.parse(init?.body as string)).toEqual({ lines: [{ itemCode: 'PH7913', qty: 1 }], payment: 'Cash' });
      return ok({
        invoice: 'ACC-SINV-2026-00001',
        total: 2,
        currency: 'KES',
        payment: 'Cash',
        lines: [{ itemCode: 'PH7913', itemName: pcm.itemName, qty: 1, rate: 2, amount: 2 }],
        postedAt: '2026-11-27T09:30:00Z',
      });
    });
    renderWithMedplum(new MockClient(), <KenyaPharmacyCounter servicesUrl="http://services" fetchFn={fetchFn as unknown as typeof fetch} />);
    fireEvent.change(screen.getByLabelText('Find a medicine'), { target: { value: 'para' } });
    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    jest.useRealTimers();
    expect(await screen.findByText(/Prescription only: dispense it/)).toBeInTheDocument();
    expect(screen.getByLabelText('Add Amoxicillin 500 mg Oral Capsule')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Add Paracetamol 500 mg Oral Tablet'));
    fireEvent.change(screen.getByLabelText('Cash given'), { target: { value: '50' } });
    expect(screen.getByText('Change: KES 48.00')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByText(/Complete sale/));
    });
    await waitFor(() => expect(screen.getByText('Sale recorded: ACC-SINV-2026-00001')).toBeInTheDocument());
    expect(screen.getByText(/Change: KES 48.00/)).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith('http://services/pharmacy/counter/sale', expect.objectContaining({ method: 'POST' }));
  });

  test('the receipt', () => {
    const html = buildCounterReceiptHtml({
      pharmacy: 'Thika <Test>',
      invoice: 'ACC-SINV-2026-00001',
      postedAt: '2026-11-27T09:30:00Z',
      currency: 'KES',
      lines: [{ itemCode: 'PH7913', itemName: 'Paracetamol', qty: 10, rate: 2, amount: 20 }],
      total: 20,
      payment: 'Cash',
      tendered: 50,
    });
    expect(html).toContain('Thika &lt;Test&gt;');
    expect(html).toContain('10 × 2.00');
    expect(html).toContain('Change</td><td class="n">30.00');
  });
});
