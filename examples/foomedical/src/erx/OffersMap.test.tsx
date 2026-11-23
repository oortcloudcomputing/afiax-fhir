// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { OffersMap } from './OffersMap';

jest.mock('../config', () => ({ MAP_AVAILABLE: true, MEDPLUM_MAPTILER_KEY: 'test-key' }));

const karen = { lat: -1.3197, lng: 36.7076 };

describe('OffersMap', () => {
  test('shows the patient and a price pin per offer; tapping a pin picks it', async () => {
    const onPick = jest.fn();
    await act(async () => {
      render(
        <MantineProvider>
          <OffersMap
            center={karen}
            pins={[
              { id: 'o1', position: { lat: -1.31, lng: 36.71 }, label: 'KES 590', best: true },
              { id: 'o2', position: { lat: -1.33, lng: 36.7 }, label: 'KES <b>900</b>' },
            ]}
            onPick={onPick}
          />
        </MantineProvider>
      );
    });
    const map = screen.getByTestId('offers-map');
    expect(map.querySelector('.leaflet-tile-pane')).not.toBeNull();
    // MapTiler tiles with the key, and their attribution
    expect(map.querySelector('img.leaflet-tile')?.getAttribute('src')).toContain('api.maptiler.com/maps/streets-v2/');
    expect(map.textContent).toContain('MapTiler');
    // Pins: the best one starred; text from offers is escaped, never HTML
    const best = screen.getByTitle('KES 590');
    expect(best.textContent).toBe('★ KES 590');
    expect(screen.getByTitle('KES <b>900</b>').querySelector('b')).toBeNull();
    fireEvent.click(best);
    expect(onPick).toHaveBeenCalledWith('o1');
  });
});
