// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { FindChemist } from './FindChemist';
import type { OfferApi, OfferRequestStatus, RankedOffer } from './offers-api';
import { OfferApiError, servicesOfferApi } from './offers-api';

const karen = { lat: -1.3197, lng: 36.7076 };
const inMinutes = (n: number): string => new Date(Date.now() + n * 60_000).toISOString();

const offer = (name: string, priceKes: number, best: boolean, extra: Partial<RankedOffer> = {}): RankedOffer => ({
  offer: `offer-${name}`,
  chemistId: name,
  chemistName: name,
  priceKes,
  readyMinutes: 15,
  distanceKm: 2.1,
  offeredAt: new Date().toISOString(),
  score: best ? 0.9 : 0.6,
  best,
  ...extra,
});

const waiting = (offers: RankedOffer[], extra: Partial<OfferRequestStatus> = {}): OfferRequestStatus => ({
  request: 'req-1',
  state: 'waiting',
  expiresAt: inMinutes(4),
  asked: 5,
  waiting: 5 - offers.length,
  declined: 0,
  offers,
  ...extra,
});

function fakeApi(over: Partial<OfferApi> = {}): jest.Mocked<OfferApi> {
  return {
    request: jest.fn().mockResolvedValue(waiting([])),
    status: jest.fn().mockResolvedValue(waiting([])),
    choose: jest.fn(),
    ...over,
  } as jest.Mocked<OfferApi>;
}

async function show(api: OfferApi, locate = jest.fn().mockResolvedValue(karen)): Promise<void> {
  await act(async () => {
    render(
      <MantineProvider>
        <FindChemist prescriptions={['rx-1']} api={api} storageKey="test-request" locate={locate} pollMs={50} />
      </MantineProvider>
    );
  });
}

async function findChemist(): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Find a chemist/ }));
  });
}

