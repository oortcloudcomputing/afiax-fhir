// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Checkbox, Divider, Group, Stack, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  getKenyaNationalRecordPublicationSnapshot,
  getProjectSettingString,
  normalizeErrorString,
} from '@medplum/core';
import type { Parameters, ParametersParameter, Patient, Reference, Task } from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

interface PublicationResult {
  readonly status?: string;
  readonly correlationId?: string;
  readonly patientId?: string;
  readonly publicationId?: string;
  readonly endpoint?: string;
  readonly publishedAt?: string;
  readonly message?: string;
  readonly bundleEntryCount?: number;
  readonly task?: Reference<Task>;
}

export interface NationalRecordPublicationPanelProps {
  readonly patient: Patient;
}

function getParameter(parameters: Parameters | undefined, name: string): ParametersParameter | undefined {
  return parameters?.parameter?.find((p) => p.name === name);
}

function getPublicationResult(parameters: Parameters | undefined): PublicationResult {
  return {
    status: getParameter(parameters, 'status')?.valueCode,
    correlationId: getParameter(parameters, 'correlationId')?.valueString,
    patientId: getParameter(parameters, 'patientId')?.valueString,
    publicationId: getParameter(parameters, 'publicationId')?.valueString,
    endpoint: getParameter(parameters, 'endpoint')?.valueString,
    publishedAt: getParameter(parameters, 'publishedAt')?.valueDateTime ?? getParameter(parameters, 'publishedAt')?.valueString,
    message: getParameter(parameters, 'message')?.valueString,
    bundleEntryCount: getParameter(parameters, 'bundleEntryCount')?.valueInteger,
    task: getParameter(parameters, 'task')?.valueReference as Reference<Task> | undefined,
  };
}

function statusBadge(status: string | undefined): JSX.Element | null {
  if (!status) return null;
  const color = status === 'published' ? 'green' : status === 'error' ? 'red' : 'yellow';
  return <Badge color={color} variant="filled" size="sm">{status.toUpperCase()}</Badge>;
}

export function NationalRecordPublicationPanel(props: NationalRecordPublicationPanelProps): JSX.Element | null {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const countryPack = getProjectSettingString(project, 'countryPack');
  if (!props.patient.id || countryPack !== 'kenya') return null;

  const persisted = getKenyaNationalRecordPublicationSnapshot(props.patient);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<PublicationResult>();
  const [includeConditions, setIncludeConditions] = useState(true);
  const [includeEncounters, setIncludeEncounters] = useState(false);

  const currentResult: PublicationResult | undefined = (result ?? persisted) as PublicationResult | undefined;

  async function handlePublish(): Promise<void> {
    setPublishing(true); setError(undefined);
    try {
      const params = (await medplum.post(medplum.fhirUrl('Patient', props.patient.id as string, '$publish-national-record'), {
        resourceType: 'Parameters',
        parameter: [
          { name: 'includeActiveConditions', valueBoolean: includeConditions },
          { name: 'includeRecentEncounters', valueBoolean: includeEncounters },
        ],
      })) as Parameters;
      const r = getPublicationResult(params);
      setResult(r);
      const color = r.status === 'published' ? 'green' : 'red';
      showNotification({ color, message: r.message ?? `SHR ${r.status}`, autoClose: r.status === 'error' ? false : undefined });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setPublishing(false); }
  }

  return (
    <Stack gap="sm" mb="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Title order={3}>Kenya SHR Publication</Title>
          {statusBadge(currentResult?.status)}
        </Group>
        <Button onClick={() => handlePublish().catch(console.error)} loading={publishing}>
          Publish to SHR
        </Button>
      </Group>

      {currentResult?.status === 'published' && currentResult.publicationId && (
        <Alert color="green" variant="light">
          Published to Kenya SHR — ID: <strong>{currentResult.publicationId}</strong>
          {currentResult.publishedAt ? ` at ${currentResult.publishedAt}` : ''}
        </Alert>
      )}

      <Group gap="xl">
        <Checkbox
          label="Include active Conditions"
          checked={includeConditions}
          onChange={(e) => setIncludeConditions(e.currentTarget.checked)}
        />
        <Checkbox
          label="Include recent Encounters"
          checked={includeEncounters}
          onChange={(e) => setIncludeEncounters(e.currentTarget.checked)}
        />
      </Group>

      {error && <Alert color="red">{error}</Alert>}

      {currentResult?.status && (
        <>
          <Divider />
          <DescriptionList>
            <DescriptionListEntry term="Status">{currentResult.status}</DescriptionListEntry>
            {currentResult.publicationId && <DescriptionListEntry term="SHR Record ID">{currentResult.publicationId}</DescriptionListEntry>}
            {currentResult.bundleEntryCount != null && (
              <DescriptionListEntry term="Bundle Entries">{currentResult.bundleEntryCount}</DescriptionListEntry>
            )}
            {currentResult.message && <DescriptionListEntry term="Message">{currentResult.message}</DescriptionListEntry>}
            {currentResult.publishedAt && <DescriptionListEntry term="Published">{currentResult.publishedAt}</DescriptionListEntry>}
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
