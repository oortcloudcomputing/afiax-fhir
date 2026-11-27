// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import type { StockList, StockRow } from './KenyaPharmacyStock';
import { filterStock, KenyaPharmacyStock } from './KenyaPharmacyStock';

const amx: StockRow = {
  itemCode: 'PH12907',
  itemName: 'Amoxicillin 500 mg Oral Capsule',
  genericCode: 'GE10160',
  uom: 'Capsule',
  onHand: 156,
  usable: 126,
  expiredQty: 30,
  nextExpiry: '2027-01-31',
  batches: [
    { batchNo: 'AMX-2510', expiry: '2026-10-31', qty: 30, status: 'expired' },
    { batchNo: 'AMX-2603', expiry: '2027-01-31', qty: 42, status: 'expiring' },
  ],
  flags: ['expired', 'expiring'],
};
const pcm: StockRow = {
  itemCode: 'PH7913',
  itemName: 'Paracetamol 500 mg Oral Tablet',
  uom: 'Tablet',
  onHand: 500,
  usable: 500,
  expiredQty: 0,
  batches: [],
  flags: [],
};
const list: StockList = { warehouse: 'Dispensary - ADP', asOf: '2026-11-27', expiringDays: 90, items: [amx, pcm] };

describe('KenyaPharmacyStock', () => {
  test('filters and search', () => {
    expect(filterStock(list.items, 'attention', '')).toEqual([amx]);
    expect(filterStock(list.items, 'expired', '')).toEqual([amx]);
    expect(filterStock(list.items, 'low', '')).toEqual([]);
    expect(filterStock(list.items, 'all', 'ge10160')).toEqual([amx]);
    expect(filterStock(list.items, 'all', 'parac')).toEqual([pcm]);
  });

  test('lists the dispensary, shows batches on click', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => list });
    renderWithMedplum(new MockClient(), <KenyaPharmacyStock servicesUrl="http://services/" fetchFn={fetchFn as unknown as typeof fetch} />);
    expect(await screen.findByText('Amoxicillin 500 mg Oral Capsule')).toBeInTheDocument();
    expect(fetchFn).toHaveBeenCalledWith('http://services/pharmacy/stock/all', expect.anything());
    expect(screen.getByText('Expired on shelf')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Amoxicillin 500 mg Oral Capsule'));
    expect(screen.getByText('Expired: take off the shelf')).toBeInTheDocument();
    expect(screen.getByText('Within 90 days')).toBeInTheDocument();
  });

  test('says when stock is not connected or fails', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue({ ok: false, status: 404, json: async () => ({ message: 'Stock is not connected for this facility yet' }) });
    renderWithMedplum(new MockClient(), <KenyaPharmacyStock servicesUrl="http://services" fetchFn={fetchFn as unknown as typeof fetch} />);
    await waitFor(() => expect(screen.getByText('Stock is not connected for this facility yet')).toBeInTheDocument());
  });
});
