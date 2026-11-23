// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// A chemist's own written reviews in the Afiax Prescription Network (ADR-016 §3b; decision
// 2026-11-23): shown to patients at once as "Verified patient". The chemist can report one that is
// rude, untrue or has private details; three reports from different people hide it until Afiax
// checks.

import { Anchor, Button, Group, Paper, Rating, Stack, Text, TextInput, Title } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

interface Review {
  readonly id: string;
  readonly stars: number;
  readonly text: string;
  readonly at: string;
}

export interface ChemistOwnReviewsProps {
  readonly servicesUrl: string;
  /** The chemist's Organization in the network (the owner of its offer Tasks). */
  readonly organizationId: string;
  readonly fetchFn: typeof fetch;
}

/**
 * The chemist's latest reviews, with Report.
 * @param props - The component props.
 * @returns The section, or nothing before the first review.
 */
export function ChemistOwnReviews(props: ChemistOwnReviewsProps): JSX.Element | null {
  const { servicesUrl, organizationId, fetchFn } = props;
  const medplum = useMedplum();
  const [reviews, setReviews] = useState<Review[]>();
  const [error, setError] = useState<string>();
  const base = `${servicesUrl.replace(/\/$/, '')}/erx`;
  const headers = { Authorization: `Bearer ${medplum.getAccessToken()}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    fetchFn(`${base}/chemists/${encodeURIComponent(organizationId)}/reviews`, { headers })
      .then(async (r) =>
        r.ok ? ((await r.json()) as Review[]) : Promise.reject(new Error(`Afiax services answered ${r.status}`))
      )
      .then(setReviews)
      .catch((err: unknown) => setError(normalizeErrorString(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, organizationId, fetchFn]);

  if (error) {
    return (
      <Text size="xs" c="dimmed">
        Your reviews could not be loaded: {error}
      </Text>
    );
  }
  if (!reviews?.length) {
    return null;
  }
  const report = async (id: string, reason: string): Promise<void> => {
    const r = await fetchFn(`${base}/reviews/${encodeURIComponent(id)}/report`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ reason: reason.trim() || undefined }),
    });
    if (!r.ok) {
      throw new Error(`Afiax services answered ${r.status}`);
    }
  };
  return (
    <Stack gap="xs">
      <Title order={5}>Your reviews</Title>
      <Text size="xs" c="dimmed">
        What patients wrote after collecting. Other patients see these when they compare offers.
      </Text>
      {reviews.map((review) => (
        <OwnReview key={review.id} review={review} onReport={(reason) => report(review.id, reason)} />
      ))}
    </Stack>
  );
}

function OwnReview(props: {
  readonly review: Review;
  readonly onReport: (reason: string) => Promise<void>;
}): JSX.Element {
  const { review, onReport } = props;
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent' | 'failed'>('idle');
  return (
    <Paper withBorder p="sm" data-testid="own-review">
      <Stack gap={4}>
        <Group justify="space-between" gap="xs">
          <Rating value={review.stars} readOnly size="xs" />
          <Text size="xs" c="dimmed">
            {new Date(review.at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
          </Text>
        </Group>
        <Text size="sm">{review.text}</Text>
        {state === 'sent' && (
          <Text size="xs" c="dimmed">
            Reported. Afiax will check it.
          </Text>
        )}
        {state === 'failed' && (
          <Text size="xs" c="red">
            The report could not be sent. Try again.
          </Text>
        )}
        {state !== 'sent' && !reporting && (
          <Anchor component="button" type="button" size="xs" c="dimmed" ta="left" onClick={() => setReporting(true)}>
            Report
          </Anchor>
        )}
        {reporting && (
          <Stack gap="xs">
            <TextInput
              size="xs"
              label="What is wrong with it?"
              placeholder="Untrue, rude, or has private details"
              value={reason}
              onChange={(e) => setReason(e.currentTarget.value)}
            />
            <Group grow gap="xs">
              <Button size="xs" variant="default" onClick={() => setReporting(false)} disabled={state === 'busy'}>
                Go back
              </Button>
              <Button
                size="xs"
                color="red"
                loading={state === 'busy'}
                onClick={() => {
                  setState('busy');
                  onReport(reason)
                    .then(() => {
                      setState('sent');
                      setReporting(false);
                    })
                    .catch(() => setState('failed'));
                }}
              >
                Report review
              </Button>
            </Group>
          </Stack>
        )}
      </Stack>
    </Paper>
  );
}
