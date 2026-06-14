// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Divider, Group, Stack, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  getKenyaNationalClaimSubmissionSnapshot,
  getKenyaNationalClaimStatusSnapshot,
  getKenyaShaClaimsEnvironment,
  getProjectSettingString,
  normalizeErrorString,
} from '@medplum/core';
import type { Claim, Parameters, ParametersParameter, Reference, Task } from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';

interface ClaimSubmissionResult {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly shaClaimsEnvironment?: string;
  readonly submissionEndpoint?: string;
  readonly statusTrackingEndpoint?: string;
  readonly responseStatusCode?: number;
  readonly bundleId?: string;
  readonly bundleEntryCount?: number;
  readonly rawBundle?: string;
  readonly rawResponse?: string;
  readonly workflowBot?: string;
  readonly workflowBotStatus?: string;
  readonly workflowBotMessage?: string;
  readonly task?: Reference<Task>;
}

interface ClaimStatusResult {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly checkedAt?: string;
  readonly shaClaimsEnvironment?: string;
  readonly statusEndpoint?: string;
  readonly responseStatusCode?: number;
  readonly claimId?: string;
  readonly claimState?: string;
  readonly rawResponse?: string;
  readonly claimResponse?: Reference;
  readonly workflowBot?: string;
  readonly workflowBotStatus?: string;
  readonly workflowBotMessage?: string;
  readonly task?: Reference<Task>;
}

export interface ClaimNationalSubmissionPanelProps {
  readonly claim: Claim;
}

function getParameter(parameters: Parameters | undefined, name: string): ParametersParameter | undefined {
  return parameters?.parameter?.find((p) => p.name === name);
}

function getClaimSubmissionResult(parameters: Parameters | undefined): ClaimSubmissionResult {
  return {
    status: getParameter(parameters, 'status')?.valueCode,
    correlationId: getParameter(parameters, 'correlationId')?.valueString,
    message: getParameter(parameters, 'message')?.valueString,
    nextState: getParameter(parameters, 'nextState')?.valueString,
    shaClaimsEnvironment: getParameter(parameters, 'shaClaimsEnvironment')?.valueString,
    submissionEndpoint: getParameter(parameters, 'submissionEndpoint')?.valueString,
    statusTrackingEndpoint: getParameter(parameters, 'statusTrackingEndpoint')?.valueString,
    responseStatusCode: getParameter(parameters, 'responseStatusCode')?.valueInteger,
    bundleId: getParameter(parameters, 'bundleId')?.valueString,
    bundleEntryCount: getParameter(parameters, 'bundleEntryCount')?.valueInteger,
    rawBundle: getParameter(parameters, 'rawBundle')?.valueString,
    rawResponse: getParameter(parameters, 'rawResponse')?.valueString,
    workflowBot: getParameter(parameters, 'workflowBot')?.valueString,
    workflowBotStatus: getParameter(parameters, 'workflowBotStatus')?.valueCode,
    workflowBotMessage: getParameter(parameters, 'workflowBotMessage')?.valueString,
    task: getParameter(parameters, 'task')?.valueReference as Reference<Task> | undefined,
  };
}

function getClaimStatusResult(parameters: Parameters | undefined): ClaimStatusResult {
  return {
    status: getParameter(parameters, 'status')?.valueCode,
    correlationId: getParameter(parameters, 'correlationId')?.valueString,
    message: getParameter(parameters, 'message')?.valueString,
    nextState: getParameter(parameters, 'nextState')?.valueString,
    shaClaimsEnvironment: getParameter(parameters, 'shaClaimsEnvironment')?.valueString,
    statusEndpoint: getParameter(parameters, 'statusEndpoint')?.valueString,
    responseStatusCode: getParameter(parameters, 'responseStatusCode')?.valueInteger,
    claimId: getParameter(parameters, 'claimId')?.valueString,
    claimState: getParameter(parameters, 'claimState')?.valueString,
    rawResponse: getParameter(parameters, 'rawResponse')?.valueString,
    claimResponse: getParameter(parameters, 'claimResponse')?.valueReference as Reference | undefined,
    workflowBot: getParameter(parameters, 'workflowBot')?.valueString,
    workflowBotStatus: getParameter(parameters, 'workflowBotStatus')?.valueCode,
    workflowBotMessage: getParameter(parameters, 'workflowBotMessage')?.valueString,
    task: getParameter(parameters, 'task')?.valueReference as Reference<Task> | undefined,
  };
}

