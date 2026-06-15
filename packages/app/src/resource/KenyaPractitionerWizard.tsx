// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Group,
  NativeSelect,
  Paper,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import {
  KenyaPractitionerIdentificationTypeLabels,
  normalizeErrorString,
  setKenyaPractitionerLookupIdentifier,
  type KenyaPractitionerIdentificationType,
} from '@medplum/core';
import type { HumanName, Practitioner } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

interface PractitionerLookupMessage {
  readonly registration_number?: string | number | null;
  readonly found?: number | null;
  readonly is_active?: string | boolean | null;
}

interface LookupResponse {
  readonly result?: ({ readonly message?: PractitionerLookupMessage } & PractitionerLookupMessage) | null;
}

function extractMessage(resp: LookupResponse): PractitionerLookupMessage | undefined {
  const r = resp.result;
  if (!r) return undefined;
  if (r.message) return r.message;
  if ('found' in r) return r as PractitionerLookupMessage;
  return undefined;
}

const REGISTRY_TYPES = Object.entries(KenyaPractitionerIdentificationTypeLabels) as [
  KenyaPractitionerIdentificationType,
  string,
][];

export function KenyaPractitionerWizard(): JSX.Element {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const navigate = useNavigate();

  const [active, setActive] = useState(0);
  const [idType, setIdType] = useState<KenyaPractitionerIdentificationType>('KMPDC');
  const [idNumber, setIdNumber] = useState('');
  const [searching, setSearching] = useState(false);
  const [lookupResult, setLookupResult] = useState<PractitionerLookupMessage | undefined>();
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | undefined>();

  async function handleSearch(): Promise<void> {
    const number = idNumber.trim();
    if (!number) { setError('Enter a registration number.'); return; }
    setSearching(true); setError(undefined);
    try {
      const resp = (await medplum.post(
        `admin/projects/${project?.id}/kenya/afyalink/practitioner-lookup`,
        { identificationType: idType, identificationNumber: number }
      )) as LookupResponse;
      setLookupResult(extractMessage(resp));
      setActive(1);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setSearching(false);
    }
  }

  async function handleCreate(): Promise<void> {
    const family = familyName.trim();
    const given = givenName.trim();
    if (!family) { setError('Family name is required.'); return; }
    setCreating(true); setError(undefined);
    try {
      const name: HumanName = { family, ...(given ? { given: [given] } : {}) };
      let practitioner: Practitioner = { resourceType: 'Practitioner', name: [name] };
      if (idNumber.trim()) {
        practitioner = setKenyaPractitionerLookupIdentifier(practitioner, idType, idNumber.trim());
      }
      const created = await medplum.createResource(practitioner);
      showNotification({ color: 'green', message: `Practitioner created: ${family}` });
      navigate(`/Practitioner/${created.id}`);
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally {
      setCreating(false);
    }
  }

  const found = lookupResult?.found === 1;
  const isActive = lookupResult?.is_active === true || lookupResult?.is_active === 'yes';
  const regNumberStr = lookupResult?.registration_number != null ? String(lookupResult.registration_number) : undefined;

  return (
    <Paper p="xl" maw={640} mx="auto" mt="md">
      <Stack gap="lg">
        <Title order={2}>New Practitioner</Title>

        <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false}>
          <Stepper.Step label="Registry Search" description="Verify in AfyaLink HWR">
            <Stack gap="md" mt="lg">
              <Alert color="blue" variant="light">
                Search the DHA Health Worker Registry (HWR) via AfyaLink to verify this practitioner's registration before creating the record.
              </Alert>
              <NativeSelect
                label="Registry / Licence Type"
                data={REGISTRY_TYPES.map(([value, label]) => ({ value, label }))}
                value={idType}
                onChange={(e) => setIdType(e.currentTarget.value as KenyaPractitionerIdentificationType)}
              />
              <TextInput
                label={KenyaPractitionerIdentificationTypeLabels[idType]}
                placeholder={idType === 'KMPDC' ? 'M0031534' : idType === 'COC' ? 'COC/12345' : '12345678'}
                value={idNumber}
                onChange={(e) => setIdNumber(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch().catch(console.error)}
              />
              {error && <Alert color="red">{error}</Alert>}
              <Group>
                <Button onClick={() => handleSearch().catch(console.error)} loading={searching} disabled={!idNumber.trim()}>
                  Search AfyaLink HWR
                </Button>
                <Button variant="subtle" onClick={() => { setLookupResult(undefined); setActive(1); }}>
                  Skip HIE search
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Practitioner Details" description="Enter name and confirm">
            <Stack gap="md" mt="lg">
              {lookupResult ? (
                <Alert color={found ? 'green' : 'yellow'} variant="light">
                  {found
                    ? `Registration verified in Kenya HWR — ${isActive ? 'Active' : 'Inactive / Lapsed'}`
                    : 'Practitioner not found in Kenya HWR — proceeding with manual entry.'}
                </Alert>
              ) : (
                <Alert color="yellow" variant="light">HIE search skipped — enter details manually.</Alert>
              )}

              {found && (
                <Paper withBorder p="sm" radius="sm">
                  <Stack gap={4}>
                    <Group gap="xs">
                      <Text fw={500} size="sm">HWR Registry Data</Text>
                      <Badge size="xs" color={isActive ? 'green' : 'orange'}>AfyaLink</Badge>
                    </Group>
                    {regNumberStr && <Text size="sm"><b>Registration No.:</b> {regNumberStr}</Text>}
                    <Text size="sm">
                      <b>Active:</b>{' '}
                      <Badge size="xs" color={isActive ? 'green' : 'red'} variant="light">
                        {isActive ? 'Yes' : 'No'}
                      </Badge>
                    </Text>
                    <Text size="sm"><b>Registry:</b> {KenyaPractitionerIdentificationTypeLabels[idType]}</Text>
                    <Text size="sm"><b>Number:</b> {idNumber}</Text>
                  </Stack>
                </Paper>
              )}

              <Group grow>
                <TextInput
                  label="Given Name"
                  placeholder="John"
                  value={givenName}
                  onChange={(e) => setGivenName(e.currentTarget.value)}
                />
                <TextInput
                  label="Family Name"
                  placeholder="Doe"
                  required
                  value={familyName}
                  onChange={(e) => setFamilyName(e.currentTarget.value)}
                />
              </Group>
              <Group grow>
                <NativeSelect
                  label="Registry / Licence Type"
                  data={REGISTRY_TYPES.map(([value, label]) => ({ value, label }))}
                  value={idType}
                  onChange={(e) => setIdType(e.currentTarget.value as KenyaPractitionerIdentificationType)}
                />
                <TextInput
                  label={KenyaPractitionerIdentificationTypeLabels[idType]}
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.currentTarget.value)}
                />
              </Group>

              {error && <Alert color="red">{error}</Alert>}

              <Group>
                <Button variant="default" onClick={() => setActive(0)}>Back</Button>
                <Button onClick={() => handleCreate().catch(console.error)} loading={creating} disabled={!familyName.trim()}>
                  Create Practitioner
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>
        </Stepper>
      </Stack>
    </Paper>
  );
}
