// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Development only (/preview/find-a-chemist, never in a build): Find a chemist against simulated
// chemists, so the screen can be seen without Afiax FHIR or afiax-services. Offers arrive over a
// few seconds, one chemist declines; after choosing, it becomes ready, then collected.

import { Alert, Box, Button, Container, Group, Stack, Text, Title } from '@mantine/core';
import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { FindChemist } from './FindChemist';
import type { OfferApi, OfferRequestStatus, RankedOffer } from './offers-api';

interface Simulated {
  readonly at: number;
  readonly name: string;
  readonly priceKes?: number;
  readonly readyMinutes?: number;
  readonly distanceKm: number;
  readonly rating?: number;
  readonly ratings?: number;
  readonly phone: string;
}

// Seconds after the request at which each chemist answers (no price: declines; no "at": never)
const chemists: Simulated[] = [
  {
    at: 4,
    name: 'Karen Hub Pharmacy',
    priceKes: 900,
    readyMinutes: 10,
    distanceKm: 0.8,
    rating: 4.7,
    ratings: 31,
    phone: '+254700000001',
  },
  {
    at: 7,
    name: 'Galleria Chemist',
    priceKes: 590,
    readyMinutes: 15,
    distanceKm: 2.1,
    rating: 4.4,
    ratings: 12,
    phone: '+254700000002',
  },
  { at: 10, name: 'Langata Road Chemist', distanceKm: 3.0, phone: '+254700000003' },
  {
    at: 14,
    name: 'Dagoretti Corner Pharmacy',
    priceKes: 650,
    readyMinutes: 30,
    distanceKm: 4.2,
    phone: '+254700000004',
  },
  { at: 9999, name: 'Hardy Chemist', distanceKm: 5.5, phone: '+254700000005' },
];

/**
 * The same ranking as afiax-services (src/erx/network.ts rankOffers), for the preview.
 * @param offers - The offers received.
 * @returns The offers, best first.
 */
function rank(offers: Omit<RankedOffer, 'score' | 'best'>[]): RankedOffer[] {
  if (!offers.length) {
    return [];
  }
  const cheapest = Math.min(...offers.map((o) => o.priceKes));
  const nearest = Math.min(...offers.map((o) => o.distanceKm));
  const soonest = Math.min(...offers.map((o) => o.readyMinutes));
  const steady = (r?: number, n = 0): number => (r === undefined || !n ? 3.5 : (r * n + 3.5 * 5) / (n + 5));
  return offers
    .map((o) => ({
      ...o,
      score:
        0.5 * (cheapest / o.priceKes) ** 2 +
        0.2 * ((nearest + 1) / (o.distanceKm + 1)) +
        0.15 * ((soonest + 10) / (o.readyMinutes + 10)) +
        0.15 * (steady(o.rating, o.ratings) / 5),
      best: false,
    }))
    .sort((a, b) => b.score - a.score)
    .map((o, i) => ({ ...o, best: i === 0 }));
}

/** What the chemist side does in the preview (buttons under the screen). */
interface ChemistActions {
  giveUp(): void;
  timeRunsOut(): void;
  handOver(): void;
}

