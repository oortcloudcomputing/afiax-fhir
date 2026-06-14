// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Divider, Group, NativeSelect, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  clearKenyaCoverageEligibilitySnapshot,
  getKenyaCoverageEligibilityLookupIdentifier,
  getKenyaCoverageEligibilitySnapshot,
  getProjectSettingString,
  normalizeErrorString,
  setKenyaCoverageEligibilityLookupIdentifier,
  type KenyaCoverageEligibilityIdentificationType,
} from '@medplum/core';
import type {
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  Parameters,
  ParametersParameter,
  Reference,
  Task,
} from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

interface CoverageCheckResult {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly checkedAt?: string;
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly eligible?: boolean;
  readonly fullName?: string;
  readonly reason?: string;
  readonly possibleSolution?: string;
  readonly coverageEndDate?: string;
  readonly transitionStatus?: string;
  readonly requestId?: string;
  readonly requestIdNumber?: string;
  readonly requestIdType?: string;
  readonly rawResponse?: string;
  readonly eligibilityRequest?: Reference<CoverageEligibilityRequest>;
  readonly eligibilityResponse?: Reference<CoverageEligibilityResponse>;
  readonly task?: Reference<Task>;
}

export interface CoverageEligibilityPanelProps {
  readonly coverage: Coverage;
}

function getParameter(parameters: Parameters | undefined, name: string): ParametersParameter | undefined {
  return parameters?.parameter?.find((p) => p.name === name);
}

function getCheckCoverageResult(parameters: Parameters | undefined): CoverageCheckResult {
  return {
    status: getParameter(parameters, 'status')?.valueCode,
    correlationId: getParameter(parameters, 'correlationId')?.valueString,
    message: getParameter(parameters, 'message')?.valueString,
    nextState: getParameter(parameters, 'nextState')?.valueString,
    identificationType: getParameter(parameters, 'identificationType')?.valueString,
    identificationNumber: getParameter(parameters, 'identificationNumber')?.valueString,
    eligible: getParameter(parameters, 'eligible')?.valueBoolean,
    fullName: getParameter(parameters, 'fullName')?.valueString,
    reason: getParameter(parameters, 'reason')?.valueString,
    possibleSolution: getParameter(parameters, 'possibleSolution')?.valueString,
    coverageEndDate: getParameter(parameters, 'coverageEndDate')?.valueString,
    transitionStatus: getParameter(parameters, 'transitionStatus')?.valueString,
    requestId: getParameter(parameters, 'requestId')?.valueString,
    requestIdNumber: getParameter(parameters, 'requestIdNumber')?.valueString,
    requestIdType: getParameter(parameters, 'requestIdType')?.valueString,
    rawResponse: getParameter(parameters, 'rawResponse')?.valueString,
    eligibilityRequest: getParameter(parameters, 'coverageEligibilityRequest')?.valueReference as Reference<CoverageEligibilityRequest> | undefined,
    eligibilityResponse: getParameter(parameters, 'coverageEligibilityResponse')?.valueReference as Reference<CoverageEligibilityResponse> | undefined,
    task: getParameter(parameters, 'task')?.valueReference as Reference<Task> | undefined,
  };
}

function eligibilityBadge(eligible: boolean | undefined): JSX.Element | null {
  if (eligible === undefined) return null;
  return <Badge color={eligible ? 'green' : 'red'} variant="filled" size="sm">{eligible ? 'ELIGIBLE' : 'INELIGIBLE'}</Badge>;
}

function statusBadge(status: string | undefined): JSX.Element | null {
  if (!status) return null;
  const color = status === 'eligible' ? 'green' : status === 'error' ? 'red' : 'yellow';
  return <Badge color={color} variant="outline" size="sm">{status}</Badge>;
}

