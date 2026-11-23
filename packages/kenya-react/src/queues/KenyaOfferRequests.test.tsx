// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Task } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { KenyaOfferRequests } from './KenyaOfferRequests';
import type { OfferRequestView } from './offer-requests';
import { NetworkTaskCodeSystem, offerCard, sortOfferCards } from './offer-requests';

const minutes = (n: number): string => new Date(Date.now() + n * 60_000).toISOString();

function offerTask(id: string, extra: Partial<Task> = {}, expiresIn = 4): Task {
  const view: OfferRequestView = {
    lines: [
      {
        medication: { text: 'Amoxicillin 500 mg Oral Capsule' },
        dose: '1 capsule three times a day',
        quantity: 21,
        unit: 'capsule',
      },
      { medication: { text: 'Paracetamol 500 mg Tablet' }, quantity: 10 },
    ],
    patient: { gender: 'female', age: 36, allergies: ['Penicillin (Rash)'] },
    expiresAt: minutes(expiresIn),
    distanceKm: 1.2,
  };
  return {
    resourceType: 'Task',
    id,
    status: 'requested',
    intent: 'proposal',
    code: { coding: [{ system: NetworkTaskCodeSystem, code: 'offer' }] },
    owner: { reference: 'Organization/chem-1' },
    authoredOn: minutes(expiresIn - 5),
    restriction: { period: { end: view.expiresAt } },
    input: [{ type: { text: 'request' }, valueString: JSON.stringify(view) }],
    ...extra,
  };
}

const chosenTask = (status: Task['status']): Task =>
  offerTask('o-chosen', {
    status,
    output: [
      { type: { text: 'price-kes' }, valueDecimal: 590 },
      { type: { text: 'ready-minutes' }, valueInteger: 15 },
    ],
    input: [
      ...(offerTask('x').input ?? []),
      { type: { text: 'patient' }, valueString: JSON.stringify({ name: 'Wanjiru Kamau', phone: '+254711000111' }) },
    ],
  });

// jsdom has no Response: what the component reads of one
function reply(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: async () => body } as Response;
}
const ok = (body: unknown = { status: 'ok' }): Response => reply(200, body);

async function show(tasks: Task[], fetchFn: jest.Mock): Promise<{ unmount: () => void; medplum: MockClient }> {
  const medplum = new MockClient();
  jest.spyOn(medplum, 'searchResources').mockResolvedValue(tasks as never);
  jest.spyOn(medplum, 'getAccessToken').mockReturnValue('chemist-token');
  let unmount = (): void => undefined;
  await act(async () => {
    unmount = renderWithMedplum(
      medplum,
      <KenyaOfferRequests servicesUrl="https://services.test/" fetchFn={fetchFn} />
    ).unmount;
  });
  return { unmount, medplum };
}

