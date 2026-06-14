// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Divider, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  applyKenyaFacilityRegistryToOrganization,
  clearKenyaFacilityRegistrySnapshot,
  clearKenyaFacilityVerificationSnapshot,
  getKenyaFacilityAuthorityIdentifier,
  getKenyaFacilityRegistrySnapshot,
  getKenyaFacilityVerificationSnapshot,
  getProjectSettingString,
  normalizeErrorString,
  setKenyaFacilityAuthorityIdentifier,
} from '@medplum/core';
import type { Organization, Parameters, ParametersParameter, Reference, Task } from '@medplum/fhirtypes';
import { DescriptionList, DescriptionListEntry, MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

interface FacilityVerificationResult {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly verifiedAt?: string;
  readonly facilityApprovalStatus?: string;
  readonly facilityOperationalStatus?: string;
  readonly currentLicenseExpiryDate?: string;
  readonly facilityAuthorityIdentifier?: string;
  readonly task?: Reference<Task>;
}

interface KenyaFacilityLookupMessage {
  readonly facility_name?: string | null;
  readonly registration_number?: string | null;
  readonly found?: number | null;
  readonly approved?: string | boolean | null;
  readonly facility_level?: string | null;
  readonly facility_category?: string | null;
  readonly facility_owner?: string | null;
  readonly facility_type?: string | null;
  readonly county?: string | null;
  readonly sub_county?: string | null;
  readonly ward?: string | null;
  readonly operational_status?: string | null;
  readonly current_license_expiry_date?: string | null;
  readonly regulator?: string | null;
  readonly facility_code?: string | null;
}

interface KenyaFacilityLookupResponse {
  readonly ok?: boolean;
  readonly baseUrl?: string;
  readonly facilityCode?: string;
  readonly result?: { readonly message?: KenyaFacilityLookupMessage } & KenyaFacilityLookupMessage;
}

export interface OrganizationFacilityVerificationPanelProps {
  readonly organization: Organization;
}

function getParameter(parameters: Parameters | undefined, name: string): ParametersParameter | undefined {
  return parameters?.parameter?.find((p) => p.name === name);
}

function getVerificationResult(parameters: Parameters | undefined): FacilityVerificationResult {
  return {
    status: getParameter(parameters, 'status')?.valueCode,
    correlationId: getParameter(parameters, 'correlationId')?.valueString,
    message: getParameter(parameters, 'message')?.valueString,
    nextState: getParameter(parameters, 'nextState')?.valueString,
    facilityApprovalStatus: getParameter(parameters, 'facilityApprovalStatus')?.valueString,
    facilityOperationalStatus: getParameter(parameters, 'facilityOperationalStatus')?.valueString,
    currentLicenseExpiryDate: getParameter(parameters, 'currentLicenseExpiryDate')?.valueString,
    facilityAuthorityIdentifier: getParameter(parameters, 'facilityAuthorityIdentifier')?.valueString,
    task: getParameter(parameters, 'task')?.valueReference as Reference<Task> | undefined,
  };
}

function getLookupMessage(response: KenyaFacilityLookupResponse | undefined): KenyaFacilityLookupMessage | undefined {
  const result = response?.result;
  if (!result) return undefined;
  if (result.message) return result.message;
  if ('facility_name' in result || 'found' in result) return result;
  return undefined;
}

function statusBadge(status: string | undefined): JSX.Element | null {
  if (!status) return null;
  const color = status === 'verified' ? 'green' : status === 'error' ? 'red' : 'yellow';
  return <Badge color={color} variant="filled" size="sm">{status.toUpperCase()}</Badge>;
}

export function OrganizationFacilityVerificationPanel(
  props: OrganizationFacilityVerificationPanelProps
): JSX.Element | null {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const countryPack = getProjectSettingString(project, 'countryPack');
  if (!props.organization.id || countryPack !== 'kenya') return null;

  const currentFacilityIdentifier = getKenyaFacilityAuthorityIdentifier(props.organization);
  const syncKey = JSON.stringify({ id: props.organization.id, identifier: props.organization.identifier, extension: props.organization.extension });

  const [mflCode, setMflCode] = useState(currentFacilityIdentifier?.value ?? '');
  const [savedMflCode, setSavedMflCode] = useState(currentFacilityIdentifier?.value ?? '');
  const [loadedKey, setLoadedKey] = useState(syncKey);
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string>();
  const [result, setResult] = useState<FacilityVerificationResult>();
  const [lookupDebug, setLookupDebug] = useState<KenyaFacilityLookupResponse>();
  const [registryOverride, setRegistryOverride] = useState(getKenyaFacilityRegistrySnapshot(props.organization));
  const [resultOverride, setResultOverride] = useState<FacilityVerificationResult | null>();

  const registry = registryOverride === undefined ? getKenyaFacilityRegistrySnapshot(props.organization) : registryOverride ?? undefined;
  const currentResult = result ?? (resultOverride === undefined ? getKenyaFacilityVerificationSnapshot(props.organization) : resultOverride ?? undefined);

  useEffect(() => {
    if (loadedKey !== syncKey) {
      setMflCode(currentFacilityIdentifier?.value ?? '');
      setSavedMflCode(currentFacilityIdentifier?.value ?? '');
      setLoadedKey(syncKey);
      setRegistryOverride(undefined);
      setLookupDebug(undefined);
      setResultOverride(undefined);
    }
  }, [currentFacilityIdentifier?.value, loadedKey, syncKey]);

  async function handleSave(): Promise<void> {
    const code = mflCode.trim();
    if (!code) { setError('Facility code is required.'); return; }
    setSaving(true); setError(undefined);
    try {
      const saved = await medplum.updateResource(
        clearKenyaFacilityRegistrySnapshot(clearKenyaFacilityVerificationSnapshot(setKenyaFacilityAuthorityIdentifier(props.organization, code)))
      );
      setSavedMflCode(code);
      setRegistryOverride(getKenyaFacilityRegistrySnapshot(saved));
      setLookupDebug(undefined); setResult(undefined); setResultOverride(null);
      showNotification({ color: 'green', message: 'Facility code saved' });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setSaving(false); }
  }

  async function handleLookup(): Promise<void> {
    const code = mflCode.trim();
    if (!code) { setError('Facility code is required.'); return; }
    setLookingUp(true); setError(undefined);
    try {
      const resp = (await medplum.post(`admin/projects/${project?.id}/kenya/afyalink/facility-lookup`, { facilityCode: code })) as KenyaFacilityLookupResponse;
      const msg = getLookupMessage(resp);
      setLookupDebug(resp);
      const saved = await medplum.updateResource(
        applyKenyaFacilityRegistryToOrganization(
          clearKenyaFacilityVerificationSnapshot(props.organization),
          {
            facilityCode: msg?.facility_code ?? code,
            found: msg?.found,
            facilityName: msg?.facility_name,
            registrationNumber: msg?.registration_number,
            regulator: msg?.regulator,
            approvalStatus: msg?.approved,
            facilityLevel: msg?.facility_level,
            facilityCategory: msg?.facility_category,
            facilityOwner: msg?.facility_owner,
            facilityType: msg?.facility_type,
            county: msg?.county,
            subCounty: msg?.sub_county,
            ward: msg?.ward,
            operationalStatus: msg?.operational_status,
            currentLicenseExpiryDate: msg?.current_license_expiry_date,
          },
          new Date().toISOString()
        )
      );
      setSavedMflCode(code);
      setRegistryOverride(getKenyaFacilityRegistrySnapshot(saved));
      setResult(undefined); setResultOverride(null);
      showNotification({ color: msg?.found === 1 ? 'green' : 'yellow', message: msg?.found === 1 ? 'Facility found in Kenya HIE' : `No match for code ${code}` });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setLookingUp(false); }
  }

  async function handleVerify(): Promise<void> {
    setVerifying(true); setError(undefined);
    try {
      const params = (await medplum.post(medplum.fhirUrl('Organization', props.organization.id as string, '$verify-facility-authority'))) as Parameters;
      const r = getVerificationResult(params);
      setResult(r); setResultOverride(r);
      showNotification({ color: 'green', message: 'Verification complete' });
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally { setVerifying(false); }
  }

  const codeUnsaved = mflCode.trim() !== savedMflCode.trim();

  return (
    <Stack gap="sm" mb="md">
      <Group justify="space-between" align="center">
        <Group gap="xs">
          <Title order={3}>Kenya Facility Verification</Title>
          {statusBadge(currentResult?.status)}
        </Group>
        <Group>
          <Button variant="light" onClick={() => handleLookup().catch(console.error)} loading={lookingUp} disabled={!mflCode.trim() || saving || verifying}>
            Lookup
          </Button>
          <Button onClick={() => handleVerify().catch(console.error)} loading={verifying} disabled={!savedMflCode.trim() || saving || lookingUp || codeUnsaved}>
            Verify
          </Button>
        </Group>
      </Group>

      <Group align="flex-end" grow>
        <TextInput
          label="MFL Code"
          description="Kenya DHA facility code (Master Facility List)"
          placeholder="24749"
          value={mflCode}
          onChange={(e) => setMflCode(e.currentTarget.value)}
        />
        <Button variant="light" onClick={() => handleSave().catch(console.error)} loading={saving} disabled={!mflCode.trim() || !codeUnsaved}>
          Save Code
        </Button>
      </Group>

      {!mflCode.trim() && <Alert color="yellow" variant="light">Enter the MFL code to start verification.</Alert>}
      {mflCode.trim() && codeUnsaved && <Alert color="blue" variant="light">Save the code before running lookup or verify.</Alert>}
      {error && <Alert color="red">{error}</Alert>}

      {currentResult?.status && (
        <>
          <Divider />
          <DescriptionList>
            <DescriptionListEntry term="Status">{currentResult.status}</DescriptionListEntry>
            {currentResult.message && <DescriptionListEntry term="Message">{currentResult.message}</DescriptionListEntry>}
            {currentResult.facilityAuthorityIdentifier && (
              <DescriptionListEntry term="Authority ID">{currentResult.facilityAuthorityIdentifier}</DescriptionListEntry>
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
            {registry.facilityName && <DescriptionListEntry term="Facility Name">{registry.facilityName}</DescriptionListEntry>}
            {registry.county && <DescriptionListEntry term="County">{registry.county}</DescriptionListEntry>}
            {registry.facilityLevel && <DescriptionListEntry term="Level">{registry.facilityLevel}</DescriptionListEntry>}
            {registry.operationalStatus && <DescriptionListEntry term="Operational Status">{registry.operationalStatus}</DescriptionListEntry>}
            {registry.registrationNumber && <DescriptionListEntry term="Reg. Number">{registry.registrationNumber}</DescriptionListEntry>}
            {registry.lookedUpAt && <DescriptionListEntry term="Last Lookup">{registry.lookedUpAt}</DescriptionListEntry>}
          </DescriptionList>

          <details style={{ fontSize: 13, color: 'var(--mantine-color-dimmed)' }}>
            <summary style={{ cursor: 'pointer', userSelect: 'none' }}>All registry fields</summary>
            <DescriptionList>
              {registry.regulator && <DescriptionListEntry term="Regulator">{registry.regulator}</DescriptionListEntry>}
              {registry.facilityCategory && <DescriptionListEntry term="Category">{registry.facilityCategory}</DescriptionListEntry>}
              {registry.facilityOwner && <DescriptionListEntry term="Owner">{registry.facilityOwner}</DescriptionListEntry>}
              {registry.facilityType && <DescriptionListEntry term="Type">{registry.facilityType}</DescriptionListEntry>}
              {registry.subCounty && <DescriptionListEntry term="Sub-County">{registry.subCounty}</DescriptionListEntry>}
              {registry.ward && <DescriptionListEntry term="Ward">{registry.ward}</DescriptionListEntry>}
              {registry.approvalStatus != null && <DescriptionListEntry term="Approval">{String(registry.approvalStatus)}</DescriptionListEntry>}
              {registry.currentLicenseExpiryDate && <DescriptionListEntry term="License Expiry">{registry.currentLicenseExpiryDate}</DescriptionListEntry>}
            </DescriptionList>
          </details>
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
