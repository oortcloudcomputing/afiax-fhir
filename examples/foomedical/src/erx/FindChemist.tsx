// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Find a chemist (ADR-016 §3b): the patient asks the 5 nearest open chemists in the Afiax
// Prescription Network for a price on their prescription, sees the offers come in, ranked with the
// best one marked, and chooses one. Only the chosen chemist then gets the patient's name and phone.
// The patient follows it here: chosen, ready to collect, collected.

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Card,
  Group,
  Loader,
  Modal,
  Progress,
  Rating,
  Stack,
  Stepper,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconMapPin, IconPhone, IconStarFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChemistReviews } from './ChemistReviews';
import type { OfferApi, OfferRequestStatus, Position, RankedOffer } from './offers-api';
import { OfferApiError } from './offers-api';

/** The offer window (afiax-services OfferWindowMs). */
const WindowMs = 5 * 60 * 1000;

export interface FindChemistProps {
  /** The prescriptions to get (MedicationRequest ids). */
  readonly prescriptions: readonly string[];
  readonly api: OfferApi;
  /** Remembers the request in this browser, so coming back shows it again. */
  readonly storageKey: string;
  /** Where the patient is; the browser's location by default. */
  readonly locate?: () => Promise<Position>;
  /** How often to ask for news while waiting for offers (ms). */
  readonly pollMs?: number;
  /** How often to ask for news once a chemist is chosen (ms). */
  readonly followMs?: number;
  /** False when the prescription can no longer be filled: only a request made earlier is shown. */
  readonly canAsk?: boolean;
}

function browserLocation(): Promise<Position> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('This browser cannot share your location.'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () =>
        reject(
          new Error('Allow My Afiax to use your location, then try again. It is only used to find chemists near you.')
        ),
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 60_000 }
    );
  });
}

