// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya patient clinical summary (DHA FUNC-MED-001, FUNC-CDS-001): clinical alerts, the allergy
// list (with adding an allergy coded from KNHTS), active medicines, medication history and the
// growth chart (weight, height and BMI over time).

import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, getProjectSettingString, KenyaBmiLoinc, normalizeErrorString } from '@medplum/core';
import type {
  AllergyIntolerance,
  Coding,
  DetectedIssue,
  MedicationDispense,
  MedicationRequest,
  Observation,
  Patient,
} from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { KnhtsCodeInput } from '../coding/KnhtsCodeInput';
import { GrowthChart } from './GrowthChart';

export interface PatientClinicalSummaryPanelProps {
  readonly patient: Patient;
}

export function PatientClinicalSummaryPanel(props: PatientClinicalSummaryPanelProps): JSX.Element | null {
  const medplum = useMedplum();
  if (!props.patient.id || getProjectSettingString(medplum.getProject(), 'countryPack') !== 'kenya') {
    return null;
  }
  return <PatientClinicalSummaryContent {...props} />;
}

interface SummaryData {
  readonly issues: DetectedIssue[];
  readonly allergies: AllergyIntolerance[];
  readonly medications: MedicationRequest[];
  readonly dispenses: MedicationDispense[];
  readonly growth: Observation[];
}

function PatientClinicalSummaryContent({ patient }: PatientClinicalSummaryPanelProps): JSX.Element {
  const medplum = useMedplum();
  const [data, setData] = useState<SummaryData>();
  const ref = `Patient/${patient.id}`;

  const load = useCallback(() => {
    const options = { cache: 'no-cache' as const };
    Promise.all([
      medplum.searchResources('DetectedIssue', { patient: ref, _sort: '-identified', _count: '20' }, options),
      medplum.searchResources('AllergyIntolerance', { patient: ref, _count: '100' }, options),
      medplum.searchResources('MedicationRequest', { subject: ref, _sort: '-authoredon', _count: '200' }, options),
      medplum.searchResources('MedicationDispense', { subject: ref, _count: '200' }, options),
      medplum.searchResources('Observation', { subject: ref, code: growthCodes.join(','), _count: '500' }, options),
    ])
      .then(([issues, allergies, medications, dispenses, growth]) =>
        setData({ issues, allergies, medications, dispenses, growth })
      )
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, ref]);
  useEffect(load, [load]);

  if (!data) {
    return (
      <Paper p="md" mb="md" withBorder>
        <Text c="dimmed">Loading clinical summary…</Text>
      </Paper>
    );
  }

  const activeAllergies = data.allergies.filter(isActiveAllergy);
  const activeMedications = data.medications.filter((m) => m.status === 'active' || m.status === 'on-hold');
  const highAlerts = data.issues.filter((i) => i.severity === 'high' && !i.mitigation?.length);

  return (
    <Paper p="md" mb="md" withBorder data-testid="kenya-clinical-summary">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Clinical summary</Title>
        <Group gap="xs">
          {activeAllergies.length > 0 ? (
            <Badge color="red">Allergies: {activeAllergies.map(allergyName).join(', ')}</Badge>
          ) : (
            <Badge color="gray">No known allergies</Badge>
          )}
          {highAlerts.length > 0 && <Badge color="orange">{highAlerts.length} clinical alert(s)</Badge>}
        </Group>
      </Group>
      <Tabs defaultValue="alerts" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="alerts">Clinical alerts</Tabs.Tab>
          <Tabs.Tab value="allergies">Allergies</Tabs.Tab>
          <Tabs.Tab value="medications">Active medicines</Tabs.Tab>
          <Tabs.Tab value="history">Medication history</Tabs.Tab>
          <Tabs.Tab value="growth">Growth</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="alerts" pt="sm">
          <Alerts issues={data.issues} />
        </Tabs.Panel>
        <Tabs.Panel value="allergies" pt="sm">
          <Allergies patient={patient} allergies={data.allergies} onAdded={load} />
        </Tabs.Panel>
        <Tabs.Panel value="medications" pt="sm">
          <MedicationTable medications={activeMedications} empty="No active medicines." />
        </Tabs.Panel>
        <Tabs.Panel value="history" pt="sm">
          <MedicationTable medications={data.medications} dispenses={data.dispenses} empty="No medicines prescribed." />
        </Tabs.Panel>
        <Tabs.Panel value="growth" pt="sm">
          <GrowthChart observations={data.growth} />
        </Tabs.Panel>
      </Tabs>
    </Paper>
  );
}

const growthCodes = ['http://loinc.org|29463-7', 'http://loinc.org|8302-2', `http://loinc.org|${KenyaBmiLoinc}`];

const severityColor: Record<string, string> = { high: 'red', moderate: 'orange', low: 'yellow' };

function Alerts({ issues }: { issues: DetectedIssue[] }): JSX.Element {
  if (issues.length === 0) {
    return <Text c="dimmed">No clinical alerts.</Text>;
  }
  return (
    <Stack gap="xs" data-testid="clinical-alerts">
      {issues.map((issue) => (
        <Alert key={issue.id} color={severityColor[issue.severity ?? 'low']} title={issue.code?.text}>
          <Text size="sm" style={{ whiteSpace: 'pre-line' }}>
            {issue.detail}
          </Text>
          <Text size="xs" c="dimmed">
            {formatDateTime(issue.identifiedDateTime)}
            {issue.mitigation?.[0]?.action?.text ? ` · ${issue.mitigation[0].action.text}` : ''}
          </Text>
        </Alert>
      ))}
    </Stack>
  );
}

