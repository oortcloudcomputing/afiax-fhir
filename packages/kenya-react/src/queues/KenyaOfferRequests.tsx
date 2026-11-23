// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Offer requests of the Afiax Prescription Network (ADR-016 §3b), for a chemist in Afiax Provider.
// A nearby patient asks up to 5 open chemists for a price on their prescription; each chemist has
// 5 minutes to offer a total price and a ready time, or to decline. The patient picks one offer; only
// that chemist then sees the patient's name and phone, prepares the medicines, says they are ready
// and records the hand-over (afiax-services dispenses the prescription in the prescriber's project).
//
// The chemist reads its own offer Tasks with its own token (the network access policy shows only
// its own); every answer goes to afiax-services, which checks the window and the claim.

import {
  Alert,
  Anchor,
  Badge,
  Button,
  Checkbox,
  Group,
  NumberInput,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import type { Task } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConfirmButton } from '../common/ConfirmButton';
import { ChemistOwnReviews } from './ChemistOwnReviews';
import { RiderSharing } from './RiderSharing';
import type { OfferCard, OfferRequestView, OfferStage } from './offer-requests';
import { NetworkTaskCodeSystem, offerCard, sortOfferCards } from './offer-requests';

/** How often the list reloads, so a new request shows within seconds. */
const RefreshMs = 10_000;