function simulatedApi(speed: number): { api: OfferApi; chemist: ChemistActions } {
  let started = 0;
  let chosenAt = 0;
  let chosen: Simulated | undefined;
  let closed: string | undefined;
  let collected = false;
  const secs = (since: number): number => ((Date.now() - since) / 1000) * speed;

  function status(): OfferRequestStatus {
    const t = secs(started);
    const answered = chemists.filter((c) => c.at <= t);
    const expiresAt = new Date(started + (5 * 60 * 1000) / speed).toISOString();
    if (closed) {
      return {
        request: 'preview',
        state: 'cancelled',
        asked: chemists.length,
        waiting: 0,
        declined: 0,
        offers: [],
        reason: closed,
      };
    }
    if (chosen) {
      const c = secs(chosenAt);
      let state: 'chosen' | 'ready' | 'collected' = 'chosen';
      if (collected) {
        state = 'collected';
      } else if (c > 8) {
        state = 'ready';
      }
      const readyBy = chosenAt + ((chosen.readyMinutes ?? 0) * 60_000 + 2 * 60 * 60_000) / speed;
      return {
        request: 'preview',
        state,
        expiresAt,
        asked: chemists.length,
        waiting: 0,
        declined: answered.filter((a) => !a.priceKes).length,
        offers: [],
        chosen: {
          offer: chosen.name,
          chemistName: chosen.name,
          priceKes: chosen.priceKes,
          readyMinutes: chosen.readyMinutes,
          phone: chosen.phone,
          status: { chosen: 'Chosen by the patient', ready: 'Ready to collect', collected: 'Collected' }[state],
          holdUntil:
            state === 'collected'
              ? undefined
              : new Date(state === 'ready' ? Date.now() + 3 * 24 * 60 * 60_000 : readyBy).toISOString(),
        },
      };
    }
    const expired = Date.now() > Date.parse(expiresAt);
    return {
      request: 'preview',
      state: 'waiting',
      expiresAt,
      asked: chemists.length,
      waiting: expired ? 0 : chemists.length - answered.length,
      declined: answered.filter((a) => !a.priceKes).length,
      offers: rank(
        answered
          .filter((a) => a.priceKes)
          .map((a) => ({
            offer: a.name,
            chemistId: a.name,
            chemistName: a.name,
            priceKes: a.priceKes as number,
            readyMinutes: a.readyMinutes as number,
            distanceKm: a.distanceKm,
            rating: a.rating,
            ratings: a.ratings,
            offeredAt: new Date(started + a.at * 1000).toISOString(),
          }))
      ),
    };
  }

  const later = <T,>(value: () => T, ms = 400): Promise<T> =>
    new Promise((resolve) => {
      setTimeout(() => resolve(value()), ms);
    });
  const api: OfferApi = {
    request: () =>
      later(() => {
        started = Date.now();
        chosen = undefined;
        closed = undefined;
        collected = false;
        return status();
      }, 600),
    status: () => (started ? later(status, 150) : Promise.reject(new Error('No request yet'))),
    choose: (_request, offer) =>
      later(() => {
        chosen = chemists.find((c) => c.name === offer);
        chosenAt = Date.now();
        return status();
      }),
    cancel: () =>
      later(() => {
        closed = 'You cancelled this request';
        return status();
      }),
  };
  const chemist: ChemistActions = {
    giveUp: () => {
      closed = `${chosen?.name ?? 'The chemist'} cannot fill it after all (Out of stock). Find another chemist.`;
    },
    timeRunsOut: () => {
      closed =
        secs(chosenAt) > 8
          ? 'It was not collected in time, so the chemist released it. Find a chemist again if you still need it.'
          : `${chosen?.name ?? 'The chemist'} did not get it ready in time. Find another chemist.`;
    },
    handOver: () => {
      collected = true;
    },
  };
  return { api, chemist };
}

/**
 * The preview page.
 * @returns The page.
 */
export default function FindChemistPreview(): JSX.Element {
  const [speed, setSpeed] = useState(1);
  const [run, setRun] = useState(0);
  const { api, chemist } = useMemo(() => simulatedApi(speed), [speed, run]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Container size={420} px={16} py="md">
      <Stack gap="md">
        <Alert color="yellow" variant="light" p="xs">
          <Text size="xs">Preview with simulated chemists (development only). Nothing is sent anywhere.</Text>
        </Alert>
        <Group gap="xs">
          {[1, 10].map((s) => (
            <Button key={s} size="compact-xs" variant={speed === s ? 'filled' : 'default'} onClick={() => setSpeed(s)}>
              {s === 1 ? 'Real time' : '10× faster'}
            </Button>
          ))}
          <Button size="compact-xs" variant="default" onClick={() => setRun((r) => r + 1)}>
            Start over
          </Button>
        </Group>
        <Box>
          <Title order={2}>Amoxicillin 500 mg Oral Capsule</Title>
          <Text c="dimmed" size="sm">
            1 capsule three times a day · 21 capsules · Dr. Achieng, Karen Health Centre
          </Text>
        </Box>
        <FindChemist
          key={`${speed}-${run}`}
          prescriptions={['preview']}
          api={api}
          storageKey={`afiax-preview-${run}`}
          locate={() =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ lat: -1.3197, lng: 36.7076 }), 800);
            })
          }
          pollMs={1000}
          followMs={1000}
        />
        <Stack gap={4}>
          <Text size="xs" c="dimmed">
            The chemist's side, after you choose:
          </Text>
          <Group gap="xs">
            <Button size="compact-xs" variant="default" onClick={chemist.giveUp}>
              Can't fill it after all
            </Button>
            <Button size="compact-xs" variant="default" onClick={chemist.timeRunsOut}>
              Time limit passes
            </Button>
            <Button size="compact-xs" variant="default" onClick={chemist.handOver}>
              Handed over
            </Button>
          </Group>
        </Stack>
      </Stack>
    </Container>
  );
}