describe('Find a chemist', () => {
  beforeEach(() => localStorage.clear());

  test('asks with the location, then shows the offers as they come in, best first', async () => {
    const api = fakeApi({
      status: jest.fn().mockResolvedValue(
        waiting(
          [offer('Galleria Chemist', 590, true, { rating: 4.4, ratings: 12 }), offer('Karen Hub Pharmacy', 900, false)],
          {
            declined: 1,
            waiting: 2,
          }
        )
      ),
    });
    await show(api);
    expect(screen.getByText(/not your name until you choose them/)).toBeInTheDocument();
    await findChemist();
    expect(api.request).toHaveBeenCalledWith(['rx-1'], karen);
    expect(screen.getByText('Waiting for chemists to answer…')).toBeInTheDocument();
    expect(screen.getByText('5 chemists asked · 0 offers')).toBeInTheDocument();
    expect(localStorage.getItem('test-request')).toBe('req-1');

    // The screen asks again by itself
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 120);
      });
    });
    expect(api.status).toHaveBeenCalledWith('req-1');
    const offers = screen.getAllByTestId('offer');
    expect(offers).toHaveLength(2);
    expect(within(offers[0]).getByText('Galleria Chemist')).toBeInTheDocument();
    expect(within(offers[0]).getByText('KES 590')).toBeInTheDocument();
    expect(within(offers[0]).getByText('Best')).toBeInTheDocument();
    expect(within(offers[1]).queryByText('Best')).not.toBeInTheDocument();
    expect(screen.getByText("5 chemists asked · 2 offers · 1 can't fill it")).toBeInTheDocument();
  });

  test('chooses an offer after confirming, then follows it', async () => {
    const best = offer('Galleria Chemist', 590, true);
    const api = fakeApi({
      request: jest.fn().mockResolvedValue(waiting([best])),
      choose: jest.fn().mockResolvedValue({
        ...waiting([]),
        state: 'chosen',
        chosen: {
          offer: best.offer,
          chemistName: 'Galleria Chemist',
          priceKes: 590,
          readyMinutes: 15,
          phone: '+254700000002',
          status: 'Chosen by the patient',
        },
      }),
    });
    await show(api);
    await findChemist();
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('offer')).getByRole('button', { name: 'Choose' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('KES 590 for everything, ready in 15 min, 2.1 km away.');
    expect(dialog).toHaveTextContent('They get your name and phone');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Choose' }));
    });
    expect(api.choose).toHaveBeenCalledWith('req-1', best.offer);
    expect(screen.getByText('Galleria Chemist is preparing it')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+254700000002/ })).toHaveAttribute('href', 'tel:+254700000002');
    expect(screen.getByText(/Take your ID/)).toBeInTheDocument();
  });

  test('shows why choosing failed', async () => {
    const api = fakeApi({
      request: jest.fn().mockResolvedValue(waiting([offer('Galleria Chemist', 590, true)])),
      choose: jest.fn().mockRejectedValue(new OfferApiError('One of these prescriptions is no longer available', 409)),
    });
    await show(api);
    await findChemist();
    await act(async () => {
      fireEvent.click(within(screen.getByTestId('offer')).getByRole('button', { name: 'Choose' }));
    });
    await act(async () => {
      fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Choose' }));
    });
    expect(screen.getByText('One of these prescriptions is no longer available')).toBeInTheDocument();
  });

  test('says when no chemist is open nearby', async () => {
    const api = fakeApi({
      request: jest.fn().mockResolvedValue({ ...waiting([]), state: 'cancelled', asked: 0, waiting: 0 }),
    });
    await show(api);
    await findChemist();
    expect(screen.getByText('No chemist open near you right now')).toBeInTheDocument();
    expect(localStorage.getItem('test-request')).toBeNull();
  });

  test('asks for the location when it is not shared', async () => {
    const api = fakeApi();
    await show(api, jest.fn().mockRejectedValue(new Error('Allow My Afiax to use your location, then try again.')));
    await findChemist();
    expect(screen.getByText('Allow My Afiax to use your location, then try again.')).toBeInTheDocument();
    expect(api.request).not.toHaveBeenCalled();
  });

  test('shows a request made earlier in this browser', async () => {
    localStorage.setItem('test-request', 'req-1');
    const api = fakeApi({
      status: jest.fn().mockResolvedValue({
        ...waiting([]),
        state: 'ready',
        chosen: { offer: 'o', chemistName: 'Galleria Chemist', priceKes: 590, status: 'Ready to collect' },
      }),
    });
    await show(api);
    expect(api.status).toHaveBeenCalledWith('req-1');
    expect(screen.getByText('Ready to collect')).toBeInTheDocument();
  });

  test('when nobody answered in time, offers to ask again', async () => {
    const api = fakeApi({
      request: jest.fn().mockResolvedValue(waiting([], { expiresAt: inMinutes(-1), waiting: 0 })),
    });
    await show(api);
    await findChemist();
    expect(screen.getByText('No chemist sent an offer this time.')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Ask again' }));
    });
    expect(screen.getByRole('button', { name: /Find a chemist/ })).toBeInTheDocument();
  });
});

describe('The offer API on afiax-services', () => {
  test('sends the patient token and passes on refusals in their own words', async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 201, json: async () => waiting([]) })
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ message: 'That offer is not available' }) })
      .mockResolvedValueOnce({ ok: false, status: 502, json: async () => Promise.reject(new Error('not JSON')) });
    const api = servicesOfferApi('https://services.test/', () => 'patient-token', fetchFn);

    await expect(api.request(['rx-1'], karen)).resolves.toMatchObject({ request: 'req-1' });
    expect(fetchFn).toHaveBeenCalledWith('https://services.test/erx/offer-requests', {
      method: 'POST',
      headers: { Authorization: 'Bearer patient-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ prescriptions: ['rx-1'], position: karen }),
    });
    await expect(api.choose('req-1', 'o-2')).rejects.toThrow('That offer is not available');
    expect(fetchFn).toHaveBeenLastCalledWith(
      'https://services.test/erx/offer-requests/req-1/choose',
      expect.objectContaining({ method: 'POST' })
    );
    await expect(api.status('req-1')).rejects.toMatchObject({
      status: 502,
      message: 'Afiax is not reachable just now. Try again in a minute.',
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      'https://services.test/erx/offer-requests/req-1',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
