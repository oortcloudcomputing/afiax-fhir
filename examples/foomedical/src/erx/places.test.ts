// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { mapTilerPlaces } from './places';

jest.mock('../config', () => ({ MEDPLUM_MAPTILER_KEY: 'test-key' }));

describe('Place search', () => {
  test('asks MapTiler for places in Kenya, Nairobi first, and reads the matches', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          { place_name: 'Yaya Centre, Kilimani, Nairobi', center: [36.7876, -1.2925] },
          { text: 'No position' },
        ],
      }),
    });
    const search = mapTilerPlaces(fetchFn as unknown as typeof fetch);
    await expect(search?.('Yaya centre')).resolves.toEqual([
      { label: 'Yaya Centre, Kilimani, Nairobi', position: { lat: -1.2925, lng: 36.7876 } },
    ]);
    const url = new URL(String(fetchFn.mock.calls[0][0]));
    expect(url.pathname).toBe('/geocoding/Yaya%20centre.json');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      key: 'test-key',
      country: 'ke',
      limit: '5',
      proximity: '36.8219,-1.2921',
    });
  });

  test('does not search for fewer than 3 letters, and gives nothing when MapTiler fails', async () => {
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, json: async () => ({}) });
    const search = mapTilerPlaces(fetchFn as unknown as typeof fetch);
    await expect(search?.('Ya')).resolves.toEqual([]);
    expect(fetchFn).not.toHaveBeenCalled();
    await expect(search?.('Yaya')).resolves.toEqual([]);
  });
});