function timeLeft(expiresAt: string | undefined, now: Date): string {
  const ms = Math.max(0, Date.parse(expiresAt ?? '') - now.getTime());
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function shortTime(iso: string): string {
  return new Date(iso).toLocaleString('en-KE', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
}

function medicineName(line: OfferRequestView['lines'][number]): string {
  return line.medication.text ?? line.medication.display ?? line.medication.code ?? 'Medicine';
}

function who(patient: OfferRequestView['patient'] | undefined): string {
  const sexes: Record<string, string> = { female: 'Woman', male: 'Man' };
  const sex = sexes[patient?.gender ?? ''] ?? 'Patient';
  return patient?.age !== undefined ? `${sex}, ${patient.age}` : sex;
}

export interface KenyaOfferRequestsProps {
  /** afiax-services (for example https://services.afiax.africa); its /erx endpoints take the answers. */
  readonly servicesUrl: string;
  /** fetch, injected in tests. */
  readonly fetchFn?: typeof fetch;
}

/**
 * A chemist's offer requests: answer new ones within 5 minutes, then prepare and hand over the chosen ones.
 * @param props - The component props.
 * @returns The list.
 */
export function KenyaOfferRequests(props: KenyaOfferRequestsProps): JSX.Element {
  const { servicesUrl } = props;
  const fetchFn = useMemo(() => props.fetchFn ?? globalThis.fetch.bind(globalThis), [props.fetchFn]);
  const medplum = useMedplum();
  const [tasks, setTasks] = useState<Task[]>();
  const [error, setError] = useState<string>();
  const [now, setNow] = useState(() => new Date());

  const load = useCallback(() => {
    medplum
      .searchResources(
        'Task',
        new URLSearchParams([
          ['code', `${NetworkTaskCodeSystem}|offer`],
          ['_sort', '-authored-on'],
          ['_count', '50'],
        ]),
        { cache: 'no-cache' }
      )
      .then((found) => {
        setTasks(found);
        setError(undefined);
      })
      .catch((err) => setError(normalizeErrorString(err)));
  }, [medplum]);

  useEffect(() => {
    load();
    const reload = setInterval(load, RefreshMs);
    const tick = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(reload);
      clearInterval(tick);
    };
  }, [load]);

  async function send(
    offerId: string,
    action: 'reply' | 'ready' | 'dispensed' | 'withdraw' | 'out-for-delivery' | 'delivered',
    body: object = {}
  ): Promise<boolean> {
    try {
      const response = await fetchFn(`${servicesUrl.replace(/\/$/, '')}/erx/offers/${offerId}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${medplum.getAccessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const answer = (await response.json().catch(() => undefined)) as { message?: string } | undefined;
        throw new Error(answer?.message ?? `Afiax services answered ${response.status}`);
      }
      return true;
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
      return false;
    } finally {
      load();
    }
  }

  // The rider's position during a delivery: no reload, no message (it repeats every 20 seconds)
  const share = useCallback(
    async (offerId: string, position: { lat: number; lng: number }): Promise<void> => {
      await fetchFn(`${servicesUrl.replace(/\/$/, '')}/erx/offers/${offerId}/location`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${medplum.getAccessToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(position),
      });
    },
    [fetchFn, servicesUrl, medplum]
  );

  const cards = sortOfferCards((tasks ?? []).map((t) => offerCard(t, now)));
  const open = cards.filter((c) => c.stage !== 'closed');
  const closed = cards.filter((c) => c.stage === 'closed').slice(0, 10);
  // The chemist's own Organization: the owner of its offer Tasks
  const organizationId = tasks?.[0]?.owner?.reference?.split('/')[1];

  return (
    <Stack gap="md">
      <div>
        <Title order={3}>Offer requests</Title>
        <Text size="sm" c="dimmed">
          Patients nearby ask for a price on their prescription. Answer within 5 minutes; the patient picks one chemist.
        </Text>
      </div>
      {error && (
        <Alert color="red" variant="light">
          {error}
        </Alert>
      )}
      {tasks && open.length === 0 && (
        <Paper withBorder p="md">
          <Text c="dimmed">No open requests. New ones appear here, and you get an SMS.</Text>
        </Paper>
      )}
      {open.map((card) => (
        <OfferRequestCard key={card.id} card={card} now={now} send={send} share={share} />
      ))}
      {closed.length > 0 && (
        <Stack gap="xs">
          <Title order={5}>Recently closed</Title>
          {closed.map((card) => (
            <Paper key={card.id} withBorder p="sm">
              <Group justify="space-between" wrap="nowrap" gap="xs">
                <Text size="sm" lineClamp={1}>
                  {card.view?.lines.map(medicineName).join(', ') ?? 'Prescription'}
                </Text>
                <Text size="xs" c="dimmed" ta="right">
                  {card.closed}
                </Text>
              </Group>
            </Paper>
          ))}
        </Stack>
      )}
      {organizationId && (
        <ChemistOwnReviews servicesUrl={servicesUrl} organizationId={organizationId} fetchFn={fetchFn} />
      )}
    </Stack>
  );
}

interface OfferRequestCardProps {
  readonly card: OfferCard;
  readonly now: Date;
  readonly send: (
    offerId: string,
    action: 'reply' | 'ready' | 'dispensed' | 'withdraw' | 'out-for-delivery' | 'delivered',
    body?: object
  ) => Promise<boolean>;
  /** Sends the rider's position for a delivery, quietly. */
  readonly share: (offerId: string, position: { lat: number; lng: number }) => Promise<void>;
}

function OfferRequestCard(props: OfferRequestCardProps): JSX.Element {
  const { card, now, send, share } = props;
  const [price, setPrice] = useState<number | string>('');
  const [ready, setReady] = useState<number | string>(15);
  const [delivers, setDelivers] = useState(false);
  const [deliveryKes, setDeliveryKes] = useState<number | string>(0);
  const [deliveryMinutes, setDeliveryMinutes] = useState<number | string>(30);
  const [code, setCode] = useState('');
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState('');
  const [givingUp, setGivingUp] = useState(false);
  const [giveUpReason, setGiveUpReason] = useState('');
  const [busy, setBusy] = useState(false);
  const view = card.view;

  async function act(
    action: 'reply' | 'ready' | 'dispensed' | 'withdraw' | 'out-for-delivery' | 'delivered',
    body?: object,
    done?: string
  ): Promise<void> {
    setBusy(true);
    const ok = await send(card.id, action, body);
    setBusy(false);
    if (ok && done) {
      showNotification({ color: 'green', message: done });
    }
  }

  const badge: Record<Exclude<OfferStage, 'closed'>, { color: string; label: string }> = {
    answer: { color: 'orange', label: `${timeLeft(card.expiresAt, now)} left` },
    offered: { color: 'blue', label: 'Waiting for the patient' },
    chosen: { color: 'green', label: card.delivery ? 'Chosen: prepare it for delivery' : 'Chosen: prepare it' },
    ready: { color: 'teal', label: 'Ready to collect' },
    delivering: { color: 'grape', label: 'Out for delivery' },
  };
  const b = badge[card.stage as Exclude<OfferStage, 'closed'>];
  const held = card.stage === 'chosen' || card.stage === 'ready' || card.stage === 'delivering';

  return (
    <Paper withBorder p="md" data-testid="offer-request">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap" gap="xs">
          <Text fw={600}>
            {who(view?.patient)}
            {view ? ` · ${view.distanceKm} km away` : ''}
          </Text>
          <Badge color={b.color} style={{ flexShrink: 0 }}>
            {b.label}
          </Badge>
        </Group>
        <Stack gap={4}>
          {view?.lines.map((line, i) => (
            <div key={`${card.id}-${i}`}>
              <Text size="sm" fw={500}>
                {medicineName(line)}
                {line.quantity !== undefined ? ` × ${line.quantity}${line.unit ? ` ${line.unit}` : ''}` : ''}
              </Text>
              {line.dose && (
                <Text size="xs" c="dimmed">
                  {line.dose}
                </Text>
              )}
            </div>
          ))}
        </Stack>
        {view?.patient.allergies.length ? (
          <Alert color="red" variant="light" p="xs">
            Allergies: {view.patient.allergies.join(', ')}
          </Alert>
        ) : (
          <Text size="xs" c="dimmed">
            No allergies recorded
          </Text>
        )}

        {card.stage === 'answer' && !declining && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              act(
                'reply',
                { priceKes: price, readyMinutes: ready, ...(delivers ? { deliveryKes, deliveryMinutes } : {}) },
                'Offer sent. The patient sees it now.'
              ).catch(console.error);
            }}
          >
            <Stack gap="xs">
              <Group grow align="flex-start" gap="xs">
                <NumberInput
                  label="Total price (KES)"
                  description="Everything on it"
                  min={1}
                  value={price}
                  onChange={setPrice}
                  required
                />
                <NumberInput
                  label="Ready in (minutes)"
                  min={0}
                  max={1440}
                  allowDecimal={false}
                  value={ready}
                  onChange={setReady}
                  required
                />
              </Group>
              <Checkbox
                label="We can also deliver it"
                checked={delivers}
                onChange={(e) => setDelivers(e.currentTarget.checked)}
              />
              {delivers && (
                <Group grow align="flex-start" gap="xs">
                  <NumberInput
                    label="Delivery fee (KES)"
                    description="0 for free delivery"
                    min={0}
                    max={5000}
                    value={deliveryKes}
                    onChange={setDeliveryKes}
                  />
                  <NumberInput
                    label="Arrives in (minutes)"
                    description="After it is ready"
                    min={5}
                    max={480}
                    allowDecimal={false}
                    value={deliveryMinutes}
                    onChange={setDeliveryMinutes}
                  />
                </Group>
              )}
              <Group grow gap="xs">
                <Button variant="default" onClick={() => setDeclining(true)} disabled={busy}>
                  Can't fill it
                </Button>
                <Button
                  type="submit"
                  loading={busy}
                  disabled={typeof price !== 'number' || price <= 0 || typeof ready !== 'number'}
                >
                  Send offer
                </Button>
              </Group>
            </Stack>
          </form>
        )}
        {card.stage === 'answer' && declining && (
          <Stack gap="xs">
            <TextInput
              label="Why not? (optional)"
              placeholder="Out of stock"
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
            <Group grow gap="xs">
              <Button variant="default" onClick={() => setDeclining(false)} disabled={busy}>
                Go back
              </Button>
              <Button
                color="red"
                loading={busy}
                onClick={() => act('reply', { decline: true, reason }).catch(console.error)}
              >
                Decline
              </Button>
            </Group>
          </Stack>
        )}

        {card.stage !== 'answer' && card.priceKes !== undefined && (
          <Text size="sm">
            You offered KES {card.priceKes.toLocaleString('en-KE')}, ready in {card.readyMinutes ?? 0} min
            {card.deliveryMinutes !== undefined
              ? `; delivery ${card.deliveryKes ? `KES ${card.deliveryKes.toLocaleString('en-KE')}` : 'free'} in ${card.deliveryMinutes} min`
              : ''}
          </Text>
        )}
        {card.stage === 'chosen' && card.holdUntil && (
          <Text size="sm">
            {card.delivery ? 'Send it out' : 'Have it ready'} by {shortTime(card.holdUntil)}. After that the patient can
            choose another chemist.
          </Text>
        )}
        {card.stage === 'delivering' && card.holdUntil && (
          <Text size="sm">Deliver it by {shortTime(card.holdUntil)}.</Text>
        )}
        {card.stage === 'ready' && card.holdUntil && (
          <Text size="sm">The patient has until {shortTime(card.holdUntil)} to collect it.</Text>
        )}
        {held && (
          <Paper bg="var(--mantine-color-green-light)" p="xs">
            <Text size="sm" fw={600}>
              {card.patient?.name ?? 'The patient'}
            </Text>
            {card.patient?.phone && (
              <Anchor size="sm" href={`tel:${card.patient.phone}`}>
                {card.patient.phone}
              </Anchor>
            )}
            {card.delivery && (
              <>
                <Text size="sm">
                  Deliver to: {card.delivery.directions ?? 'the pin on the map'}{' '}
                  <Anchor
                    size="sm"
                    href={`https://www.google.com/maps/dir/?api=1&destination=${card.delivery.position.lat},${card.delivery.position.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Directions
                  </Anchor>
                </Text>
              </>
            )}
            <Text size="xs" c="dimmed">
              {card.delivery
                ? "At the door, ask for the patient's 4-digit code before you hand it over."
                : "Check the patient's ID when they collect."}
            </Text>
          </Paper>
        )}
        {card.stage === 'chosen' && card.delivery && (
          <Button
            loading={busy}
            onClick={() =>
              act('out-for-delivery', {}, 'On the way. Keep this screen open: the patient follows you.').catch(
                console.error
              )
            }
          >
            Out for delivery
          </Button>
        )}
        {card.stage === 'delivering' && (
          <>
            <RiderSharing onPosition={(position) => share(card.id, position)} />
            <Group align="flex-end" gap="xs" wrap="nowrap">
              <TextInput
                label="Patient's code"
                placeholder="4 digits"
                inputMode="numeric"
                maxLength={4}
                value={code}
                onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
                style={{ flex: 1 }}
              />
              <Button
                loading={busy}
                disabled={code.length !== 4}
                onClick={() =>
                  act('delivered', { code }, "Delivered. It is marked dispensed on the patient's record.").catch(
                    console.error
                  )
                }
              >
                Delivered
              </Button>
            </Group>
          </>
        )}
        {card.stage === 'chosen' && !card.delivery && (
          <Button
            loading={busy}
            onClick={() => act('ready', {}, 'My Afiax now shows the patient it is ready.').catch(console.error)}
          >
            It's ready to collect
          </Button>
        )}
        {(card.stage === 'chosen' || card.stage === 'ready') && !card.delivery && (
          <ConfirmButton
            variant={card.stage === 'ready' ? 'filled' : 'default'}
            title="Handed over"
            message={`Record that ${card.patient?.name ?? 'the patient'} collected everything on this prescription? It is then marked dispensed on their record.`}
            onConfirm={() => act('dispensed', {}, 'Recorded as collected.')}
          >
            Handed over
          </ConfirmButton>
        )}
        {held && !givingUp && (
          <Button variant="subtle" color="red" size="xs" onClick={() => setGivingUp(true)}>
            Can't fill it after all
          </Button>
        )}
        {held && givingUp && (
          <Stack gap="xs">
            <TextInput
              label="Why? (the patient sees it)"
              placeholder="Out of stock"
              value={giveUpReason}
              onChange={(e) => setGiveUpReason(e.currentTarget.value)}
            />
            <Group grow gap="xs">
              <Button variant="default" onClick={() => setGivingUp(false)} disabled={busy}>
                Go back
              </Button>
              <Button
                color="red"
                loading={busy}
                onClick={() =>
                  act('withdraw', { reason: giveUpReason }, 'Released. The patient can choose another chemist.').catch(
                    console.error
                  )
                }
              >
                Give it up
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
