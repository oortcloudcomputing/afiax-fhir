// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Divider, Group, NativeSelect, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  applyKenyaPractitionerRegistryToPractitioner,
  clearKenyaPractitionerRegistrySnapshot,
  clearKenyaPractitionerVerificationSnapshot,
  getKenyaPractitionerLookupIdentifier,
  getKenyaPractitionerRegistrySnapshot,
  getKenyaPractitionerVerificationSnapshot,
  getProjectSettingString,
  normalizeErrorString,
  setKenyaPractitionerLookupIdentifier,
  type KenyaPractitionerIdentificationType,
} from '@medplum/core';
import type { Parameters, ParametersParameter, Practitioner, Reference, Task } from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

interface PractitionerVerificationResult {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly verifiedAt?: string;
  readonly registrationNumber?: string;
  readonly practitionerAuthorityIdentifier?: string;
  readonly practitionerActiveStatus?: string;
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly task?: Reference<Task>;
}

interface KenyaPractitionerLookupResponse {
  readonly baseUrl?: string;
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly result?: {
    readonly message?: { readonly registration_number?: string | number | null; readonly found?: number | null; readonly is_active?: string | boolean | null };
  } & { readonly registration_number?: string | number | null; readonly found?: number | null; readonly is_active?: string | boolean | null };
}

export interface PractitionerAuthorityVerificationPanelProps {
  readonly practitioner: Practitioner;
}

function getParameter(parameters: Parameters | undefined, name: string): ParametersParameter | undefined {
  return parameters?.parameter?.find((p) => p.name === name);
}

function getVerificationResult(parameters: Parameters | undefined): PractitionerVerificationResult {
  return {
    status: getParameter(parameters, 'status')?.valueCode,
    correlationId: getParameter(parameters, 'correlationId')?.valueString,
    message: getParameter(parameters, 'message')?.valueString,
    nextState: getParameter(parameters, 'nextState')?.valueString,
    registrationNumber: getParameter(parameters, 'registrationNumber')?.valueString,
    practitionerAuthorityIdentifier: getParameter(parameters, 'practitionerAuthorityIdentifier')?.valueString,
    practitionerActiveStatus: getParameter(parameters, 'practitionerActiveStatus')?.valueString,
    identificationType: getParameter(parameters, 'identificationType')?.valueString,
    identificationNumber: getParameter(parameters, 'identificationNumber')?.valueString,
    task: getParameter(parameters, 'task')?.valueReference as Reference<Task> | undefined,
  };
}

function getLookupMessage(response: KenyaPractitionerLookupResponse | undefined) {
  const result = response?.result;
  if (!result) return undefined;
  if (result.message) return result.message;
  if ('registration_number' in result || 'found' in result) return result;
  return undefined;
}

function statusBadge(status: string | undefined): JSX.Element | null {
  if (!status) return null;
  const color = status === 'verified' ? 'green' : status === 'error' ? 'red' : 'yellow';
  return <Badge color={color} variant="filled" size="sm">{status.toUpperCase()}</Badge>;
}

