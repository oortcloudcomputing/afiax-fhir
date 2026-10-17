// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  getKenyaErpNextSubmissionSnapshot,
  getKenyaPatientPaymentSnapshot,
  getProjectSettingString,
  normalizeErrorString,
  type KenyaErpNextPaymentEntry,
  type KenyaErpNextSubmissionSnapshot,
  type KenyaPatientPaymentMethod,
  type KenyaPatientPaymentSnapshot,
} from '@medplum/core';
import type { Bundle, Claim, Parameters, ParametersParameter, PaymentNotice } from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PostPaymentResult {
  readonly status?: string;
  readonly method?: string;
  readonly amount?: number;
  readonly currency?: string;
  readonly patientDue?: number;
  readonly message?: string;
  readonly erpNextPaymentEntry?: string;
  readonly checkoutRequestId?: string;
  readonly paymentRequestId?: string;
  readonly paymentUrl?: string;
  readonly customerMessage?: string;
}

interface PushToErpNextResult {
  readonly status?: string;
  readonly invoiceSynced?: boolean;
  readonly paymentsSynced?: number;
  readonly paymentsFailed?: number;
  readonly patientDue?: number;
  readonly message?: string;
}

interface PendingPayment {
  readonly notice: PaymentNotice;
  readonly snap: KenyaPatientPaymentSnapshot;
}