function isActiveAllergy(allergy: AllergyIntolerance): boolean {
  const clinical = allergy.clinicalStatus?.coding?.[0]?.code;
  const verification = allergy.verificationStatus?.coding?.[0]?.code;
  return (
    clinical !== 'inactive' &&
    clinical !== 'resolved' &&
    verification !== 'refuted' &&
    verification !== 'entered-in-error'
  );
}

function allergyName(allergy: AllergyIntolerance): string {
  return allergy.code?.text ?? allergy.code?.coding?.[0]?.display ?? 'Unknown substance';
}

function Allergies({
  patient,
  allergies,
  onAdded,
}: {
  patient: Patient;
  allergies: AllergyIntolerance[];
  onAdded: () => void;
}): JSX.Element {
  const medplum = useMedplum();
  const [source, setSource] = useState<'allergy' | 'ingredient'>('ingredient');
  const [substance, setSubstance] = useState<Coding>();
  const [criticality, setCriticality] = useState<string>('high');
  const [reaction, setReaction] = useState('');

  function add(): void {
    if (!substance) {
      return;
    }
    medplum
      .createResource<AllergyIntolerance>({
        resourceType: 'AllergyIntolerance',
        patient: { reference: `Patient/${patient.id}` },
        clinicalStatus: {
          coding: [{ system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-clinical', code: 'active' }],
        },
        verificationStatus: {
          coding: [
            { system: 'http://terminology.hl7.org/CodeSystem/allergyintolerance-verification', code: 'confirmed' },
          ],
        },
        category: ['medication'],
        criticality: criticality as AllergyIntolerance['criticality'],
        code: { coding: [substance], text: substance.display },
        recordedDate: new Date().toISOString(),
        reaction: reaction.trim() ? [{ manifestation: [{ text: reaction.trim() }] }] : undefined,
      })
      .then(() => {
        showNotification({ color: 'green', message: `Allergy to ${substance.display} recorded` });
        setSubstance(undefined);
        setReaction('');
        onAdded();
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }

  return (
    <Stack gap="sm">
      {allergies.length > 0 ? (
        <Table>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Substance</Table.Th>
              <Table.Th>Criticality</Table.Th>
              <Table.Th>Reaction</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Recorded</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {allergies.map((a) => (
              <Table.Tr key={a.id}>
                <Table.Td>{allergyName(a)}</Table.Td>
                <Table.Td>{a.criticality}</Table.Td>
                <Table.Td>{a.reaction?.[0]?.manifestation?.[0]?.text}</Table.Td>
                <Table.Td>{a.clinicalStatus?.coding?.[0]?.code}</Table.Td>
                <Table.Td>{formatDateTime(a.recordedDate ?? a.meta?.lastUpdated)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      ) : (
        <Text c="dimmed">No known allergies recorded.</Text>
      )}
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <Select
          label="Search in"
          data={[
            { value: 'ingredient', label: 'Medicines (KNHTS HPT)' },
            { value: 'allergy', label: 'Allergy codes (KNHTS)' },
          ]}
          value={source}
          onChange={(v) => {
            setSource((v as 'allergy' | 'ingredient') ?? 'ingredient');
            setSubstance(undefined);
          }}
          allowDeselect={false}
        />
        <KnhtsCodeInput key={source} kind={source} label="Allergic to" value={substance} onChange={setSubstance} />
        <Select
          label="Criticality"
          data={[
            { value: 'high', label: 'High' },
            { value: 'low', label: 'Low' },
            { value: 'unable-to-assess', label: 'Unable to assess' },
          ]}
          value={criticality}
          onChange={(v) => setCriticality(v ?? 'high')}
          allowDeselect={false}
        />
      </SimpleGrid>
      <TextInput
        label="Reaction"
        placeholder="e.g. rash, anaphylaxis"
        value={reaction}
        onChange={(e) => setReaction(e.currentTarget.value)}
      />
      <Group justify="flex-end">
        <Button onClick={add} disabled={!substance}>
          Add allergy
        </Button>
      </Group>
    </Stack>
  );
}

function MedicationTable({
  medications,
  dispenses,
  empty,
}: {
  medications: MedicationRequest[];
  dispenses?: MedicationDispense[];
  empty: string;
}): JSX.Element {
  if (medications.length === 0) {
    return <Text c="dimmed">{empty}</Text>;
  }
  return (
    <Table striped>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Medicine</Table.Th>
          <Table.Th>Dosage</Table.Th>
          <Table.Th>Prescribed</Table.Th>
          <Table.Th>Status</Table.Th>
          {dispenses && <Table.Th>Dispensed</Table.Th>}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {medications.map((m) => {
          const dispensed = dispenses?.filter((d) =>
            d.authorizingPrescription?.some((p) => p.reference === `MedicationRequest/${m.id}`)
          );
          return (
            <Table.Tr key={m.id}>
              <Table.Td>
                {m.medicationCodeableConcept?.text ?? m.medicationCodeableConcept?.coding?.[0]?.display}
              </Table.Td>
              <Table.Td>{m.dosageInstruction?.[0]?.text}</Table.Td>
              <Table.Td>{formatDateTime(m.authoredOn)}</Table.Td>
              <Table.Td>{m.status}</Table.Td>
              {dispenses && (
                <Table.Td>
                  {dispensed?.length ? dispensed.map((d) => formatDateTime(d.whenHandedOver)).join(', ') : '—'}
                </Table.Td>
              )}
            </Table.Tr>
          );
        })}
      </Table.Tbody>
    </Table>
  );
}