export function CoverageEligibilityPanel(props: CoverageEligibilityPanelProps): JSX.Element | null {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const countryPack = getProjectSettingString(project, 'countryPack');
  if (!props.coverage.id || countryPack !== 'kenya') return null;

  const currentLookupId = getKenyaCoverageEligibilityLookupIdentifier(props.coverage);
  const syncKey = JSON.stringify({ id: props.coverage.id, identifier: props.coverage.identifier, subscriberId: props.coverage.subscriberId, extension: props.coverage.extension });

  const [idType, setIdType] = useState<KenyaCoverageEligibilityIdentificationType>(currentLookupId?.identificationType ?? 'National ID');
  const [idNumber, setIdNumber] = useState(currentLookupId?.identifier.value ?? '');
  const [savedIdType, setSavedIdType] = useState<KenyaCoverageEligibilityIdentificationType>(currentLookupId?.identificationType ?? 'National ID');
  const [savedIdNumber, setSavedIdNumber] = useState(currentLookupId?.identifier.value ?? '');
  const [loadedKey, setLoadedKey] = useState(syncKey);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<CoverageCheckResult>();
  const [resultOverride, setResultOverride] = useState<CoverageCheckResult | null>();

  const currentResult = result ?? (resultOverride === undefined ? getKenyaCoverageEligibilitySnapshot(props.coverage) : resultOverride ?? undefined);

  useEffect(() => {
    if (loadedKey !== syncKey) {
      setIdType(currentLookupId?.identificationType ?? 'National ID');
      setIdNumber(currentLookupId?.identifier.value ?? '');
      setSavedIdType(currentLookupId?.identificationType ?? 'National ID');
      setSavedIdNumber(currentLookupId?.identifier.value ?? '');
      setLoadedKey(syncKey);
      setResultOverride(undefined);
    }
  }, [currentLookupId?.identificationType, currentLookupId?.identifier.value, loadedKey, syncKey]);

  async function handleSave(): Promise<void> {
    const number = idNumber.trim();
    if (!number) { setError('Identification number is required.'); return; }
    setSaving(true); setError(undefined);
    try {
      const saved = await medplum.updateResource(clearKenyaCoverageEligibilitySnapshot(setKenyaCoverageEligibilityLookupIdentifier(props.coverage, idType, number)));
      setIdNumber(number); setSavedIdType(idType); setSavedIdNumber(number);
      setResult(undefined); setResultOverride(getKenyaCoverageEligibilitySnapshot(saved) ?? null);
      showNotification({ color: 'green', message: 'Eligibility lookup saved' });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setSaving(false); }
  }

  async function handleCheck(): Promise<void> {
    setChecking(true); setError(undefined);
    try {
      const params = (await medplum.post(medplum.fhirUrl('Coverage', props.coverage.id as string, '$check-coverage'))) as Parameters;
      const r = getCheckCoverageResult(params);
      setResult(r); setResultOverride(r);
      showNotification({ color: 'green', message: 'Coverage check complete' });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setChecking(false); }
  }

  const idUnsaved = idNumber.trim() !== savedIdNumber.trim() || idType !== savedIdType;

  return (
    <Stack gap="sm" mb="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Title order={3}>Kenya Coverage Eligibility</Title>
          {statusBadge(currentResult?.status)}
          {eligibilityBadge(currentResult?.eligible)}
        </Group>
        <Button onClick={() => handleCheck().catch(console.error)} loading={checking} disabled={!savedIdNumber.trim() || saving || idUnsaved}>
          Check Coverage
        </Button>
      </Group>

      <Group align="flex-end" grow>
        <NativeSelect
          label="ID Type"
          data={['National ID', 'Alien ID', 'Mandate Number', 'Temporary ID', 'SHA Number', 'Refugee ID']}
          value={idType}
          onChange={(e) => setIdType(e.currentTarget.value as KenyaCoverageEligibilityIdentificationType)}
        />
        <TextInput label="ID Number" placeholder="12345678" value={idNumber} onChange={(e) => setIdNumber(e.currentTarget.value)} />
        <Button variant="light" onClick={() => handleSave().catch(console.error)} loading={saving} disabled={!idNumber.trim() || !idUnsaved}>
          Save
        </Button>
      </Group>

      {!idNumber.trim() && <Alert color="yellow" variant="light">Enter the DHA eligibility identifier to continue.</Alert>}
      {idNumber.trim() && idUnsaved && <Alert color="blue" variant="light">Save before running the check.</Alert>}
      {error && <Alert color="red">{error}</Alert>}

      {currentResult?.status && (
        <>
          <Divider />
          <DescriptionList>
            <DescriptionListEntry term="Status">{currentResult.status}</DescriptionListEntry>
            {currentResult.fullName && <DescriptionListEntry term="Member Name">{currentResult.fullName}</DescriptionListEntry>}
            {currentResult.message && <DescriptionListEntry term="Message">{currentResult.message}</DescriptionListEntry>}
            {currentResult.coverageEndDate && <DescriptionListEntry term="Coverage Ends">{currentResult.coverageEndDate}</DescriptionListEntry>}
            {currentResult.reason && <DescriptionListEntry term="Reason">{currentResult.reason}</DescriptionListEntry>}
            {currentResult.checkedAt && <DescriptionListEntry term="Checked">{currentResult.checkedAt}</DescriptionListEntry>}
            {currentResult.task?.reference && (
              <DescriptionListEntry term="Task">
                <MedplumLink to={`/${currentResult.task.reference}`}>{currentResult.task.reference}</MedplumLink>
              </DescriptionListEntry>
            )}
          </DescriptionList>

          <details style={{ fontSize: 13, color: 'var(--mantine-color-dimmed)' }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>All eligibility details</summary>
            <DescriptionList>
              {currentResult.transitionStatus && <DescriptionListEntry term="Transition Status">{currentResult.transitionStatus}</DescriptionListEntry>}
              {currentResult.possibleSolution && <DescriptionListEntry term="Suggestion">{currentResult.possibleSolution}</DescriptionListEntry>}
              {currentResult.requestId && <DescriptionListEntry term="DHA Request ID">{currentResult.requestId}</DescriptionListEntry>}
              {currentResult.identificationNumber && <DescriptionListEntry term="Lookup Number">{currentResult.identificationNumber}</DescriptionListEntry>}
              {currentResult.eligibilityRequest?.reference && (
                <DescriptionListEntry term="Eligibility Request">
                  <MedplumLink to={`/${currentResult.eligibilityRequest.reference}`}>{currentResult.eligibilityRequest.reference}</MedplumLink>
                </DescriptionListEntry>
              )}
              {currentResult.eligibilityResponse?.reference && (
                <DescriptionListEntry term="Eligibility Response">
                  <MedplumLink to={`/${currentResult.eligibilityResponse.reference}`}>{currentResult.eligibilityResponse.reference}</MedplumLink>
                </DescriptionListEntry>
              )}
            </DescriptionList>
          </details>
        </>
      )}

      {result?.rawResponse && (
        <details style={{ fontSize: 13, color: 'var(--mantine-color-dimmed)' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Raw HIE response</summary>
          <Text component="pre" size="xs" style={{ padding: '8px', borderRadius: 6, backgroundColor: 'var(--mantine-color-gray-0)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 4 }}>
            {result.rawResponse}
          </Text>
        </details>
      )}
    </Stack>
  );
}