export interface ClaimBillingPanelProps {
  readonly claim: Claim;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getParam(parameters: Parameters | undefined, name: string): ParametersParameter | undefined {
  return parameters?.parameter?.find((p) => p.name === name);
}

function parsePostPaymentResult(params: Parameters | undefined): PostPaymentResult {
  return {
    status: getParam(params, 'status')?.valueCode,
    method: getParam(params, 'method')?.valueCode,
    amount: getParam(params, 'amount')?.valueDecimal,
    currency: getParam(params, 'currency')?.valueCode,
    patientDue: getParam(params, 'patientDue')?.valueDecimal,
    message: getParam(params, 'message')?.valueString,
    erpNextPaymentEntry: getParam(params, 'erpNextPaymentEntry')?.valueString,
    checkoutRequestId: getParam(params, 'checkoutRequestId')?.valueString,
    paymentRequestId: getParam(params, 'paymentRequestId')?.valueString,
    paymentUrl: getParam(params, 'paymentUrl')?.valueString,
    customerMessage: getParam(params, 'customerMessage')?.valueString,
  };
}

function parsePushResult(params: Parameters | undefined): PushToErpNextResult {
  return {
    status: getParam(params, 'status')?.valueCode,
    invoiceSynced: getParam(params, 'invoiceSynced')?.valueBoolean,
    paymentsSynced: getParam(params, 'paymentsSynced')?.valueInteger,
    paymentsFailed: getParam(params, 'paymentsFailed')?.valueInteger,
    patientDue: getParam(params, 'patientDue')?.valueDecimal,
    message: getParam(params, 'message')?.valueString,
  };
}

function fmt(amount: number | undefined, currency: string | undefined): string {
  if (amount === undefined) return '—';
  return `${currency ?? 'KES'} ${amount.toLocaleString()}`;
}

function snapshotStatusBadge(status: string | undefined): JSX.Element {
  const map: Record<string, string> = {
    'invoice-created': 'blue',
    partial: 'yellow',
    'fully-settled': 'green',
    error: 'red',
  };
  if (!status) return <Badge color="gray" variant="outline" size="sm">no snapshot</Badge>;
  return <Badge color={map[status] ?? 'gray'} variant="outline" size="sm">{status}</Badge>;
}

function paymentStatusBadge(status: string | undefined): JSX.Element {
  const map: Record<string, string> = { confirmed: 'green', pending: 'yellow', failed: 'red' };
  return <Badge color={map[status ?? ''] ?? 'gray'} variant="light" size="xs">{status ?? '?'}</Badge>;
}

function methodLabel(m: string): string {
  const labels: Record<string, string> = {
    'sha-claims': 'SHA Claims',
    'private-insurance': 'Private Insurance',
    cash: 'Cash',
    mpesa: 'M-Pesa',
    'mpesa-stk': 'M-Pesa STK',
    'mpesa-manual': 'M-Pesa (manual)',
    'afiax-pay': 'Afiax Pay',
    card: 'Card',
  };
  return labels[m] ?? m;
}

// ---------------------------------------------------------------------------
// Payment entries sub-table
// ---------------------------------------------------------------------------

function PaymentEntriesTable({
  payments,
  currency,
}: {
  payments: KenyaErpNextPaymentEntry[];
  currency: string | undefined;
}): JSX.Element {
  return (
    <Table striped withTableBorder withColumnBorders fz="xs">
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Payer</Table.Th>
          <Table.Th>Mode</Table.Th>
          <Table.Th>Amount</Table.Th>
          <Table.Th>Date</Table.Th>
          <Table.Th>Status</Table.Th>
          <Table.Th>ERPNext entry</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {payments.map((p, i) => (
          <Table.Tr key={i}>
            <Table.Td>{p.payerName}</Table.Td>
            <Table.Td>{methodLabel(p.modeOfPayment)}</Table.Td>
            <Table.Td>{fmt(p.amount, currency ?? p.currency)}</Table.Td>
            <Table.Td>{p.confirmedAt ? new Date(p.confirmedAt).toLocaleDateString() : '—'}</Table.Td>
            <Table.Td>{paymentStatusBadge(p.patientPaymentStatus ?? 'confirmed')}</Table.Td>
            <Table.Td style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.paymentEntryName}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

// ---------------------------------------------------------------------------
// Pending payments section
// ---------------------------------------------------------------------------

function PendingPaymentsSection({
  pending,
  isPolling,
  onRefresh,
}: {
  pending: PendingPayment[];
  isPolling: boolean;
  onRefresh: () => void;
}): JSX.Element {
  return (
    <Alert color="yellow" variant="light" p="xs">
      <Stack gap="xs">
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {pending.length} payment{pending.length !== 1 ? 's' : ''} awaiting confirmation
            </Text>
            {isPolling && <Loader size="xs" />}
          </Group>
          <Button size="xs" variant="subtle" onClick={onRefresh} loading={isPolling}>
            {isPolling ? 'Checking…' : 'Check now'}
          </Button>
        </Group>

        {pending.map(({ notice, snap }) => (
          <Group key={notice.id} gap="sm" style={{ fontSize: 13 }}>
            <Badge color="yellow" size="sm" variant="filled">pending</Badge>
            <Text size="xs" fw={500}>{methodLabel(snap.method ?? '')}</Text>
            <Text size="xs">{fmt(snap.amount, snap.currency)}</Text>
            {snap.gatewayReference && (
              <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace' }}>
                {snap.gatewayReference.slice(0, 24)}{snap.gatewayReference.length > 24 ? '…' : ''}
              </Text>
            )}
            {snap.phone && <Text size="xs" c="dimmed">{snap.phone}</Text>}
          </Group>
        ))}

        <Text size="xs" c="dimmed">
          {isPolling
            ? 'Polling every 10 s — will stop automatically once confirmed or failed.'
            : 'Click "Check now" to refresh, or wait — the page updates automatically when the gateway callback arrives.'}
        </Text>
      </Stack>
    </Alert>
  );
}

// ---------------------------------------------------------------------------
// Post Payment modal
// ---------------------------------------------------------------------------

interface PostPaymentModalProps {
  readonly claimId: string;
  readonly snapshot: KenyaErpNextSubmissionSnapshot | undefined;
  readonly opened: boolean;
  readonly onClose: () => void;
  readonly onSuccess: (result: PostPaymentResult) => void;
}

function PostPaymentModal({ claimId, snapshot, opened, onClose, onSuccess }: PostPaymentModalProps): JSX.Element {
  const medplum = useMedplum();
  const [method, setMethod] = useState<KenyaPatientPaymentMethod>('cash');
  const [amount, setAmount] = useState<number | string>(snapshot?.patientDue ?? 0);
  const [currency, setCurrency] = useState<string>(snapshot?.currency ?? 'KES');
  const [phone, setPhone] = useState('');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const needsPhone = method === 'mpesa-stk' || method === 'afiax-pay';
  const needsRef = method === 'cash' || method === 'card' || method === 'mpesa-manual';

  async function handleSubmit(): Promise<void> {
    setLoading(true);
    setError(undefined);
    try {
      const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
      if (!numAmount || numAmount <= 0) {
        setError('Amount must be a positive number.');
        return;
      }
      const body: Parameters = {
        resourceType: 'Parameters',
        parameter: [
          { name: 'method', valueCode: method },
          { name: 'amount', valueDecimal: numAmount },
          { name: 'currency', valueCode: currency || 'KES' },
          ...(phone ? [{ name: 'phone', valueString: phone } as ParametersParameter] : []),
          ...(transactionRef ? [{ name: 'transactionRef', valueString: transactionRef } as ParametersParameter] : []),
          ...(notes ? [{ name: 'notes', valueString: notes } as ParametersParameter] : []),
        ],
      };
      const params = (await medplum.post(
        medplum.fhirUrl('Claim', claimId, '$post-patient-payment'),
        body
      )) as Parameters;
      const result = parsePostPaymentResult(params);
      const isAsync = result.status === 'pending';
      const color = result.status === 'error' ? 'red' : isAsync ? 'blue' : 'green';
      showNotification({
        color,
        message: result.message ?? `Payment ${result.status ?? 'processed'}`,
        autoClose: result.status === 'error' ? false : 5000,
      });
      onSuccess(result);
      if (result.status !== 'error') onClose();
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal opened={opened} onClose={onClose} title="Post Patient Payment" size="sm">
      <Stack gap="sm">
        {error && <Alert color="red">{error}</Alert>}
        <Select
          label="Payment method"
          value={method}
          onChange={(v) => v && setMethod(v as KenyaPatientPaymentMethod)}
          data={[
            { value: 'cash', label: 'Cash' },
            { value: 'card', label: 'Card' },
            { value: 'mpesa-manual', label: 'M-Pesa (manual / paybill receipt)' },
            { value: 'mpesa-stk', label: 'M-Pesa STK push (automated prompt)' },
            { value: 'afiax-pay', label: 'Afiax Pay (payment link)' },
          ]}
          required
        />
        <NumberInput
          label="Amount"
          value={amount}
          onChange={setAmount}
          min={0.01}
          decimalScale={2}
          required
        />
        <TextInput
          label="Currency"
          value={currency}
          onChange={(e) => setCurrency(e.currentTarget.value)}
          placeholder="KES"
        />
        {needsPhone && (
          <TextInput
            label="Phone number"
            placeholder="07XXXXXXXX or 2547XXXXXXXX"
            value={phone}
            onChange={(e) => setPhone(e.currentTarget.value)}
            required
          />
        )}
        {needsRef && (
          <TextInput
            label="Transaction reference"
            placeholder="Receipt number / authorisation code"
            value={transactionRef}
            onChange={(e) => setTransactionRef(e.currentTarget.value)}
          />
        )}
        <TextInput
          label="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.currentTarget.value)}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button onClick={() => handleSubmit().catch(console.error)} loading={loading}>
            {method === 'mpesa-stk'
              ? 'Send STK Push'
              : method === 'afiax-pay'
                ? 'Send Payment Link'
                : 'Confirm Payment'}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

// Max polls before giving up: 30 × 10 s = 5 minutes
const MAX_POLLS = 30;
const POLL_INTERVAL_MS = 10_000;

export function ClaimBillingPanel({ claim }: ClaimBillingPanelProps): JSX.Element | null {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const countryPack = getProjectSettingString(project, 'countryPack');
  if (!claim.id || countryPack !== 'kenya') return null;

  const claimId = claim.id;

  const [pushing, setPushing] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<KenyaErpNextSubmissionSnapshot | undefined>(
    () => getKenyaErpNextSubmissionSnapshot(claim) ?? undefined
  );
  const [pushResult, setPushResult] = useState<PushToErpNextResult | undefined>();
  const [pushError, setPushError] = useState<string | undefined>();
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [isPolling, setIsPolling] = useState(false);
  const pollCountRef = useRef(0);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currency = snapshot?.currency ?? 'KES';

  // Fetch pending PaymentNotices for this claim
  const fetchPendingPayments = useCallback(async (): Promise<PendingPayment[]> => {
    const bundle = (await medplum.search('PaymentNotice', {
      request: `Claim/${claimId}`,
      _count: '20',
    })) as Bundle<PaymentNotice>;
    const notices = (bundle.entry ?? []).map((e) => e.resource).filter(Boolean) as PaymentNotice[];
    const pending: PendingPayment[] = [];
    for (const n of notices) {
      const snap = getKenyaPatientPaymentSnapshot(n);
      if (snap?.paymentStatus === 'pending') pending.push({ notice: n, snap });
    }
    setPendingPayments(pending);
    return pending;
  }, [medplum, claimId]);

  // Re-read Claim to pick up snapshot changes written by callback handlers
  const refreshClaimSnapshot = useCallback(async (): Promise<void> => {
    const updated = (await medplum.readResource('Claim', claimId)) as Claim;
    const newSnap = getKenyaErpNextSubmissionSnapshot(updated) ?? undefined;
    if (newSnap) setSnapshot(newSnap);
  }, [medplum, claimId]);

  // Combined refresh (both PaymentNotices and Claim snapshot)
  const refresh = useCallback(async (): Promise<PendingPayment[]> => {
    const [pending] = await Promise.all([fetchPendingPayments(), refreshClaimSnapshot()]);
    return pending;
  }, [fetchPendingPayments, refreshClaimSnapshot]);

  // Polling effect — runs while isPolling is true
  useEffect(() => {
    if (!isPolling) return;
    pollCountRef.current = 0;

    const tick = async (): Promise<void> => {
      pollCountRef.current++;
      if (pollCountRef.current > MAX_POLLS) {
        setIsPolling(false);
        return;
      }
      const pending = await refresh();
      if (pending.length === 0) {
        setIsPolling(false);
        showNotification({ color: 'green', message: 'Payment confirmed — billing snapshot updated.', autoClose: 5000 });
      }
    };

    pollIntervalRef.current = setInterval(() => {
      tick().catch(console.error);
    }, POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, [isPolling, refresh]);

  function handlePaymentSuccess(result: PostPaymentResult): void {
    if (result.patientDue !== undefined && snapshot) {
      setSnapshot({ ...snapshot, patientDue: result.patientDue });
    }
    if (result.status === 'pending') {
      // Kick off polling — first fetch immediately, then every 10s
      fetchPendingPayments().catch(console.error);
      setIsPolling(true);
    }
  }

  function handleManualRefresh(): void {
    setIsPolling(false); // pause interval while we do a one-shot refresh
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    refresh()
      .then((pending) => {
        if (pending.length > 0) setIsPolling(true); // resume if still pending
        else showNotification({ color: 'green', message: 'No pending payments — billing snapshot updated.', autoClose: 4000 });
      })
      .catch(console.error);
  }

  async function handlePushToErpNext(): Promise<void> {
    setPushing(true);
    setPushError(undefined);
    try {
      const params = (await medplum.post(
        medplum.fhirUrl('Claim', claimId, '$push-to-erpnext'),
        {}
      )) as Parameters;
      const result = parsePushResult(params);
      setPushResult(result);
      // Update snapshot after push (invoice / payments may have been created)
      await refreshClaimSnapshot();
      const color =
        result.status === 'error' || (result.paymentsFailed ?? 0) > 0 ? 'yellow' : 'green';
      showNotification({ color, message: result.message ?? `Sync: ${result.status}`, autoClose: 5000 });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setPushError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally {
      setPushing(false);
    }
  }

  const displayPatientDue =
    pushResult?.patientDue ?? snapshot?.patientDue;

  return (
    <>
      <PostPaymentModal
        claimId={claimId}
        snapshot={snapshot}
        opened={payModalOpen}
        onClose={() => setPayModalOpen(false)}
        onSuccess={handlePaymentSuccess}
      />

      <Stack gap="sm" mb="md">
        {/* Header */}
        <Group justify="space-between" align="center">
          <Group gap="xs">
            <Title order={3}>Kenya Billing</Title>
            {snapshotStatusBadge(snapshot?.status)}
          </Group>
          <Group>
            <Button
              variant="default"
              onClick={() => handlePushToErpNext().catch(console.error)}
              loading={pushing}
            >
              Sync to ERPNext
            </Button>
            <Button onClick={() => setPayModalOpen(true)}>
              Post Patient Payment
            </Button>
          </Group>
        </Group>

        {pushError && <Alert color="red">{pushError}</Alert>}

        {/* ERPNext push result banner */}
        {pushResult && (
          <Alert
            color={
              pushResult.status === 'error' || (pushResult.paymentsFailed ?? 0) > 0
                ? 'yellow'
                : 'green'
            }
            variant="light"
          >
            {pushResult.message ?? 'Sync complete.'}
            {(pushResult.paymentsSynced ?? 0) > 0 && ` Payments synced: ${pushResult.paymentsSynced}.`}
            {(pushResult.paymentsFailed ?? 0) > 0 && ` Failed: ${pushResult.paymentsFailed}.`}
          </Alert>
        )}

        {/* Pending payments — shown whenever there are unconfirmed async payments */}
        {pendingPayments.length > 0 && (
          <PendingPaymentsSection
            pending={pendingPayments}
            isPolling={isPolling}
            onRefresh={handleManualRefresh}
          />
        )}

        {/* Billing summary */}
        {snapshot ? (
          <>
            <Divider label="Billing summary" labelPosition="left" />
            <DescriptionList>
              {snapshot.invoiceName && (
                <DescriptionListEntry term="ERPNext invoice">
                  <Text size="sm" style={{ fontFamily: 'monospace' }}>{snapshot.invoiceName}</Text>
                </DescriptionListEntry>
              )}
              {snapshot.invoiceTotal !== undefined && (
                <DescriptionListEntry term="Invoice total">
                  {fmt(snapshot.invoiceTotal, currency)}
                </DescriptionListEntry>
              )}
              {snapshot.totalConfirmed !== undefined && (
                <DescriptionListEntry term="Confirmed">
                  {fmt(snapshot.totalConfirmed, currency)}
                </DescriptionListEntry>
              )}
              {displayPatientDue !== undefined && (
                <DescriptionListEntry term="Patient due">
                  <Text
                    size="sm"
                    fw={displayPatientDue > 0 ? 700 : undefined}
                    c={displayPatientDue === 0 ? 'green' : displayPatientDue > 0 ? 'orange' : undefined}
                  >
                    {displayPatientDue === 0
                      ? `${currency} 0 — fully settled`
                      : fmt(displayPatientDue, currency)}
                  </Text>
                </DescriptionListEntry>
              )}
              {snapshot.syncedAt && (
                <DescriptionListEntry term="Last synced">
                  {new Date(snapshot.syncedAt).toLocaleString()}
                </DescriptionListEntry>
              )}
            </DescriptionList>

            {(snapshot.payments?.length ?? 0) > 0 ? (
              <>
                <Divider
                  label={`Payment entries (${snapshot.payments!.length})`}
                  labelPosition="left"
                />
                <PaymentEntriesTable payments={snapshot.payments!} currency={currency} />
              </>
            ) : (
              <Text size="sm" c="dimmed">No payment entries recorded yet.</Text>
            )}
          </>
        ) : (
          <Alert color="gray" variant="light">
            No ERPNext billing snapshot. Use <strong>Sync to ERPNext</strong> to create the Sales
            Invoice and push any existing payments.
          </Alert>
        )}
      </Stack>
    </>
  );
}