function remembered(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function remember(key: string, value: string | undefined): void {
  try {
    if (value) {
      localStorage.setItem(key, value);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // Private window: the request is simply not remembered
  }
}

function clock(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const kes = (n: number | undefined): string => `KES ${(n ?? 0).toLocaleString('en-KE')}`;

/**
 * The heading for a closed request, from afiax-services' reason.
 * @param reason - Why it closed.
 * @returns The heading.
 */
function closedTitle(reason: string): string {
  if (reason === 'You cancelled this request') {
    return 'Request cancelled';
  }
  if (reason.startsWith('These offers have expired')) {
    return 'These offers have expired';
  }
  if (reason.startsWith('No chemist sent an offer')) {
    return 'No offers this time';
  }
  return 'Your order was released';
}

/** No chemist was open nearby (afiax-services' reason when nobody could be asked). */
const NobodyOpen = 'No chemist open nearby';

/**
 * A moment, short: "4:30 pm" today, "Wed 4:30 pm" otherwise.
 * @param iso - The moment.
 * @returns The text.
 */
function when(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' });
  return d.toDateString() === new Date().toDateString()
    ? time
    : `${d.toLocaleDateString('en-KE', { weekday: 'short' })} ${time}`;
}

/**
 * Find a chemist for a prescription, and follow it until it is collected.
 * @param props - The component props.
 * @returns The card.
 */
export function FindChemist(props: FindChemistProps): JSX.Element {
  const {
    prescriptions,
    api,
    storageKey,
    locate = browserLocation,
    pollMs = 3000,
    followMs = 15_000,
    canAsk = true,
  } = props;
  const [status, setStatus] = useState<OfferRequestStatus>();
  const [busy, setBusy] = useState<'locating' | 'asking' | 'choosing' | 'cancelling'>();
  const [cancelling, setCancelling] = useState(false);
  const [reviewing, setReviewing] = useState<{ id: string; name: string }>();
  const [error, setError] = useState<string>();
  const [choosing, setChoosing] = useState<RankedOffer>();
  const [now, setNow] = useState(() => Date.now());
  // The whole window, for the time bar: 5 minutes, or what was left when the request started
  const [windowMs, setWindowMs] = useState(WindowMs);
  const requestId = status?.request;
  const loaded = useRef(false);

  // Coming back: show the request made earlier in this browser
  useEffect(() => {
    if (loaded.current) {
      return;
    }
    loaded.current = true;
    const earlier = remembered(storageKey);
    if (earlier) {
      api
        .status(earlier)
        .then(setStatus)
        .catch(() => remember(storageKey, undefined));
    }
  }, [api, storageKey]);

  const expiresAt = status?.expiresAt ? Date.parse(status.expiresAt) : undefined;
  const left = expiresAt ? expiresAt - now : 0;
  const stillAnswering = status?.state === 'waiting' && left > 0 && status.waiting > 0;
  const following = status?.state === 'chosen' || status?.state === 'ready';

  const refresh = useCallback(() => {
    if (!requestId) {
      return;
    }
    api
      .status(requestId)
      .then(setStatus)
      .catch(() => undefined);
  }, [api, requestId]);

  // News: every few seconds while chemists answer, every 15 s while the chosen one prepares it
  useEffect(() => {
    if (!stillAnswering && !following) {
      return undefined;
    }
    const timer = setInterval(refresh, stillAnswering ? pollMs : followMs);
    return () => clearInterval(timer);
  }, [stillAnswering, following, refresh, pollMs, followMs]);

  useEffect(() => {
    if (status?.state !== 'waiting') {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [status?.state]);

  async function start(): Promise<void> {
    setError(undefined);
    try {
      setBusy('locating');
      const position = await locate();
      setBusy('asking');
      const started = await api.request(prescriptions, position);
      setNow(Date.now());
      if (started.expiresAt) {
        setWindowMs(Math.max(1000, Date.parse(started.expiresAt) - Date.now()));
      }
      setStatus(started);
      remember(storageKey, started.state === 'cancelled' ? undefined : started.request);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(undefined);
    }
  }

  async function choose(offer: RankedOffer): Promise<void> {
    if (!requestId) {
      return;
    }
    setError(undefined);
    setBusy('choosing');
    try {
      setStatus(await api.choose(requestId, offer.offer));
    } catch (err) {
      setError(err instanceof OfferApiError || err instanceof Error ? err.message : String(err));
      refresh();
    } finally {
      setBusy(undefined);
      setChoosing(undefined);
    }
  }

  async function cancel(): Promise<void> {
    if (!requestId) {
      return;
    }
    setError(undefined);
    setBusy('cancelling');
    try {
      setStatus(await api.cancel(requestId));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      refresh();
    } finally {
      setBusy(undefined);
      setCancelling(false);
    }
  }

  async function rate(stars: number, comment: string): Promise<void> {
    if (!requestId) {
      return;
    }
    setError(undefined);
    try {
      setStatus(await api.rate(requestId, stars, comment.trim() || undefined));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  function again(): void {
    remember(storageKey, undefined);
    setStatus(undefined);
    setError(undefined);
  }

  if (!status && !canAsk) {
    return <></>;
  }

  return (
    <Card withBorder radius="md" p="md" data-testid="find-chemist">
      <Stack gap="sm">
        {!status && (
          <>
            <Title order={4}>Get it from a chemist near you</Title>
            <Text size="sm">
              We ask the 5 nearest open chemists for a price. Offers come in within 5 minutes and you choose one.
              Chemists see the medicines, your age and allergies, but not your name until you choose them.
            </Text>
            <Button leftSection={<IconMapPin size={18} />} onClick={() => start()} loading={!!busy} fullWidth>
              Find a chemist
            </Button>
            {busy === 'locating' && (
              <Text size="xs" c="dimmed" ta="center">
                Finding where you are…
              </Text>
            )}
          </>
        )}

        {status?.state === 'cancelled' && status.reason && status.reason !== NobodyOpen && (
          <>
            <Title order={4}>{closedTitle(status.reason)}</Title>
            <Text size="sm">{status.reason}</Text>
            <Button variant="light" onClick={again} fullWidth>
              Find a chemist again
            </Button>
          </>
        )}

        {status?.state === 'cancelled' && (!status.reason || status.reason === NobodyOpen) && (
          <>
            <Title order={4}>No chemist open near you right now</Title>
            <Text size="sm">
              None of the chemists in the Afiax network within 15 km is open just now. Try again later.
            </Text>
            <Button variant="light" onClick={again} fullWidth>
              Try again
            </Button>
          </>
        )}

        {status?.state === 'waiting' && (
          <Waiting
            status={status}
            left={left}
            windowMs={windowMs}
            onChoose={setChoosing}
            onAgain={again}
            onCancel={() => setCancelling(true)}
            onReviews={(offer) => setReviewing({ id: offer.chemistId, name: offer.chemistName })}
          />
        )}

        {status && (status.state === 'chosen' || status.state === 'ready' || status.state === 'collected') && (
          <Chosen status={status} onDone={again} onCancel={() => setCancelling(true)} onRate={rate} />
        )}

        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
      </Stack>

      <Modal opened={!!choosing} onClose={() => setChoosing(undefined)} title="Choose this chemist?" centered>
        {choosing && (
          <Stack gap="sm">
            <Text fw={600}>{choosing.chemistName}</Text>
            <Text size="sm">
              {kes(choosing.priceKes)} for everything, ready in {choosing.readyMinutes} min, {choosing.distanceKm} km
              away.
            </Text>
            <Text size="sm" c="dimmed">
              They get your name and phone so they can prepare it and call you. The other chemists are told you chose
              someone else. Pay at the chemist when you collect.
            </Text>
            <Group grow>
              <Button variant="default" onClick={() => setChoosing(undefined)} disabled={busy === 'choosing'}>
                Go back
              </Button>
              <Button onClick={() => choose(choosing)} loading={busy === 'choosing'}>
                Choose
              </Button>
            </Group>
          </Stack>
        )}
      </Modal>

      <ChemistReviews api={api} chemist={reviewing} onClose={() => setReviewing(undefined)} />

      <Modal opened={cancelling} onClose={() => setCancelling(false)} title="Cancel this request?" centered>
        <Stack gap="sm">
          <Text size="sm">
            {status?.chosen
              ? `${status.chosen.chemistName} is told and stops preparing it. You can find another chemist afterwards.`
              : 'The chemists are told you no longer need offers. You can ask again afterwards.'}
          </Text>
          <Group grow>
            <Button variant="default" onClick={() => setCancelling(false)} disabled={busy === 'cancelling'}>
              Keep it
            </Button>
            <Button color="red" onClick={() => cancel()} loading={busy === 'cancelling'}>
              Cancel request
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Card>
  );
}

function Waiting(props: {
  readonly status: OfferRequestStatus;
  readonly left: number;
  readonly windowMs: number;
  readonly onChoose: (offer: RankedOffer) => void;
  readonly onAgain: () => void;
  readonly onCancel: () => void;
  readonly onReviews: (offer: RankedOffer) => void;
}): JSX.Element {
  const { status, left, windowMs, onChoose, onAgain, onCancel, onReviews } = props;
  const open = left > 0 && status.waiting > 0;
  const parts = [
    `${status.asked} chemist${status.asked === 1 ? '' : 's'} asked`,
    `${status.offers.length} offer${status.offers.length === 1 ? '' : 's'}`,
  ];
  if (status.declined) {
    parts.push(`${status.declined} can't fill it`);
  }
  return (
    <>
      <Group justify="space-between" wrap="nowrap">
        <Title order={4}>{status.offers.length ? 'Offers near you' : 'Asking chemists near you'}</Title>
        {open && (
          <Badge variant="light" size="lg" style={{ flexShrink: 0 }}>
            {clock(left)}
          </Badge>
        )}
      </Group>
      {open && (
        <Progress
          value={Math.min(100, (left / windowMs) * 100)}
          size="sm"
          aria-label="Time left for chemists to answer"
        />
      )}
      <Text size="xs" c="dimmed">
        {parts.join(' · ')}
      </Text>

      {status.offers.length === 0 && open && (
        <Group gap="xs" justify="center" py="md">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            Waiting for chemists to answer…
          </Text>
        </Group>
      )}
      {status.offers.length === 0 && !open && (
        <>
          <Text size="sm">No chemist sent an offer this time.</Text>
          <Button variant="light" onClick={onAgain} fullWidth>
            Ask again
          </Button>
        </>
      )}

      {status.offers.map((offer) => (
        <OfferCard
          key={offer.offer}
          offer={offer}
          onChoose={() => onChoose(offer)}
          onReviews={() => onReviews(offer)}
        />
      ))}
      {status.offers.length > 0 && open && (
        <Text size="xs" c="dimmed" ta="center">
          More offers may come in. You can choose now or wait.
        </Text>
      )}
      {(open || status.offers.length > 0) && (
        <Button variant="subtle" color="gray" size="xs" onClick={onCancel}>
          Stop asking
        </Button>
      )}
    </>
  );
}

function OfferCard(props: {
  readonly offer: RankedOffer;
  readonly onChoose: () => void;
  readonly onReviews: () => void;
}): JSX.Element {
  const { offer, onChoose, onReviews } = props;
  return (
    <Card
      withBorder
      radius="md"
      p="sm"
      bd={offer.best ? '2px solid var(--mantine-primary-color-filled)' : undefined}
      data-testid="offer"
    >
      <Stack gap={6}>
        <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
          <div style={{ minWidth: 0 }}>
            <Text fw={600} truncate>
              {offer.chemistName}
            </Text>
            <Text size="xs" c="dimmed">
              {offer.distanceKm} km · ready in {offer.readyMinutes} min ·{' '}
              {offer.rating !== undefined && offer.ratings ? (
                <Anchor component="button" type="button" size="xs" onClick={onReviews}>
                  <IconStarFilled size={10} style={{ verticalAlign: 'baseline' }} /> {offer.rating.toFixed(1)} (
                  {offer.ratings}) · reviews
                </Anchor>
              ) : (
                'new'
              )}
            </Text>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <Text fw={700}>{kes(offer.priceKes)}</Text>
            {offer.best && (
              <Badge size="sm" leftSection={<IconStarFilled size={10} />}>
                Best
              </Badge>
            )}
          </div>
        </Group>
        <Button size="sm" variant={offer.best ? 'filled' : 'light'} onClick={onChoose} fullWidth>
          Choose
        </Button>
      </Stack>
    </Card>
  );
}

function Chosen(props: {
  readonly status: OfferRequestStatus;
  readonly onDone: () => void;
  readonly onCancel: () => void;
  readonly onRate: (stars: number, comment: string) => Promise<void>;
}): JSX.Element {
  const { status, onDone, onCancel, onRate } = props;
  const chosen = status.chosen;
  const step = { chosen: 1, ready: 2, collected: 3 }[status.state as 'chosen' | 'ready' | 'collected'];
  const headline = {
    chosen: `${chosen?.chemistName ?? 'The chemist'} is preparing it`,
    ready: 'Ready to collect',
    collected: 'Collected',
  }[status.state as 'chosen' | 'ready' | 'collected'];
  return (
    <>
      <Title order={4}>{headline}</Title>
      <Stepper active={step} size="xs" allowNextStepsSelect={false}>
        <Stepper.Step label="Chosen" />
        <Stepper.Step label="Ready" />
        <Stepper.Step label="Collected" />
      </Stepper>
      <Card withBorder radius="md" p="sm">
        <Text fw={600}>{chosen?.chemistName}</Text>
        <Text size="sm">
          {kes(chosen?.priceKes)}
          {status.state === 'chosen' && chosen?.readyMinutes !== undefined
            ? ` · ready in about ${chosen.readyMinutes} min`
            : ''}
        </Text>
        {chosen?.phone && (
          <Anchor href={`tel:${chosen.phone}`} size="sm">
            <IconPhone size={14} style={{ verticalAlign: 'middle' }} /> {chosen.phone}
          </Anchor>
        )}
      </Card>
      {status.state === 'chosen' && chosen?.holdUntil && (
        <Text size="sm">
          If it is not ready by {when(chosen.holdUntil)}, your order is released and you can choose another chemist.
        </Text>
      )}
      {status.state === 'ready' && chosen?.holdUntil && <Text size="sm">Collect by {when(chosen.holdUntil)}.</Text>}
      {status.state !== 'collected' && (
        <>
          <Text size="sm" c="dimmed">
            Take your ID. Pay at the chemist when you collect.
          </Text>
          <Button variant="subtle" color="red" size="xs" onClick={onCancel}>
            Cancel order
          </Button>
        </>
      )}
      {status.state === 'collected' && (
        <>
          <Text size="sm">Your record shows this prescription as dispensed.</Text>
          <RateChemist name={chosen?.chemistName ?? 'the chemist'} rated={status.rated} onRate={onRate} />
          <Button variant="default" onClick={onDone} fullWidth>
            Done
          </Button>
        </>
      )}
    </>
  );
}

function RateChemist(props: {
  readonly name: string;
  readonly rated?: number;
  readonly onRate: (stars: number, comment: string) => Promise<void>;
}): JSX.Element {
  const { name, rated, onRate } = props;
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  if (rated) {
    return (
      <Group gap="xs">
        <Rating value={rated} readOnly size="sm" />
        <Text size="sm" c="dimmed">
          Thank you for rating {name}.
        </Text>
      </Group>
    );
  }
  return (
    <Card withBorder radius="md" p="sm">
      <Stack gap="xs">
        <Text size="sm" fw={600}>
          How was {name}?
        </Text>
        <Rating value={stars} onChange={setStars} size="xl" aria-label={`Rate ${name}`} />
        {stars > 0 && (
          <>
            <Textarea
              label="Write a review (optional)"
              description="Other patients see it as 'Verified patient'. Phone numbers and your name are taken out."
              placeholder="How was the service, the price, the wait?"
              value={comment}
              onChange={(e) => setComment(e.currentTarget.value)}
              maxLength={500}
              autosize
              minRows={2}
            />
            <Button
              loading={sending}
              onClick={() => {
                setSending(true);
                onRate(stars, comment)
                  .catch(console.error)
                  .finally(() => setSending(false));
              }}
            >
              Send rating
            </Button>
          </>
        )}
        <Text size="xs" c="dimmed">
          Your stars and review help other patients choose. Nobody sees your name.
        </Text>
      </Stack>
    </Card>
  );
}
