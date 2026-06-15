// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Paper,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  applyKenyaFacilityRegistryToOrganization,
  normalizeErrorString,
} from '@medplum/core';
import type { Organization } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

interface FacilityMessage {
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

interface LookupResponse {
  readonly result?: ({ readonly message?: FacilityMessage } & FacilityMessage) | null;
}

function extractMessage(resp: LookupResponse): FacilityMessage | undefined {
  const r = resp.result;
  if (!r) return undefined;
  if (r.message) return r.message;
  if ('facility_name' in r || 'found' in r) return r as FacilityMessage;
  return undefined;
}

export function KenyaOrganizationWizard(): JSX.Element {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const navigate = useNavigate();

  const [active, setActive] = useState(0);
  const [mflCode, setMflCode] = useState('');
  const [searching, setSearching] = useState(false);
  const [facility, setFacility] = useState<FacilityMessage | undefined>();
  const [orgName, setOrgName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSearch(): Promise<void> {
    const code = mflCode.trim();
    if (!code) { setError('Enter an MFL code.'); return; }
    setSearching(true); setError(undefined);
    try {
      const resp = (await medplum.post(
        `admin/projects/${project?.id}/kenya/afyalink/facility-lookup`,
        { facilityCode: code }
      )) as LookupResponse;
      const msg = extractMessage(resp);
      setFacility(msg);
      setOrgName(msg?.facility_name?.trim() ?? '');
      setActive(1);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setSearching(false);
    }
  }

  async function handleCreate(): Promise<void> {
    const name = orgName.trim();
    if (!name) { setError('Facility name is required.'); return; }
    setCreating(true); setError(undefined);
    try {
      let org: Organization = { resourceType: 'Organization', name };
      if (facility) {
        org = applyKenyaFacilityRegistryToOrganization(
          org,
          {
            facilityCode: facility.facility_code ?? mflCode.trim(),
            found: facility.found,
            facilityName: facility.facility_name,
            registrationNumber: facility.registration_number,
            regulator: facility.regulator,
            approvalStatus: facility.approved,
            facilityLevel: facility.facility_level,
            facilityCategory: facility.facility_category,
            facilityOwner: facility.facility_owner,
            facilityType: facility.facility_type,
            county: facility.county,
            subCounty: facility.sub_county,
            ward: facility.ward,
            operationalStatus: facility.operational_status,
            currentLicenseExpiryDate: facility.current_license_expiry_date,
          },
          new Date().toISOString()
        );
      }
      const created = await medplum.createResource(org);
      showNotification({ color: 'green', message: `Organization created: ${created.name}` });
      navigate(`/Organization/${created.id}`);
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally {
      setCreating(false);
    }
  }

  const found = facility?.found === 1;

  return (
    <Paper p="xl" maw={640} mx="auto" mt="md">
      <Stack gap="lg">
        <Title order={2}>New Organization</Title>

        <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false}>
          <Stepper.Step label="Facility Search" description="Look up MFL in AfyaLink HIE">
            <Stack gap="md" mt="lg">
              <Alert color="blue" variant="light">
                Enter the DHA Master Facility List (MFL) code to verify this facility in the Kenya HIE before creating the record.
              </Alert>
              <TextInput
                label="MFL Code"
                description="Kenya DHA Master Facility List code"
                placeholder="e.g. 17943"
                value={mflCode}
                onChange={(e) => setMflCode(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch().catch(console.error)}
              />
              {error && <Alert color="red">{error}</Alert>}
              <Group>
                <Button onClick={() => handleSearch().catch(console.error)} loading={searching} disabled={!mflCode.trim()}>
                  Search AfyaLink HIE
                </Button>
                <Button variant="subtle" onClick={() => { setFacility(undefined); setOrgName(''); setActive(1); }}>
                  Skip HIE search
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Confirm & Create" description="Review facility details">
            <Stack gap="md" mt="lg">
              {facility ? (
                <Alert color={found ? 'green' : 'yellow'} variant="light">
                  {found
                    ? `Facility found in Kenya HIE: ${facility.facility_name ?? 'Unknown'}`
                    : 'Facility not found in Kenya HIE — proceeding with manual entry.'}
                </Alert>
              ) : (
                <Alert color="yellow" variant="light">HIE search skipped — enter facility details manually.</Alert>
              )}

              {facility && found && (
                <Paper withBorder p="sm" radius="sm">
                  <Stack gap={4}>
                    <Group gap="xs">
                      <Text fw={500} size="sm">HIE Registry Data</Text>
                      <Badge size="xs" color="green">AfyaLink</Badge>
                    </Group>
                    <Divider />
                    {facility.facility_level && <Text size="sm"><b>Level:</b> {facility.facility_level}</Text>}
                    {facility.county && <Text size="sm"><b>County:</b> {facility.county}</Text>}
                    {facility.sub_county && <Text size="sm"><b>Sub-County:</b> {facility.sub_county}</Text>}
                    {facility.facility_type && <Text size="sm"><b>Type:</b> {facility.facility_type}</Text>}
                    {facility.operational_status && <Text size="sm"><b>Status:</b> {facility.operational_status}</Text>}
                    {facility.approved != null && <Text size="sm"><b>DHA Approved:</b> {String(facility.approved)}</Text>}
                  </Stack>
                </Paper>
              )}

              <TextInput
                label="Organization Name"
                placeholder="Kenyatta National Hospital"
                required
                value={orgName}
                onChange={(e) => setOrgName(e.currentTarget.value)}
              />
              <TextInput
                label="MFL Code"
                description="Will be stored as the facility authority identifier"
                value={mflCode}
                onChange={(e) => setMflCode(e.currentTarget.value)}
              />

              {error && <Alert color="red">{error}</Alert>}

              <Group>
                <Button variant="default" onClick={() => setActive(0)}>Back</Button>
                <Button onClick={() => handleCreate().catch(console.error)} loading={creating} disabled={!orgName.trim()}>
                  Create Organization
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>
        </Stepper>
      </Stack>
    </Paper>
  );
}
