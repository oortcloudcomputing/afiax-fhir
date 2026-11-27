// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The pharmacy workspace's Dispense tab: one patient's medicines, checked before they are handed
// over (user decisions 2026-11-27).
//
//   - Safety: the prescribing rules run again against the record as it stands now
//     ($kenya-dispense-check). A high-severity alert the prescriber already overrode shows their
//     reason; any other needs the pharmacist's reason, recorded on the server with the dispense.
//   - Stock: on hand in the dispensary and the batch ERPNext will issue (earliest expiry first),
//     from afiax-services. Out of stock, not enough in date, or not stocked blocks that medicine;
//     when stock cannot be checked, the pharmacist is told and may go ahead.
//   - Quantity (less than what is left records a part fill) and a note.
//   - Labels: printed from the browser after dispensing, sized for the label roll.

import {
  Alert,
  Badge,
  Button,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  calculateAgeString,
  formatHumanName,
  getKenyaPrescriptionCode,
  KenyaHealthProductSystem,
  normalizeErrorString,
} from '@medplum/core';
import type { HumanName, MedicationRequest, Parameters, ParametersParameter, Patient } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmButton } from '../common/ConfirmButton';
import { KenyaPrescriptionLookup } from '../queues/KenyaPrescriptionLookup';
import type { DispenseLabel, DispenseLabelSize } from './dispense-label';
import { DispenseLabelSizes, printDispenseLabels } from './dispense-label';

const LabelSizeKey = 'afiax.pharmacy.labelSize';

export interface DispenseAlert {
  readonly id: string;
  readonly severity: string;
  readonly category: string;
  readonly title: string;
  readonly detail: string;
  readonly recommendation: string;
  readonly overridden?: string;
}

export interface DispenseCheck {
  readonly state: string;
  readonly reason?: string;
  readonly prescribed?: number;
  readonly dispensed: number;
  readonly remaining?: number;
  readonly alerts: readonly DispenseAlert[];
}

/** One medicine's stock, as afiax-services reports it (GET /pharmacy/stock). */
export interface DispenseStock {
  readonly code: string;
  readonly state: 'in-stock' | 'not-enough' | 'expired' | 'out-of-stock' | 'not-stocked';
  readonly itemCode?: string;
  readonly itemName?: string;
  readonly uom?: string;
  readonly onHand: number;
  readonly usable: number;
  readonly batch?: { readonly batchNo: string; readonly expiry?: string; readonly qty: number };
  readonly message: string;
}

/** A prescription being dispensed, with its check. */
export interface DispenseLine {
  readonly prescription: MedicationRequest;
  readonly patient?: Patient;
  readonly check: DispenseCheck;
}

/** What the pharmacist entered for one medicine. */
export interface DispenseEntry {
  quantity: number | string;
  reason: string;
  note: string;
}

export interface KenyaPharmacyDispenseProps {
  /** The prescriptions to dispense (one patient's medicines); none shows the code lookup. */
  readonly prescriptionIds: readonly string[];
  /** afiax-services, for stock; without it stock is not checked. */
  readonly servicesUrl?: string;
  readonly fetchFn?: typeof fetch;
  /** Open prescriptions found by code. */
  readonly onPick: (prescriptionIds: string[]) => void;
  /** Back to Today. */
  readonly onDone?: () => void;
}

/**
 * The Dispense tab.
 * @param props - The component props.
 * @returns The tab.
 */
