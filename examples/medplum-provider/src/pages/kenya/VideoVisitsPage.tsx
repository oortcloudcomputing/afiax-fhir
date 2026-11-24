// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Card, Group, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Document } from '@medplum/react';
import { IconVideo } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { useMarketplace } from '../../components/kenya/marketplaceApi';

interface Visit {
  id: string;
  start: string;
  end?: string;
  status: string;
  patient: string;
  canJoin: boolean;
}

/**
 * The practitioner's video visits booked in My Afiax (ADR-018 §B): from 2 hours ago to 24 hours
 * ahead. Joining opens the visit in a new tab (it asks for the camera and microphone there).
 * @returns The page.
 */
export function VideoVisitsPage(): JSX.Element {
  const { call, servicesUrl } = useMarketplace();
  const [visits, setVisits] = useState<Visit[]>();
  const [joining, setJoining] = useState<string>();

  const load = useCallback(() => call<Visit[]>('GET', 'my-video-visits'), [call]);

  useEffect(() => {
    if (!servicesUrl) {
      return undefined;
    }
    let cancelled = false;
    const refresh = (): void => {
      load()
        .then((v) => {
          if (!cancelled) {
            setVisits(v);
          }
        })
        .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
    };
    refresh();
    // The Join button opens 15 minutes before each visit
    const timer = setInterval(refresh, 60_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load, servicesUrl]);

  async function join(v: Visit): Promise<void> {
    // Open the tab now (browsers block tabs opened after an await), then send it to the visit
    const tab = window.open('about:blank', '_blank');
    setJoining(v.id);
    try {
      const { url } = await call<{ url: string }>('POST', `visits/${v.id}/video`);
      if (tab) {
        tab.opener = null;
        tab.location.href = url;
      } else {
        window.location.href = url;
      }
    } catch (err) {
      tab?.close();
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setJoining(undefined);
    }
  }

  if (!servicesUrl) {
    return (
      <Document>
        <Alert color="yellow">This Afiax Provider has no afiax-services address (MEDPLUM_AFIAX_SERVICES_URL).</Alert>
      </Document>
    );
  }

  return (
    <Document>
      <Title order={2}>Video visits</Title>
      <Text c="dimmed" mb="md">
        Your video visits booked in My Afiax. You can join 15 minutes before the start.
      </Text>
      {visits?.length === 0 ? <Text c="dimmed">No video visits in the next 24 hours.</Text> : null}
      <Stack>
        {(visits ?? []).map((v) => (
          <Card key={v.id} withBorder padding="md">
            <Group justify="space-between">
              <div>
                <Text fw={700}>{v.patient}</Text>
                <Text size="sm" c="dimmed">
                  {new Date(v.start).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {v.end ? ` – ${new Date(v.end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : ''}
                </Text>
              </div>
              <Group>
                <Badge variant="light">{v.status}</Badge>
                <Button leftSection={<IconVideo size={16} />} disabled={!v.canJoin} loading={joining === v.id} onClick={() => join(v)}>
                  {v.canJoin ? 'Join' : 'Not open yet'}
                </Button>
              </Group>
            </Group>
          </Card>
        ))}
      </Stack>
    </Document>
  );
}
