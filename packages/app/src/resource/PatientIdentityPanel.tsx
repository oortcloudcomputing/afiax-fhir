// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Divider, Group, NativeSelect, Stack, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  getKenyaPatientIdentitySnapshot,
  getProjectSettingString,
  KenyaPatientIdentificationTypes,
  normalizeErrorString,
  type KenyaPatientIdentificationType,
} from '@medplum/core';
import type { Parameters, ParametersParameter, Patient, Reference, Task } from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

interface IdentityResult {
  readonly status?: string;
  readonly correlationId?: string;
  readonly patientId?: string;
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly clientRegistryId?: string;
  readonly fullName?: string;
  readonly dateOfBirth?: string;
  readonly gender?: string;
  readonly resolvedAt?: string;
  readonly message?: string;
  readonly task?: Reference<Task>;
}

export interface PatientIdentityPanelProps {
  readonly patient: Patient;
}

function getParameter(parameters: Parameters | undefined, name: string): ParametersParameter | undefined {
  return parameters?.parameter?.find((p) => p.name === name);
}

function getIdentityResult(parameters: Parameters | undefined): IdentityResult {
  return {
    status: getParameter(parameters, 'status')?.valueCode,
    correlationId: getParameter(parameters, 'correlationId')?.valueString,
    patientId: getParameter(parameters, 'patientId')?.valueString,
    identificationType: getParameter(parameters, 'identificationType')?.valueString,
    identificationNumber: getParameter(parameters, 'identificationNumber')?.valueString,
    clientRegistryId: getParameter(parameters, 'clientRegistryId')?.valueString,
    fullName: getParameter(parameters, 'fullName')?.valueString,
    dateOfBirth: getParameter(parameters, 'dateOfBirth')?.valueString ?? getParameter(parameters, 'dateOfBirth')?.valueDate,
    gender: getParameter(parameters, 'gender')?.valueString,
    resolvedAt: getParameter(parameters, 'resolvedAt')?.valueDateTime ?? getParameter(parameters, 'resolvedAt')?.valueString,
    message: getParameter(parameters, 'message')?.valueString,
    task: getParameter(parameters, 'task')?.valueReference as Reference<Task> | undefined,
  };
}

function statusBadge(status: string | undefined): JSX.Element | null {
  if (!status) return null;
  const color = status === 'resolved' ? 'green' : status === 'error' ? 'red' : 'yellow';
  return <Badge color={color} variant="filled" size="sm">{status.toUpperCase()}</Badge>;
}

export function PatientIdentityPanel(props: PatientIdentityPanelProps): JSX.Element | null {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const countryPack = getProjectSettingString(project, 'countryPack');
  if (!props.patient.id || countryPack !== 'kenya') return null;

  const persisted = getKenyaPatientIdentitySnapshot(props.patient);
  const [idType, setIdType] = useState<KenyaPatientIdentificationType>('National ID');
  const [idNumber, setIdNumber] = useState('');
  const [resolving, setResolving] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<IdentityResult>();

  const currentResult: IdentityResult | undefined = (result ?? persisted) as IdentityResult | undefined;

  async function handleResolve(): Promise<void> {
    const number = idNumber.trim();
    if (!number) { setError('Identification number is required.'); return; }
    setResolving(true); setError(undefined);
    try {
      const params = (await medplum.post(medplum.fhirUrl('Patient', props.patient.id as string, '$resolve-patient-identity'), {
        resourceType: 'Parameters',
        parameter: [
          { name: 'identificationType', valueString: idType },
          { name: 'identificationNumber', valueString: number },
        ],
      })) as Parameters;
      const r = getIdentityResult(params);
      setResult(r);
      const color = r.status === 'resolved' ? 'green' : r.status === 'not-found' ? 'yellow' : 'red';
      showNotification({ color, message: r.message ?? `Identity ${r.status}`, autoClose: r.status === 'error' ? false : undefined });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setResolving(false); }
  }

  return (
    <Stack gap="sm" mb="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Title order={3}>DHA Client Registry</Title>
          {statusBadge(currentResult?.status)}
        </Group>
        <Button onClick={() => handleResolve().catch(console.error)} loading={resolving} disabled={!idNumber.trim()}>
          Resolve Identity
        </Button>
      </Group>

      {currentResult?.status === 'resolved' && currentResult.clientRegistryId && (
        <Alert color="green" variant="light">
          DHA Client Registry ID: <strong>{currentResult.clientRegistryId}</strong>
          {currentResult.fullName ? ` — ${currentResult.fullName}` : ''}
        </Alert>
      )}

      <Group align="flex-end" grow>
        <NativeSelect
          label="ID Type"
          data={KenyaPatientIdentificationTypes as unknown as string[]}
          value={idType}
          onChange={(e) => setIdType(e.currentTarget.value as KenyaPatientIdentificationType)}
        />
        <TextInput label="ID Number" placeholder="12345678" value={idNumber} onChange={(e) => setIdNumber(e.currentTarget.value)} />
      </Group>

      {!idNumber.trim() && !currentResult && <Alert color="yellow" variant="light">Enter an identification document to look up this patient in the DHA Client Registry.</Alert>}
      {error && <Alert color="red">{error}</Alert>}

      {currentResult?.status && (
        <>
          <Divider />
          <DescriptionList>
            <DescriptionListEntry term="Status">{currentResult.status}</DescriptionListEntry>
            {currentResult.clientRegistryId && (
              <DescriptionListEntry term="Client Registry ID">{currentResult.clientRegistryId}</DescriptionListEntry>
            )}
            {currentResult.fullName && <DescriptionListEntry term="Full Name">{currentResult.fullName}</DescriptionListEntry>}
            {currentResult.dateOfBirth && <DescriptionListEntry term="Date of Birth">{currentResult.dateOfBirth}</DescriptionListEntry>}
            {currentResult.gender && <DescriptionListEntry term="Gender">{currentResult.gender}</DescriptionListEntry>}
            {currentResult.message && <DescriptionListEntry term="Message">{currentResult.message}</DescriptionListEntry>}
            {currentResult.resolvedAt && <DescriptionListEntry term="Resolved">{currentResult.resolvedAt}</DescriptionListEntry>}
            {currentResult.task?.reference && (
              <DescriptionListEntry term="Task">
                <MedplumLink to={`/${currentResult.task.reference}`}>{currentResult.task.reference}</MedplumLink>
              </DescriptionListEntry>
            )}
          </DescriptionList>
        </>
      )}
    </Stack>
  );
}