export function PractitionerAuthorityVerificationPanel(
  props: PractitionerAuthorityVerificationPanelProps
): JSX.Element | null {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const countryPack = getProjectSettingString(project, 'countryPack');
  if (!props.practitioner.id || countryPack !== 'kenya') return null;

  const currentLookupId = getKenyaPractitionerLookupIdentifier(props.practitioner);
  const syncKey = JSON.stringify({ id: props.practitioner.id, identifier: props.practitioner.identifier, extension: props.practitioner.extension });

  const [idType, setIdType] = useState<KenyaPractitionerIdentificationType>(currentLookupId?.identificationType ?? 'ID');
  const [idNumber, setIdNumber] = useState(currentLookupId?.identifier.value ?? '');
  const [savedIdType, setSavedIdType] = useState<KenyaPractitionerIdentificationType>(currentLookupId?.identificationType ?? 'ID');
  const [savedIdNumber, setSavedIdNumber] = useState(currentLookupId?.identifier.value ?? '');
  const [loadedKey, setLoadedKey] = useState(syncKey);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<PractitionerVerificationResult>();
  const [lookupDebug, setLookupDebug] = useState<KenyaPractitionerLookupResponse>();
  const [registryOverride, setRegistryOverride] = useState(getKenyaPractitionerRegistrySnapshot(props.practitioner));
  const [resultOverride, setResultOverride] = useState<PractitionerVerificationResult | null>();

  const registry = registryOverride === undefined ? getKenyaPractitionerRegistrySnapshot(props.practitioner) : registryOverride ?? undefined;
  const currentResult = result ?? (resultOverride === undefined ? getKenyaPractitionerVerificationSnapshot(props.practitioner) : resultOverride ?? undefined);

  useEffect(() => {
    if (loadedKey !== syncKey) {
      setIdType(currentLookupId?.identificationType ?? 'ID');
      setIdNumber(currentLookupId?.identifier.value ?? '');
      setSavedIdType(currentLookupId?.identificationType ?? 'ID');
      setSavedIdNumber(currentLookupId?.identifier.value ?? '');
      setLoadedKey(syncKey);
      setRegistryOverride(undefined);
      setLookupDebug(undefined);
      setResultOverride(undefined);
    }
  }, [currentLookupId?.identificationType, currentLookupId?.identifier.value, loadedKey, syncKey]);

  async function handleSave(): Promise<void> {
    const number = idNumber.trim();
    if (!number) { setError('Identification number is required.'); return; }
    setSaving(true); setError(undefined);
    try {
      const saved = await medplum.updateResource(
        clearKenyaPractitionerRegistrySnapshot(
          clearKenyaPractitionerVerificationSnapshot(setKenyaPractitionerLookupIdentifier(props.practitioner, idType, number))
        )
      );
      setIdNumber(number); setSavedIdType(idType); setSavedIdNumber(number);
      setRegistryOverride(getKenyaPractitionerRegistrySnapshot(saved));
      setLookupDebug(undefined); setResult(undefined); setResultOverride(null);
      showNotification({ color: 'green', message: 'Practitioner identification saved' });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setSaving(false); }
  }

  async function handleLookup(): Promise<void> {
    const number = idNumber.trim();
    if (!number) { setError('Identification number is required.'); return; }
    setLookingUp(true); setError(undefined);
    try {
      const resp = (await medplum.post(`admin/projects/${project?.id}/kenya/afyalink/practitioner-lookup`, {
        identificationType: idType,
        identificationNumber: number,
      })) as KenyaPractitionerLookupResponse;
      const msg = getLookupMessage(resp);
      setLookupDebug(resp);
      const saved = await medplum.updateResource(
        applyKenyaPractitionerRegistryToPractitioner(
          clearKenyaPractitionerVerificationSnapshot(props.practitioner),
          {
            identificationType: resp.identificationType ?? idType,
            identificationNumber: resp.identificationNumber ?? number,
            registrationNumber: msg?.registration_number == null ? undefined : String(msg.registration_number),
            found: msg?.found,
            isActive: msg?.is_active,
          },
          new Date().toISOString()
        )
      );
      setSavedIdType(idType); setSavedIdNumber(number);
      setRegistryOverride(getKenyaPractitionerRegistrySnapshot(saved));
      setResult(undefined); setResultOverride(null);
      showNotification({ color: msg?.found === 1 ? 'green' : 'yellow', message: msg?.found === 1 ? 'Practitioner found in Kenya HIE' : `No match for ${idType} ${number}` });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setLookingUp(false); }
  }

  async function handleVerify(): Promise<void> {
    setVerifying(true); setError(undefined);
    try {
      const params = (await medplum.post(medplum.fhirUrl('Practitioner', props.practitioner.id as string, '$verify-practitioner-authority'))) as Parameters;
      const r = getVerificationResult(params);
      setResult(r); setResultOverride(r);
      showNotification({ color: 'green', message: 'Verification complete' });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setVerifying(false); }
  }

  const idUnsaved = idNumber.trim() !== savedIdNumber.trim() || idType !== savedIdType;

  return (
    <Stack gap="sm" mb="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Title order={3}>Kenya Practitioner Verification</Title>
          {statusBadge(currentResult?.status)}
        </Group>
        <Group>
          <Button variant="light" onClick={() => handleLookup().catch(console.error)} loading={lookingUp} disabled={!idNumber.trim() || saving || verifying}>
            Lookup
          </Button>
          <Button onClick={() => handleVerify().catch(console.error)} loading={verifying} disabled={!savedIdNumber.trim() || saving || lookingUp || idUnsaved}>
            Verify
          </Button>
        </Group>
      </Group>

      <Group align="flex-end" grow>
        <NativeSelect
          label="ID Type"
          data={[{ value: 'ID', label: 'National ID' }, { value: 'PASSPORT', label: 'Passport' }]}
          value={idType}
          onChange={(e) => setIdType(e.currentTarget.value as KenyaPractitionerIdentificationType)}
        />
        <TextInput
          label="Identification Number"
          placeholder={idType === 'PASSPORT' ? 'A1234567' : '12345678'}
          value={idNumber}
          onChange={(e) => setIdNumber(e.currentTarget.value)}
        />
        <Button variant="light" onClick={() => handleSave().catch(console.error)} loading={saving} disabled={!idNumber.trim() || !idUnsaved}>
          Save
        </Button>
      </Group>

      {!idNumber.trim() && <Alert color="yellow" variant="light">Enter the practitioner identification document to continue.</Alert>}
      {idNumber.trim() && idUnsaved && <Alert color="blue" variant="light">Save the identification before running lookup or verify.</Alert>}
      {error && <Alert color="red">{error}</Alert>}

      {currentResult?.status && (
        <>
          <Divider />
          <DescriptionList>
            <DescriptionListEntry term="Status">{currentResult.status}</DescriptionListEntry>
            {currentResult.message && <DescriptionListEntry term="Message">{currentResult.message}</DescriptionListEntry>}
            {currentResult.practitionerAuthorityIdentifier && (
              <DescriptionListEntry term="Registration No.">{currentResult.practitionerAuthorityIdentifier}</DescriptionListEntry>
            )}
            {currentResult.verifiedAt && <DescriptionListEntry term="Verified">{currentResult.verifiedAt}</DescriptionListEntry>}
            {currentResult.task?.reference && (
              <DescriptionListEntry term="Task">
                <MedplumLink to={`/${currentResult.task.reference}`}>{currentResult.task.reference}</MedplumLink>
              </DescriptionListEntry>
            )}
          </DescriptionList>
        </>
      )}

      {registry && (
        <>
          <Divider />
          <DescriptionList>
            {registry.registrationNumber && <DescriptionListEntry term="Registration No.">{registry.registrationNumber}</DescriptionListEntry>}
            {registry.identificationNumber && <DescriptionListEntry term="ID Number">{registry.identificationNumber}</DescriptionListEntry>}
            {registry.found != null && <DescriptionListEntry term="Registry Match">{registry.found ? 'Found' : 'Not found'}</DescriptionListEntry>}
            {registry.isActive != null && <DescriptionListEntry term="Active">{String(registry.isActive)}</DescriptionListEntry>}
            {registry.lookedUpAt && <DescriptionListEntry term="Last Lookup">{registry.lookedUpAt}</DescriptionListEntry>}
          </DescriptionList>
        </>
      )}

      {lookupDebug && (
        <details style={{ fontSize: 13, color: 'var(--mantine-color-dimmed)' }}>
          <summary style={{ cursor: 'pointer', userSelect: 'none' }}>Raw HIE response</summary>
          <Text component="pre" size="xs" style={{ padding: '8px', borderRadius: 6, backgroundColor: 'var(--mantine-color-gray-0)', overflowX: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 4 }}>
            {JSON.stringify(lookupDebug, null, 2)}
          </Text>
        </details>
      )}
    </Stack>
  );
}