describe('KenyaOfferRequests', () => {
  test('knows what a chemist can do with each offer', () => {
    const now = new Date();
    expect(offerCard(offerTask('a'), now).stage).toBe('answer');
    expect(offerCard(offerTask('b', {}, -1), now)).toMatchObject({ stage: 'closed', closed: 'Not answered in time' });
    expect(offerCard(chosenTask('received'), now)).toMatchObject({ stage: 'offered', priceKes: 590, readyMinutes: 15 });
    expect(offerCard(chosenTask('accepted'), now)).toMatchObject({
      stage: 'chosen',
      patient: { name: 'Wanjiru Kamau', phone: '+254711000111' },
    });
    expect(offerCard(chosenTask('in-progress'), now).stage).toBe('ready');
    expect(offerCard(offerTask('c', { status: 'rejected', statusReason: { text: 'Out of stock' } }), now).closed).toBe(
      'You declined: Out of stock'
    );
    expect(
      offerCard(
        offerTask('d', { status: 'cancelled', statusReason: { text: 'The patient chose another chemist' } }),
        now
      ).closed
    ).toBe('The patient chose another chemist');
    // What needs an answer comes first, the one expiring soonest on top
    const sorted = sortOfferCards(
      [chosenTask('received'), offerTask('late', {}, 4), chosenTask('accepted'), offerTask('soon', {}, 1)].map((t) =>
        offerCard(t, now)
      )
    );
    expect(sorted.map((c) => c.stage)).toEqual(['answer', 'answer', 'chosen', 'offered']);
    expect(sorted[0]?.id).toBe('soon');
  });

  test('shows a new request without the patient, and sends an offer', async () => {
    const fetchFn = jest.fn().mockResolvedValue(ok({ status: 'received' }));
    const { unmount, medplum } = await show([offerTask('o1')], fetchFn);
    expect(medplum.searchResources).toHaveBeenCalledWith('Task', expect.any(URLSearchParams), { cache: 'no-cache' });
    const params = (medplum.searchResources as jest.Mock).mock.calls[0][1] as URLSearchParams;
    expect(params.get('code')).toBe(`${NetworkTaskCodeSystem}|offer`);

    expect(screen.getByText('Woman, 36 · 1.2 km away')).toBeInTheDocument();
    expect(screen.getByText('Amoxicillin 500 mg Oral Capsule × 21 capsule')).toBeInTheDocument();
    expect(screen.getByText('Allergies: Penicillin (Rash)')).toBeInTheDocument();
    expect(screen.getByText(/left$/)).toBeInTheDocument();
    expect(screen.queryByText(/Wanjiru/)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Total price/), { target: { value: '590' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    });
    expect(fetchFn).toHaveBeenCalledWith('https://services.test/erx/offers/o1/reply', {
      method: 'POST',
      headers: { Authorization: 'Bearer chemist-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ priceKes: 590, readyMinutes: 15 }),
    });
    expect(await screen.findByText('Offer sent. The patient sees it now.')).toBeInTheDocument();
    unmount();
  });

  test('declines with a reason', async () => {
    const fetchFn = jest.fn().mockResolvedValue(ok({ status: 'rejected' }));
    const { unmount } = await show([offerTask('o1')], fetchFn);
    fireEvent.click(screen.getByRole('button', { name: "Can't fill it" }));
    fireEvent.change(screen.getByLabelText(/Why not/), { target: { value: 'Out of stock' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Decline' }));
    });
    expect(fetchFn).toHaveBeenCalledWith(
      'https://services.test/erx/offers/o1/reply',
      expect.objectContaining({ body: JSON.stringify({ decline: true, reason: 'Out of stock' }) })
    );
    unmount();
  });

  test("shows the services' reason when an answer is refused", async () => {
    const fetchFn = jest
      .fn()
      .mockResolvedValue(reply(409, { message: 'The patient is no longer waiting for offers on this prescription' }));
    const { unmount } = await show([offerTask('o1')], fetchFn);
    fireEvent.change(screen.getByLabelText(/Total price/), { target: { value: '590' } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Send offer' }));
    });
    expect(
      await screen.findByText('The patient is no longer waiting for offers on this prescription')
    ).toBeInTheDocument();
    unmount();
  });

  test('gives the chosen chemist the patient, then marks it ready and handed over', async () => {
    const fetchFn = jest.fn().mockResolvedValue(ok());
    const { unmount } = await show([chosenTask('accepted')], fetchFn);
    expect(screen.getByText('Wanjiru Kamau')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '+254711000111' })).toHaveAttribute('href', 'tel:+254711000111');
    expect(screen.getByText('You offered KES 590, ready in 15 min')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: "It's ready to collect" }));
    });
    expect(fetchFn).toHaveBeenLastCalledWith(
      'https://services.test/erx/offers/o-chosen/ready',
      expect.objectContaining({ method: 'POST' })
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Handed over' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Record that Wanjiru Kamau collected everything on this prescription?');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Handed over' }));
    });
    await waitFor(() =>
      expect(fetchFn).toHaveBeenLastCalledWith(
        'https://services.test/erx/offers/o-chosen/dispensed',
        expect.objectContaining({ method: 'POST' })
      )
    );
    unmount();
  });

  test('says when there is nothing to answer, and lists what closed', async () => {
    const { unmount } = await show(
      [offerTask('old', { status: 'cancelled', statusReason: { text: 'The patient chose another chemist' } })],
      jest.fn()
    );
    expect(screen.getByText(/No open requests/)).toBeInTheDocument();
    expect(screen.getByText('The patient chose another chemist')).toBeInTheDocument();
    unmount();
  });
});
