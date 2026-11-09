// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Button, Group, NumberInput, Select, SimpleGrid, Stack, Textarea, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaCdsAlert, KenyaOrderCategoryCode } from '@medplum/core';
import { getKenyaOrderCategory, KenyaDepartments, KenyaOrderCategories, normalizeErrorString } from '@medplum/core';
import type { Coding, Encounter, MedicationRequest, Parameters } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { CdsAlertList } from '../clinical/CdsAlertList';
import { parseCdsAlerts } from '../clinical/clinical-utils';
import type { KnhtsSearchKind } from '../coding/KnhtsCodeInput';
import { KnhtsCodeInput } from '../coding/KnhtsCodeInput';

const searchKindByCategory: Record<KenyaOrderCategoryCode, KnhtsSearchKind> = {
  medication: 'medication',
  laboratory: 'laboratory',
  radiology: 'radiology',
  physiotherapy: 'intervention',
  nutrition: 'intervention',
  'social-work': 'intervention',
  counselling: 'intervention',
};

export interface KenyaOrderEntryProps {
  /** The (active) encounter the order belongs to. */
  readonly encounter: Encounter;
  /** Called after an order is placed. */
  readonly onPlaced?: () => void;
}

/**
 * Kenya order entry (DHA FUNC-CPOE-001): orders in every attested category, coded from KNHTS, sent with
 * Encounter/$kenya-order, which routes each to its department queue and raises its charge. A medicine
 * is checked against the patient's record ($cds-check) as soon as it is chosen; a high-severity alert
 * needs a written reason to override.
 * @param props - The component props.
 * @returns The order form.
 */
export function KenyaOrderEntry(props: KenyaOrderEntryProps): JSX.Element {
  const { encounter, onPlaced } = props;
  const medplum = useMedplum();
  const [categoryCode, setCategoryCode] = useState<KenyaOrderCategoryCode>('medication');
  const [code, setCode] = useState<Coding>();
  const [priority, setPriority] = useState<string>('routine');
  const [note, setNote] = useState('');
  const [dosage, setDosage] = useState('');
  const [quantity, setQuantity] = useState<number | string>('');
  const [duration, setDuration] = useState<number | string>('');
  // CDS alerts for the chosen medicine, keyed by its code so a stale result is never shown
  const [checked, setChecked] = useState<{ code: string; alerts: KenyaCdsAlert[] }>();
  const [override, setOverride] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const category = getKenyaOrderCategory(categoryCode);
  const isMedication = categoryCode === 'medication';

  // Check a medicine against the patient's record as soon as it is chosen (before it is signed)
  useEffect(() => {
    if (!isMedication || !code?.code) {
      return;
    }
    const draft: MedicationRequest = {
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      subject: encounter.subject as MedicationRequest['subject'],
      medicationCodeableConcept: { coding: [code], text: code.display },
    };
    medplum
      .post<Parameters>(medplum.fhirUrl('MedicationRequest', '$cds-check'), draft)
      .then((result) => setChecked({ code: code.code as string, alerts: parseCdsAlerts(result) }))
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, encounter.subject, isMedication, code]);

  const alerts = isMedication && checked && checked.code === code?.code ? checked.alerts : undefined;
  const needsOverride = !!alerts?.some((a) => a.severity === 'high');
  const missing =
    !code || (isMedication && !dosage.trim()) || (needsOverride && override.trim().length < 10) || submitting;

  function reset(): void {
    setCode(undefined);
    setNote('');
    setDosage('');
    setQuantity('');
    setDuration('');
    setOverride('');
  }

  function submit(): void {
    if (!code || !category) {
      return;
    }
    const parameter: Parameters['parameter'] = [
      { name: 'category', valueCode: categoryCode },
      { name: 'code', valueCoding: code },
      { name: 'priority', valueCode: priority },
    ];
    if (note.trim()) {
      parameter.push({ name: 'note', valueString: note.trim() });
    }
    if (isMedication) {
      parameter.push({ name: 'dosageText', valueString: dosage.trim() });
      if (typeof quantity === 'number') {
        parameter.push({ name: 'quantity', valueDecimal: quantity });
      }
      if (typeof duration === 'number') {
        parameter.push({ name: 'durationDays', valueInteger: duration });
      }
      if (needsOverride) {
        parameter.push({ name: 'overrideReason', valueString: override.trim() });
      }
    }
    setSubmitting(true);
    medplum
      .post(medplum.fhirUrl('Encounter', encounter.id as string, '$kenya-order'), {
        resourceType: 'Parameters',
        parameter,
      })
      .then(() => {
        showNotification({
          color: 'green',
          message: `${category.display} order sent to ${KenyaDepartments[category.department]}`,
        });
        reset();
        onPlaced?.();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }))
      .finally(() => setSubmitting(false));
  }

  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        <Select
          label="Order type"
          data={KenyaOrderCategories.map((c) => ({ value: c.code, label: c.display }))}
          value={categoryCode}
          onChange={(v) => {
            setCategoryCode((v as KenyaOrderCategoryCode) ?? 'medication');
            reset();
          }}
          allowDeselect={false}
        />
        <Select
          label="Priority"
          data={[
            { value: 'routine', label: 'Routine' },
            { value: 'urgent', label: 'Urgent' },
            { value: 'stat', label: 'STAT (immediately)' },
          ]}
          value={priority}
          onChange={(v) => setPriority(v ?? 'routine')}
          allowDeselect={false}
        />
      </SimpleGrid>
      <KnhtsCodeInput
        key={categoryCode}
        kind={searchKindByCategory[categoryCode]}
        label={isMedication ? 'Medicine (KNHTS HPT registry)' : `${category?.display} (KNHTS)`}
        required
        value={code}
        onChange={(value) => {
          setCode(value);
          setOverride('');
        }}
      />
      {isMedication && (
        <>
          <TextInput
            label="Dosage instructions"
            placeholder="e.g. 500 mg three times daily for 5 days"
            required
            value={dosage}
            onChange={(e) => setDosage(e.currentTarget.value)}
          />
          <SimpleGrid cols={2}>
            <NumberInput label="Quantity to dispense" min={1} value={quantity} onChange={setQuantity} />
            <NumberInput label="Duration (days)" min={1} value={duration} onChange={setDuration} />
          </SimpleGrid>
        </>
      )}
      <Textarea
        label="Clinical note"
        autosize
        minRows={1}
        value={note}
        onChange={(e) => setNote(e.currentTarget.value)}
      />
      {alerts && <CdsAlertList alerts={alerts} emptyText="No allergy, interaction or contraindication alerts." />}
      {needsOverride && (
        <Textarea
          label="Reason for prescribing despite the alert"
          description="Required for high-severity alerts (at least 10 characters). Recorded with the order."
          required
          value={override}
          onChange={(e) => setOverride(e.currentTarget.value)}
        />
      )}
      <Group justify="flex-end">
        <Button onClick={submit} disabled={missing} loading={submitting}>
          {needsOverride ? 'Override and place order' : 'Place order'}
        </Button>
      </Group>
    </Stack>
  );
}