export function KenyaPharmacyDispense(props: KenyaPharmacyDispenseProps): JSX.Element {
  const { prescriptionIds, servicesUrl, onPick, onDone } = props;
  const fetchFn = props.fetchFn ?? fetch;
  const medplum = useMedplum();
  const [lines, setLines] = useState<DispenseLine[]>();
  const [error, setError] = useState<string>();
  const [entries, setEntries] = useState<Record<string, DispenseEntry>>({});
  const [stock, setStock] = useState<Record<string, DispenseStock>>();
  const [stockError, setStockError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [labels, setLabels] = useState<DispenseLabel[]>([]);
  const [labelSize, setLabelSize] = useState<DispenseLabelSize>(
    () => (localStorage.getItem(LabelSizeKey) as DispenseLabelSize | null) ?? '100x50'
  );
  const idsKey = prescriptionIds.join(',');

  const load = useCallback(async (): Promise<DispenseLine[]> => {
    const ids = idsKey ? idsKey.split(',') : [];
    const loaded = await Promise.all(
      ids.map(async (id): Promise<DispenseLine> => {
        const prescription = await medplum.readResource('MedicationRequest', id, { cache: 'no-cache' });
        const [patient, check] = await Promise.all([
          prescription.subject?.reference?.startsWith('Patient/')
            ? medplum.readReference(prescription.subject as { reference: string }).catch(() => undefined)
            : Promise.resolve(undefined),
          medplum.get<Parameters>(medplum.fhirUrl('MedicationRequest', id, '$kenya-dispense-check'), {
            cache: 'no-cache',
          }),
        ]);
        return { prescription, patient: patient as Patient | undefined, check: parseCheck(check) };
      })
    );
    setLines(loaded);
    return loaded;
  }, [medplum, idsKey]);

  useEffect(() => {
    setLines(undefined);
    setError(undefined);
    setLabels([]);
    setStock(undefined);
    setStockError(undefined);
    if (!idsKey) {
      return;
    }
    load()
      .then((loaded) => {
        const next: Record<string, DispenseEntry> = {};
        for (const line of loaded) {
          next[line.prescription.id as string] = { quantity: line.check.remaining ?? '', reason: '', note: '' };
        }
        setEntries(next);
        loadStock(loaded);
      })
      .catch((err) => setError(normalizeErrorString(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load, idsKey]);

  function loadStock(loaded: readonly DispenseLine[]): void {
    const asked = loaded
      .filter((l) => l.check.state === 'valid')
      .map((l) => ({ line: l, code: hptCode(l.prescription) }))
      .filter((a): a is { line: DispenseLine; code: string } => !!a.code);
    if (!asked.length) {
      setStock({});
      return;
    }
    if (!servicesUrl) {
      setStockError('Stock is not connected here: check the shelf before handing over.');
      setStock({});
      return;
    }
    const items = asked.map((a) => `${a.code}:${a.line.check.remaining ?? 1}`).join(',');
    fetchFn(`${servicesUrl.replace(/\/$/, '')}/pharmacy/stock?items=${encodeURIComponent(items)}`, {
      headers: { Authorization: `Bearer ${medplum.getAccessToken()}` },
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as { items?: DispenseStock[]; message?: string };
        if (!res.ok || !body.items) {
          throw new Error(body.message ?? `Stock could not be checked (${res.status})`);
        }
        const byId: Record<string, DispenseStock> = {};
        asked.forEach((a, i) => {
          const found = body.items?.[i];
          if (found) {
            byId[a.line.prescription.id as string] = found;
          }
        });
        setStock(byId);
      })
      .catch((err) => {
        setStockError(`${normalizeErrorString(err)}. Check the shelf before handing over.`);
        setStock({});
      });
  }

  if (!idsKey) {
    return (
      <Stack gap="md">
        <Title order={2}>Dispense</Title>
        <Text c="dimmed">
          Open a patient from Today, or find a prescription by its code (typed, or scanned from the printed
          prescription).
        </Text>
        <KenyaPrescriptionLookup onOpen={(p) => onPick([p.id as string])} />
      </Stack>
    );
  }
  if (error) {
    return (
      <Alert color="red" variant="light">
        {error}
      </Alert>
    );
  }
  if (!lines) {
    return <Text c="dimmed">Loading…</Text>;
  }

  const patient = lines.find((l) => l.patient)?.patient;
  const patientText = patient ? patientName(patient) : 'the patient';
  const ready = lines.filter((l) => lineProblem(l, entries[l.prescription.id as string], stock) === undefined);
  const blocked = lines.length - ready.length;

  const update = (id: string, change: Partial<DispenseEntry>): void =>
    setEntries((prev) => ({ ...prev, [id]: { ...(prev[id]), ...change } }));

  async function dispenseAll(): Promise<void> {
    setBusy(true);
    const printed: DispenseLabel[] = [];
    const now = new Date().toISOString();
    const pharmacy = medplum.getActiveLogin()?.project?.display ?? 'Pharmacy';
    const profile = medplum.getProfile();
    const dispensedBy = profile && 'name' in profile ? formatHumanName(profile.name?.[0] as HumanName) : undefined;
    try {
      // One at a time: the first refusal stops the rest
      for (const line of ready) {
        const id = line.prescription.id as string;
        const entry = entries[id];
        const parameter: ParametersParameter[] = [];
        if (entry.quantity !== '') {
          parameter.push({ name: 'quantity', valueDecimal: Number(entry.quantity) });
        }
        if (entry.note.trim()) {
          parameter.push({ name: 'note', valueString: entry.note.trim() });
        }
        if (entry.reason.trim()) {
          parameter.push({ name: 'safetyOverride', valueString: entry.reason.trim() });
        }
        await medplum.post(medplum.fhirUrl('MedicationRequest', id, '$kenya-dispense'), {
          resourceType: 'Parameters',
          parameter,
        });
        const unit = line.prescription.dispenseRequest?.quantity?.unit;
        printed.push({
          pharmacy,
          patient: patientText,
          medicine: medicineName(line.prescription),
          quantity: `${entry.quantity === '' ? (line.check.remaining ?? '') : entry.quantity}${unit ? ' ' + unit : ''}`.trim(),
          directions: line.prescription.dosageInstruction?.[0]?.text,
          date: now,
          prescriptionCode: getKenyaPrescriptionCode(line.prescription),
          dispensedBy,
        });
      }
      showNotification({
        color: 'green',
        message: printed.length > 1 ? `Dispensed ${printed.length} medicines` : 'Dispensed',
      });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setLabels(printed);
      setBusy(false);
      load()
        .then((loaded) => loadStock(loaded))
        .catch(console.error);
    }
  }

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={2}>Dispense</Title>
          <Text>
            For <strong>{patientText}</strong>
            {patient && describePatient(patient) ? ` · ${describePatient(patient)}` : ''}
          </Text>
        </div>
        <Group gap="xs">
          <Button variant="default" size="xs" onClick={() => onPick([])}>
            Find another prescription
          </Button>
          {onDone && (
            <Button variant="default" size="xs" onClick={onDone}>
              Back to Today
            </Button>
          )}
        </Group>
      </Group>

      {stockError && (
        <Alert color="yellow" variant="light" data-testid="dispense-stock-error">
          {stockError}
        </Alert>
      )}

      {lines.map((line) => {
        const id = line.prescription.id as string;
        return (
          <DispenseLineCard
            key={id}
            line={line}
            entry={entries[id] ?? { quantity: '', reason: '', note: '' }}
            stock={stock?.[id]}
            stockLoading={!stock}
            problem={lineProblem(line, entries[id], stock)}
            onChange={(change) => update(id, change)}
          />
        );
      })}

      {labels.length > 0 && (
        <Paper withBorder p="md" data-testid="dispense-labels">
          <Group justify="space-between" align="flex-end">
            <Text>
              {labels.length > 1 ? `${labels.length} labels` : 'Label'} ready for {patientText}.
            </Text>
            <Group gap="xs" align="flex-end">
              <Select
                label="Print on"
                data={DispenseLabelSizes.map((s) => ({ value: s.value, label: s.label }))}
                value={labelSize}
                allowDeselect={false}
                onChange={(value) => {
                  const size = (value ?? '100x50') as DispenseLabelSize;
                  setLabelSize(size);
                  localStorage.setItem(LabelSizeKey, size);
                }}
                w={190}
              />
              <Button onClick={() => printDispenseLabels(labels, labelSize)}>Print labels</Button>
            </Group>
          </Group>
        </Paper>
      )}

      <Group justify="flex-end" gap="sm">
        {blocked > 0 && ready.length > 0 && (
          <Text size="sm" c="dimmed">
            {blocked} {blocked > 1 ? 'medicines' : 'medicine'} cannot be dispensed now and will be left.
          </Text>
        )}
        <ConfirmButton
          title="Dispense"
          confirmLabel="Dispense"
          loading={busy}
          disabled={ready.length === 0 || busy}
          message={`Record that ${ready.map((l) => medicineName(l.prescription)).join(', ')} ${
            ready.length > 1 ? 'were' : 'was'
          } handed to ${patientText}? This cannot be undone from here.`}
          onConfirm={dispenseAll}
        >
          {ready.length > 1 ? `Dispense ${ready.length} medicines` : 'Dispense'}
        </ConfirmButton>
      </Group>
    </Stack>
  );
}

interface DispenseLineCardProps {
  readonly line: DispenseLine;
  readonly entry: DispenseEntry;
  readonly stock?: DispenseStock;
  readonly stockLoading: boolean;
  readonly problem?: string;
  readonly onChange: (change: Partial<DispenseEntry>) => void;
}

function DispenseLineCard(props: DispenseLineCardProps): JSX.Element {
  const { line, entry, stock, stockLoading, problem, onChange } = props;
  const { prescription, check } = line;
  const valid = check.state === 'valid';
  const unresolved = check.alerts.filter((a) => a.severity === 'high' && !a.overridden);
  const unit = prescription.dispenseRequest?.quantity?.unit;

  return (
    <Paper withBorder p="md" data-testid="dispense-line">
      <Stack gap="sm">
        <Group justify="space-between" wrap="wrap">
          <div>
            <Text fw={600}>{medicineName(prescription)}</Text>
            {prescription.dosageInstruction?.[0]?.text && <Text size="sm">{prescription.dosageInstruction[0].text}</Text>}
            <Text size="xs" c="dimmed">
              {check.prescribed !== undefined ? `Prescribed ${check.prescribed}${unit ? ' ' + unit : ''}` : 'No quantity'}
              {` · dispensed ${check.dispensed}`}
              {check.remaining !== undefined ? ` · ${check.remaining} left` : ''}
              {getKenyaPrescriptionCode(prescription) ? ` · ${getKenyaPrescriptionCode(prescription)}` : ''}
            </Text>
          </div>
          <Badge color={problem ? 'gray' : 'green'}>{problem ? 'Cannot dispense yet' : 'Ready'}</Badge>
        </Group>

        {!valid && check.reason && (
          <Alert color="orange" variant="light">
            {check.reason}
          </Alert>
        )}

        {check.alerts.map((alert) => (
          <Alert
            key={alert.id}
            color={alert.severity === 'high' ? 'red' : 'yellow'}
            variant="light"
            title={alert.title}
            data-testid="dispense-alert"
          >
            <Text size="sm">{alert.detail}</Text>
            <Text size="sm">{alert.recommendation}</Text>
            {alert.overridden && (
              <Text size="sm" fw={500} mt={4}>
                {alert.overridden}
              </Text>
            )}
          </Alert>
        ))}

        {valid && (
          <StockLine stock={stock} loading={stockLoading} quantity={entry.quantity} code={hptCode(prescription)} />
        )}

        {valid && (
          <Group align="flex-start" gap="sm" wrap="wrap">
            <NumberInput
              label="Quantity to hand over now"
              description="Less than what is left records a part fill"
              min={0}
              max={check.remaining}
              value={entry.quantity}
              onChange={(quantity) => onChange({ quantity })}
              style={{ flex: '1 1 180px' }}
            />
            <TextInput
              label="Note (optional)"
              description="e.g. counselled on taking with food"
              value={entry.note}
              onChange={(e) => onChange({ note: e.currentTarget.value })}
              style={{ flex: '2 1 240px' }}
            />
          </Group>
        )}

        {valid && unresolved.length > 0 && (
          <Textarea
            label="Your reason to dispense despite the alert"
            description="Recorded with the dispense, with your name. Leave empty and this medicine is not dispensed."
            required
            autosize
            minRows={2}
            value={entry.reason}
            onChange={(e) => onChange({ reason: e.currentTarget.value })}
          />
        )}

        {problem && valid && (
          <Text size="sm" c="red">
            {problem}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}

function StockLine(props: {
  readonly stock?: DispenseStock;
  readonly loading: boolean;
  readonly quantity: number | string;
  readonly code?: string;
}): JSX.Element | null {
  const { stock, loading, code } = props;
  if (!code) {
    return (
      <Text size="sm" c="dimmed">
        No KNHTS code on this prescription: stock cannot be checked.
      </Text>
    );
  }
  if (loading) {
    return (
      <Text size="sm" c="dimmed">
        Checking stock…
      </Text>
    );
  }
  if (!stock) {
    return null;
  }
  const good = stock.state === 'in-stock' && stock.usable >= Number(props.quantity || 0);
  return (
    <Group gap="xs" data-testid="dispense-stock">
      <Badge color={good ? 'teal' : 'red'} variant="light">
        {stock.message}
      </Badge>
      {stock.batch && (
        <Text size="sm">
          Batch <strong>{stock.batch.batchNo}</strong>
          {stock.batch.expiry ? `, expires ${stock.batch.expiry}` : ''}
          {stock.itemName && stock.itemCode !== code ? ` · ${stock.itemName}` : ''}
        </Text>
      )}
    </Group>
  );
}

/**
 * Why a medicine cannot be dispensed now, or undefined when it can.
 * @param line - The prescription and its check.
 * @param entry - What the pharmacist entered.
 * @param stock - Stock by prescription id (undefined while loading).
 * @returns The problem in words.
 */
export function lineProblem(
  line: DispenseLine,
  entry: DispenseEntry | undefined,
  stock: Record<string, DispenseStock> | undefined
): string | undefined {
  const { check } = line;
  if (check.state !== 'valid') {
    return check.reason ?? 'This prescription cannot be dispensed';
  }
  const quantity = entry?.quantity === '' || entry?.quantity === undefined ? check.remaining : Number(entry.quantity);
  if (quantity === undefined || !(quantity > 0)) {
    return 'Enter the quantity to hand over';
  }
  if (check.remaining !== undefined && quantity > check.remaining) {
    return `Only ${check.remaining} left on this prescription`;
  }
  if (check.alerts.some((a) => a.severity === 'high' && !a.overridden) && !entry?.reason.trim()) {
    return 'Give your reason to dispense despite the safety alert';
  }
  if (!stock) {
    return 'Checking stock…';
  }
  const s = stock[line.prescription.id as string];
  if (s && s.state !== 'in-stock') {
    return s.message;
  }
  if (s && s.usable < quantity) {
    return `Only ${s.usable} in date in the dispensary`;
  }
  return undefined;
}

/**
 * Reads the $kenya-dispense-check result.
 * @param parameters - The operation output.
 * @returns The check.
 */
export function parseCheck(parameters: Parameters): DispenseCheck {
  const get = (name: string): ParametersParameter | undefined => parameters.parameter?.find((p) => p.name === name);
  return {
    state: get('state')?.valueCode ?? 'unknown',
    reason: get('reason')?.valueString,
    prescribed: get('prescribed')?.valueDecimal,
    dispensed: get('dispensed')?.valueDecimal ?? 0,
    remaining: get('remaining')?.valueDecimal,
    alerts: (parameters.parameter ?? [])
      .filter((p) => p.name === 'alert')
      .map((p) => {
        const part = (name: string): ParametersParameter | undefined => p.part?.find((x) => x.name === name);
        return {
          id: part('id')?.valueString ?? '',
          severity: part('severity')?.valueCode ?? 'low',
          category: part('category')?.valueCode ?? '',
          title: part('title')?.valueString ?? 'Safety alert',
          detail: part('detail')?.valueString ?? '',
          recommendation: part('recommendation')?.valueString ?? '',
          overridden: part('overridden')?.valueString,
        };
      }),
  };
}

function hptCode(prescription: MedicationRequest): string | undefined {
  const codings = prescription.medicationCodeableConcept?.coding ?? [];
  return (
    codings.find((c) => c.system === KenyaHealthProductSystem && c.code)?.code ??
    codings.find((c) => c.code && /^(PH|FS|GE)\d+$/.test(c.code))?.code
  );
}

function medicineName(prescription: MedicationRequest): string {
  return (
    prescription.medicationCodeableConcept?.text ??
    prescription.medicationCodeableConcept?.coding?.[0]?.display ??
    'Medicine'
  );
}

function patientName(patient: Patient): string {
  const name = patient.name?.[0];
  return [name?.given?.join(' '), name?.family].filter(Boolean).join(' ') || 'the patient';
}

function describePatient(patient: Patient): string | undefined {
  const sexes: Record<string, string> = { female: 'Female', male: 'Male' };
  const age = patient.birthDate ? calculateAgeString(patient.birthDate) : undefined;
  return [sexes[patient.gender ?? ''], age].filter(Boolean).join(', ') || undefined;
}
