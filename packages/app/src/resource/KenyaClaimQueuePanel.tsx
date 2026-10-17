// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  NativeSelect,
  Stack,
  Table,
  Text,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  getKenyaNationalClaimStatusSnapshot,
  getKenyaNationalClaimSubmissionSnapshot,
  normalizeErrorString,
} from '@medplum/core';
import type { Bundle, Claim } from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

type StatusFilter = 'all' | 'queued' | 'in-review' | 'adjudicated' | 'rejected' | 'error';

const STATUS_COLORS: Record<string, string> = {
  submitted: 'blue',
  prepared: 'gray',
  queued: 'yellow',
  'in-review': 'orange',
  adjudicated: 'green',
  rejected: 'red',
  error: 'red',
};

function statusColor(s: string | undefined): string {
  return STATUS_COLORS[s ?? ''] ?? 'gray';
}

interface ClaimRow {
  readonly claim: Claim;
  readonly submissionStatus: string;
  readonly claimState: string | undefined;
  readonly nextState: string | undefined;
  readonly submittedAt: string | undefined;
  readonly bundleId: string | undefined;
}

function buildRows(claims: Claim[]): ClaimRow[] {
  const rows: ClaimRow[] = [];
  for (const claim of claims) {
    const sub = getKenyaNationalClaimSubmissionSnapshot(claim);
    if (!sub) continue;
    const status = getKenyaNationalClaimStatusSnapshot(claim);
    rows.push({
      claim,
      submissionStatus: sub.status ?? 'unknown',
      claimState: status?.claimState ?? sub.nextState,
      nextState: status?.nextState ?? sub.nextState,
      submittedAt: sub.submittedAt,
      bundleId: sub.bundleId,
    });
  }
  return rows;
}

export function KenyaClaimQueuePanel(): JSX.Element {
  const medplum = useMedplum();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState<string | undefined>();
  const [rows, setRows] = useState<ClaimRow[] | undefined>();
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [error, setError] = useState<string | undefined>();

  async function loadClaims(): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      const bundle = (await medplum.search('Claim', { _count: '200', _sort: '-_lastUpdated' })) as Bundle<Claim>;
      const claims = (bundle.entry ?? []).map((e) => e.resource).filter(Boolean) as Claim[];
      setRows(buildRows(claims));
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(false);
    }
  }

  async function refreshStatus(claim: Claim): Promise<void> {
    if (!claim.id) return;
    setRefreshing(claim.id);
    try {
      await medplum.post(`fhir/R4/Claim/${claim.id}/$check-national-claim-status`, {});
      showNotification({ color: 'green', message: `Status refreshed for Claim/${claim.id}` });
      // Reload the rows to reflect updated extension
      await loadClaims();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setRefreshing(undefined);
    }
  }

  const filtered = rows?.filter((r) => {
    if (filter === 'all') return true;
    const sub = r.submissionStatus;
    const state = r.claimState?.toLowerCase() ?? '';
    if (filter === 'queued') return sub === 'submitted' && (state.includes('queue') || state === '');
    if (filter === 'in-review') return state.includes('review') || state.includes('surveillance');
    if (filter === 'adjudicated') return state.includes('approved') || state.includes('payment') || state.includes('complete') || sub === 'adjudicated';
    if (filter === 'rejected') return state.includes('reject') || state.includes('declin');
    if (filter === 'error') return sub === 'error';
    return true;
  });

  return (
    <Stack gap="sm">
      <Title order={3}>Kenya SHA Claim Queue</Title>
      <Text size="sm" c="dimmed">
        Claims with SHA submission snapshots. Use "Refresh Status" to pull the latest payer-side state for a claim.
      </Text>

      <Group>
        <Button onClick={() => loadClaims().catch(console.error)} loading={loading} variant="default">
          {rows ? 'Reload Claims' : 'Load Claims'}
        </Button>
        {rows !== undefined && (
          <NativeSelect
            label="Filter by status"
            data={[
              { value: 'all', label: 'All submitted' },
              { value: 'queued', label: 'Queued / awaiting SHA' },
              { value: 'in-review', label: 'In review / surveillance' },
              { value: 'adjudicated', label: 'Adjudicated / paid' },
              { value: 'rejected', label: 'Rejected / declined' },
              { value: 'error', label: 'Error' },
            ]}
            value={filter}
            onChange={(e) => setFilter(e.currentTarget.value as StatusFilter)}
          />
        )}
      </Group>

      {error && <Alert color="red">{error}</Alert>}

      {loading && (
        <Group gap="xs">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">Loading claims...</Text>
        </Group>
      )}

      {filtered !== undefined && (
        filtered.length === 0 ? (
          <Text size="sm" c="dimmed">No claims match the current filter.</Text>
        ) : (
          <Table striped highlightOnHover withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Claim</Table.Th>
                <Table.Th>Submit status</Table.Th>
                <Table.Th>SHA state</Table.Th>
                <Table.Th>Submitted</Table.Th>
                <Table.Th>Bundle ID</Table.Th>
                <Table.Th>Action</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {filtered.map((row) => (
                <Table.Tr key={row.claim.id}>
                  <Table.Td>
                    <MedplumLink to={`/Claim/${row.claim.id}`}>
                      {row.claim.id}
                    </MedplumLink>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={statusColor(row.submissionStatus)} size="sm">
                      {row.submissionStatus}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    {row.claimState ? (
                      <Badge color={statusColor(row.claimState)} size="sm" variant="outline">
                        {row.claimState}
                      </Badge>
                    ) : (
                      <Text size="xs" c="dimmed">—</Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs">{row.submittedAt ? new Date(row.submittedAt).toLocaleDateString() : '—'}</Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="xs" style={{ fontFamily: 'monospace' }}>
                      {row.bundleId ? `${row.bundleId.slice(0, 8)}…` : '—'}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      loading={refreshing === row.claim.id}
                      disabled={!!refreshing}
                      onClick={() => refreshStatus(row.claim).catch(console.error)}
                    >
                      Refresh
                    </Button>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )
      )}

      {filtered !== undefined && (
        <Text size="xs" c="dimmed">
          {filtered.length} claim{filtered.length === 1 ? '' : 's'} shown
          {rows && filtered.length !== rows.length ? ` (${rows.length} total with SHA snapshots)` : ''}
        </Text>
      )}
    </Stack>
  );
}