function claimStatusBadge(status: string | undefined): JSX.Element | null {
  if (!status) return null;
  const map: Record<string, string> = { submitted: 'blue', adjudicated: 'green', rejected: 'yellow', error: 'red' };
  return <Badge color={map[status] ?? 'gray'} variant="filled" size="sm">{status.toUpperCase()}</Badge>;
}

export function ClaimNationalSubmissionPanel(props: ClaimNationalSubmissionPanelProps): JSX.Element | null {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const countryPack = getProjectSettingString(project, 'countryPack');
  if (!props.claim.id || countryPack !== 'kenya') return null;

  const env = getKenyaShaClaimsEnvironment(project);
  const [submitting, setSubmitting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [error, setError] = useState<string>();
  const [submissionResult, setSubmissionResult] = useState<ClaimSubmissionResult>();
  const [statusResult, setStatusResult] = useState<ClaimStatusResult>();

  const currentSubmission = submissionResult ?? getKenyaNationalClaimSubmissionSnapshot(props.claim);
  const currentStatus = statusResult ?? getKenyaNationalClaimStatusSnapshot(props.claim);
  const canCheckStatus = !!currentSubmission?.bundleId;

  async function handleSubmit(): Promise<void> {
    setSubmitting(true); setError(undefined);
    try {
      const params = (await medplum.post(medplum.fhirUrl('Claim', props.claim.id as string, '$submit-national-claim'))) as Parameters;
      const r = getClaimSubmissionResult(params);
      setSubmissionResult(r);
      const color = r.status === 'error' ? 'red' : 'green';
      showNotification({ color, message: r.message ?? (r.status === 'submitted' ? 'Claim submitted' : 'Bundle prepared'), autoClose: r.status === 'error' ? false : undefined });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setSubmitting(false); }
  }

  async function handleCheckStatus(): Promise<void> {
    setCheckingStatus(true); setError(undefined);
    try {
      const params = (await medplum.post(medplum.fhirUrl('Claim', props.claim.id as string, '$check-national-claim-status'))) as Parameters;
      const r = getClaimStatusResult(params);
      setStatusResult(r);
      const color = r.status === 'adjudicated' ? 'green' : r.status === 'rejected' ? 'yellow' : r.status === 'error' ? 'red' : 'blue';
      showNotification({ color, message: r.message ?? `Status: ${r.status}`, autoClose: r.status === 'error' ? false : undefined });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setCheckingStatus(false); }
  }

  return (
    <Stack gap="sm" mb="md">
      {/* Header */}
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Title order={3}>Kenya SHA Claim</Title>
          <Badge color="gray" variant="outline" size="sm">{env === 'production' ? 'PRODUCTION' : 'UAT'}</Badge>
          {claimStatusBadge(currentStatus?.status ?? currentSubmission?.status)}
        </Group>
        <Group>
          <Button variant="default" onClick={() => handleCheckStatus().catch(console.error)} loading={checkingStatus} disabled={!canCheckStatus}>
            Check Status
          </Button>
          <Button onClick={() => handleSubmit().catch(console.error)} loading={submitting}>
            Submit Claim
          </Button>
        </Group>
      </Group>

      {!canCheckStatus && (
        <Alert color="yellow" variant="light">Submit the claim to enable status checking.</Alert>
      )}
      {error && <Alert color="red">{error}</Alert>}

      {/* Submission result */}
      {currentSubmission?.status && (
        <>
          <Divider label="Submission" labelPosition="left" />
          <DescriptionList>
            <DescriptionListEntry term="Status">{currentSubmission.status}</DescriptionListEntry>
            {currentSubmission.message && <DescriptionListEntry term="Message">{currentSubmission.message}</DescriptionListEntry>}
            {currentSubmission.bundleId && <DescriptionListEntry term="Bundle ID">{currentSubmission.bundleId}</DescriptionListEntry>}
            {currentSubmission.bundleEntryCount != null && (
              <DescriptionListEntry term="Bundle Entries">{currentSubmission.bundleEntryCount}</DescriptionListEntry>
            )}
            {currentSubmission.task?.reference && (
              <DescriptionListEntry term="Task">
                <MedplumLink to={currentSubmission.task.reference}>{currentSubmission.task.reference}</MedplumLink>
              </DescriptionListEntry>
            )}
          </DescriptionList>

          <details style={{ fontSize: 13, color: 'var(--mantine-color-dimmed)' }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Submission details</summary>
            <DescriptionList>
              {currentSubmission.submissionEndpoint && <DescriptionListEntry term="Endpoint">{currentSubmission.submissionEndpoint}</DescriptionListEntry>}
              {currentSubmission.responseStatusCode != null && <DescriptionListEntry term="HTTP Status">{currentSubmission.responseStatusCode}</DescriptionListEntry>}
              {currentSubmission.correlationId && <DescriptionListEntry term="Correlation ID">{currentSubmission.correlationId}</DescriptionListEntry>}
              {currentSubmission.workflowBot && <DescriptionListEntry term="Workflow Bot">{currentSubmission.workflowBot}</DescriptionListEntry>}
              {currentSubmission.workflowBotStatus && <DescriptionListEntry term="Bot Status">{currentSubmission.workflowBotStatus}</DescriptionListEntry>}
            </DescriptionList>
          </details>

          {submissionResult?.rawResponse && (
            <details style={{ fontSize: 13, color: 'var(--mantine-color-dimmed)' }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Raw SHA response</summary>
              <Text component="pre" size="xs" style={{ padding: '8px', borderRadius: 6, backgroundColor: 'var(--mantine-color-gray-0)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 4 }}>
                {submissionResult.rawResponse}
              </Text>
            </details>
          )}

          {submissionResult?.rawBundle && (
            <details style={{ fontSize: 13, color: 'var(--mantine-color-dimmed)' }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none' }}>SHA claim bundle</summary>
              <Text component="pre" size="xs" style={{ padding: '8px', borderRadius: 6, backgroundColor: 'var(--mantine-color-gray-0)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 4 }}>
                {submissionResult.rawBundle}
              </Text>
            </details>
          )}
        </>
      )}

      {/* Status result */}
      {currentStatus?.status && (
        <>
          <Divider label="Payer Status" labelPosition="left" />
          <DescriptionList>
            <DescriptionListEntry term="Claim State">{currentStatus.claimState ?? currentStatus.status}</DescriptionListEntry>
            {currentStatus.message && <DescriptionListEntry term="Message">{currentStatus.message}</DescriptionListEntry>}
            {currentStatus.checkedAt && <DescriptionListEntry term="Checked">{currentStatus.checkedAt}</DescriptionListEntry>}
            {currentStatus.claimResponse?.reference && (
              <DescriptionListEntry term="ClaimResponse">
                <MedplumLink to={currentStatus.claimResponse.reference}>{currentStatus.claimResponse.reference}</MedplumLink>
              </DescriptionListEntry>
            )}
            {currentStatus.task?.reference && (
              <DescriptionListEntry term="Task">
                <MedplumLink to={currentStatus.task.reference}>{currentStatus.task.reference}</MedplumLink>
              </DescriptionListEntry>
            )}
          </DescriptionList>

          {statusResult?.rawResponse && (
            <details style={{ fontSize: 13, color: 'var(--mantine-color-dimmed)' }}>
              <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Raw status response</summary>
              <Text component="pre" size="xs" style={{ padding: '8px', borderRadius: 6, backgroundColor: 'var(--mantine-color-gray-0)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 4 }}>
                {statusResult.rawResponse}
              </Text>
            </details>
          )}
        </>
      )}
    </Stack>
  );
}
