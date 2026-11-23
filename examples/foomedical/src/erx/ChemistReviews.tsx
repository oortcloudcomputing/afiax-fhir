// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// A chemist's written reviews (ADR-016 §3b; decision 2026-11-23): shown at once as "Verified
// patient", never with a name. Anyone can report one; three reports hide it until Afiax checks.

import { Alert, Anchor, Button, Divider, Group, Loader, Modal, Rating, Stack, Text, TextInput } from '@mantine/core';
import type { JSX } from 'react';
import { Fragment, useEffect, useState } from 'react';
import type { OfferApi, Review } from './offers-api';

export interface ChemistReviewsProps {
  readonly api: OfferApi;
  /** The chemist whose reviews to show; undefined closes the window. */
  readonly chemist?: { readonly id: string; readonly name: string };
  readonly onClose: () => void;
}

/**
 * The reviews window.
 * @param props - The component props.
 * @returns The window.
 */
export function ChemistReviews(props: ChemistReviewsProps): JSX.Element {
  const { api, chemist, onClose } = props;
  // What was loaded, and for which chemist (a window opened for another chemist shows nothing old)
  const [loaded, setLoaded] = useState<{ chemist: string; reviews?: Review[]; error?: string }>();

  useEffect(() => {
    if (!chemist) {
      return;
    }
    api
      .reviews(chemist.id)
      .then((reviews) => setLoaded({ chemist: chemist.id, reviews }))
      .catch((err: unknown) =>
        setLoaded({ chemist: chemist.id, error: err instanceof Error ? err.message : String(err) })
      );
  }, [api, chemist]);

  const current = loaded?.chemist === chemist?.id ? loaded : undefined;
  const reviews = current?.reviews;
  const error = current?.error;

  return (
    <Modal opened={!!chemist} onClose={onClose} title={`Reviews of ${chemist?.name ?? 'the chemist'}`} centered>
      <Stack gap="sm">
        {!reviews && !error && (
          <Group justify="center" py="md">
            <Loader size="sm" />
          </Group>
        )}
        {error && (
          <Alert color="red" variant="light">
            {error}
          </Alert>
        )}
        {reviews?.length === 0 && <Text size="sm">No written reviews yet.</Text>}
        {reviews?.map((review, i) => (
          <Fragment key={review.id}>
            {i > 0 && <Divider />}
            <ReviewItem api={api} review={review} />
          </Fragment>
        ))}
      </Stack>
    </Modal>
  );
}

function ReviewItem(props: { readonly api: OfferApi; readonly review: Review }): JSX.Element {
  const { api, review } = props;
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function report(): Promise<void> {
    setBusy(true);
    try {
      await api.report(review.id, reason.trim() || undefined);
      setSent(true);
      setReporting(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Stack gap={4} data-testid="review">
      <Group justify="space-between" gap="xs">
        <Rating value={review.stars} readOnly size="xs" />
        <Text size="xs" c="dimmed">
          Verified patient · {new Date(review.at).toLocaleDateString('en-KE', { day: 'numeric', month: 'short' })}
        </Text>
      </Group>
      <Text size="sm">{review.text}</Text>
      {sent && (
        <Text size="xs" c="dimmed">
          Thanks. Afiax will check this review.
        </Text>
      )}
      {!sent && !reporting && (
        <Anchor component="button" type="button" size="xs" c="dimmed" ta="left" onClick={() => setReporting(true)}>
          Report
        </Anchor>
      )}
      {reporting && (
        <Stack gap="xs">
          <TextInput
            size="xs"
            label="What is wrong with it? (optional)"
            placeholder="Rude, untrue, or has private details"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
          />
          <Group grow gap="xs">
            <Button size="xs" variant="default" onClick={() => setReporting(false)} disabled={busy}>
              Go back
            </Button>
            <Button size="xs" color="red" loading={busy} onClick={() => report().catch(console.error)}>
              Report review
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
