// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Group, NativeSelect, Stack, Table, Text, TextInput } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaCoverageEligibilityIdentificationType } from '@medplum/core';
import {
  formatDateTime,
  getKenyaCoverageEligibilityLookupIdentifier,
  getKenyaCoverageEligibilitySnapshot,
  getReferenceString,
  KenyaPatientIdentifierSystems,
  normalizeErrorString,
} from '@medplum/core';
import type { Coverage, Organization, Parameters, Patient } from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildKenyaShaCoverage, KenyaShaOrganizationSearch } from './kenya-billing';

const idTypes: KenyaCoverageEligibilityIdentificationType[] = [
  'National ID',
  'SHA Number',
  'Alien ID',
  'Mandate Number',
  'Temporary ID',
  'Refugee ID',
];

export interface KenyaPatientCoverProps {
  readonly patient: Patient;
  /** Called when the cover list changes (for example to pick the SHA cover for a claim). */
  readonly onChange?: (coverages: Coverage[], sha: Organization | undefined) => void;
}

/**
 * The patient's insurance cover: add SHA cover (payor = the SHA Organization) and check eligibility
 * with SHA ($check-coverage).
 * @param props - The component props.
 * @returns The cover section.
 */
export function KenyaPatientCover(props: KenyaPatientCoverProps): JSX.Element {
  const { patient, onChange } = props;
  const medplum = useMedplum();
  const patientRef = getReferenceString(patient as Patient & { id: string });
  const [coverages, setCoverages] = useState<Coverage[]>();
  const [sha, setSha] = useState<Organization | null>();
  const [idType, setIdType] = useState<KenyaCoverageEligibilityIdentificationType>('National ID');
  const [idNumber, setIdNumber] = useState(
    () => patient.identifier?.find((i) => i.system === KenyaPatientIdentifierSystems['National ID'])?.value ?? ''
  );
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState<string>();
  const [lastCheck, setLastCheck] = useState<{ eligible?: boolean; message: string }>();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const load = useCallback(() => {
    const options = { cache: 'no-cache' as const };
    Promise.all([
      medplum.searchResources('Coverage', { beneficiary: patientRef, _sort: '-_lastUpdated' }, options),
      medplum.searchOne('Organization', KenyaShaOrganizationSearch, options),
    ])
      .then(([found, shaOrganization]) => {
        setCoverages(found);
        setSha(shaOrganization ?? null);
        onChangeRef.current?.(found, shaOrganization);
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, patientRef]);
  useEffect(load, [load]);

  const shaCoverage = coverages?.find(
    (c) => c.status === 'active' && sha && c.payor?.some((p) => p.reference === `Organization/${sha.id}`)
  );

  async function add(): Promise<void> {
    if (!sha || !idNumber.trim()) {
      return;
    }
    setSaving(true);
    try {
      await medplum.createResource(buildKenyaShaCoverage(patient, sha, idType, idNumber));
      showNotification({ color: 'green', message: 'SHA cover added' });
      load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setSaving(false);
    }
  }

  async function check(coverage: Coverage): Promise<void> {
    setChecking(coverage.id);
    try {
      const result = await medplum.post<Parameters>(
        medplum.fhirUrl('Coverage', coverage.id as string, '$check-coverage')
      );
      const eligible = result.parameter?.find((p) => p.name === 'eligible')?.valueBoolean;
      const message = result.parameter?.find((p) => p.name === 'message')?.valueString;
      setLastCheck({
        eligible,
        message: message ?? (eligible ? 'Patient is eligible for SHA cover' : 'Patient is not eligible'),
      });
      load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setChecking(undefined);
    }
  }

  return (
    <Stack gap="sm" data-testid="kenya-patient-cover">
      {!coverages && <Text c="dimmed">Loading…</Text>}
      {coverages && coverages.length > 0 && (
        <Table striped data-testid="coverage-list">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Payer</Table.Th>
              <Table.Th>Member ID</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Last check</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {coverages.map((coverage) => {
              const snapshot = getKenyaCoverageEligibilitySnapshot(coverage);
              const lookup = getKenyaCoverageEligibilityLookupIdentifier(coverage);
              return (
                <Table.Tr key={coverage.id}>
                  <Table.Td>
                    <MedplumLink to={coverage}>{coverage.payor?.[0]?.display ?? 'Open cover'}</MedplumLink>
                  </Table.Td>
                  <Table.Td>
                    {lookup ? `${lookup.identificationType}: ${lookup.identifier.value}` : coverage.subscriberId}
                  </Table.Td>
                  <Table.Td>{coverage.status}</Table.Td>
                  <Table.Td>
                    {snapshot?.eligible !== undefined && (
                      <Badge color={snapshot.eligible ? 'green' : 'red'} variant="filled" size="sm" mr="xs">
                        {snapshot.eligible ? 'Eligible' : 'Not eligible'}
                      </Badge>
                    )}
                    {snapshot?.checkedAt ? (
                      formatDateTime(snapshot.checkedAt)
                    ) : (
                      <Text span c="dimmed">
                        Not checked
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Button
                      size="xs"
                      variant="light"
                      loading={checking === coverage.id}
                      disabled={!lookup || coverage.status !== 'active'}
                      onClick={() => check(coverage)}
                    >
                      Check eligibility
                    </Button>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}
      {lastCheck && (
        <Alert color={lastCheck.eligible ? 'green' : 'yellow'} data-testid="coverage-check-result">
          {lastCheck.message}
        </Alert>
      )}
      {coverages?.length === 0 && <Text c="dimmed">No insurance cover recorded.</Text>}
      {sha === null && (
        <Alert color="yellow">
          The SHA is not set up in this facility yet, so SHA cover cannot be added. Ask your facility administrator.
        </Alert>
      )}
      {sha && coverages && !shaCoverage && (
        <Group align="flex-end" grow>
          <NativeSelect
            label="Look up by"
            data={idTypes}
            value={idType}
            onChange={(e) => setIdType(e.currentTarget.value as KenyaCoverageEligibilityIdentificationType)}
          />
          <TextInput label="ID number" value={idNumber} onChange={(e) => setIdNumber(e.currentTarget.value)} />
          <Button onClick={() => add()} loading={saving} disabled={!idNumber.trim()}>
            Add SHA cover
          </Button>
        </Group>
      )}
    </Stack>
  );
}
