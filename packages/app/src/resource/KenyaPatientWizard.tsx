// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Loader,
  NativeSelect,
  Paper,
  Stack,
  Stepper,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import type { KenyaPatientIdentificationType } from '@medplum/core';
import { KenyaPatientIdentificationTypes, normalizeErrorString } from '@medplum/core';
import type { Bundle, HumanName, Patient } from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

type Gender = 'male' | 'female' | 'other' | 'unknown';

const ID_SYSTEM_MAP: Record<KenyaPatientIdentificationType, string> = {
  'National ID': 'https://afiax.africa/kenya/identifier/national-id',
  'Alien ID': 'https://afiax.africa/kenya/identifier/alien-id',
  Passport: 'https://afiax.africa/kenya/identifier/passport',
  'Birth Certificate': 'https://afiax.africa/kenya/identifier/birth-certificate',
  'Refugee ID': 'https://afiax.africa/kenya/identifier/refugee-id',
};

interface DhaPatientMessage {
  readonly found?: number | string | boolean | null;
  readonly client_registry_id?: string | null;
  readonly full_name?: string | null;
  readonly first_name?: string | null;
  readonly last_name?: string | null;
  readonly date_of_birth?: string | null;
  readonly gender?: string | null;
  readonly identification_type?: string | null;
  readonly identification_number?: string | null;
}

interface PatientLookupResponse {
  readonly result?: ({ readonly message?: DhaPatientMessage } & DhaPatientMessage) | null;
}

function extractDhaPatient(resp: PatientLookupResponse): DhaPatientMessage | undefined {
  const r = resp.result;
  if (!r) {
    return undefined;
  }
  if (r.message) {
    return r.message;
  }
  if ('found' in r || 'client_registry_id' in r) {
    return r as DhaPatientMessage;
  }
  return undefined;
}

function isDhaFound(msg: DhaPatientMessage | undefined): boolean {
  if (!msg) {
    return false;
  }
  return msg.found === 1 || msg.found === true || msg.found === '1';
}

function normalizeGender(g: string | null | undefined): Gender {
  if (!g) {
    return 'unknown';
  }
  const lower = g.toLowerCase();
  if (lower === 'male' || lower === 'm') {
    return 'male';
  }
  if (lower === 'female' || lower === 'f') {
    return 'female';
  }
  return 'other';
}

export function KenyaPatientWizard(): JSX.Element {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const navigate = useNavigate();

  const [active, setActive] = useState(0);

  // Step 1 — DHA lookup (must succeed to proceed)
  const [idType, setIdType] = useState<KenyaPatientIdentificationType>('National ID');
  const [idNumber, setIdNumber] = useState('');
  const [searching, setSearching] = useState(false);
  const [dhaPatient, setDhaPatient] = useState<DhaPatientMessage | undefined>();
  const [dhaSearched, setDhaSearched] = useState(false);

  // Step 2 — system duplicate check
  const [checking, setChecking] = useState(false);
  const [existingPatients, setExistingPatients] = useState<Patient[] | undefined>();

  // Step 3 — registration form (pre-filled from DHA)
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender>('unknown');
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState<string | undefined>();

  const dhaVerified = isDhaFound(dhaPatient);

  async function handleDhaLookup(): Promise<void> {
    const number = idNumber.trim();
    if (!number) {
      setError('Enter an ID number.');
      return;
    }
    setSearching(true);
    setError(undefined);
    setDhaPatient(undefined);
    setDhaSearched(false);
    try {
      const resp = await medplum.post(`admin/projects/${project?.id}/kenya/afyalink/patient-lookup`, {
        identificationType: idType,
        identificationNumber: number,
      });
      const msg = extractDhaPatient(resp);
      setDhaPatient(msg);
      setDhaSearched(true);
      if (isDhaFound(msg)) {
        // Pre-fill registration form from DHA data
        setGivenName(msg?.first_name?.trim() ?? '');
        setFamilyName(msg?.last_name?.trim() ?? '');
        setDob(msg?.date_of_birth?.trim() ?? '');
        setGender(normalizeGender(msg?.gender));
        // Advance to system check only if DHA verified
        setActive(1);
      }
      // If not found, stay on step 1 — registration is blocked
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setSearching(false);
    }
  }

  async function handleSystemCheck(): Promise<void> {
    setChecking(true);
    setError(undefined);
    try {
      const system = ID_SYSTEM_MAP[idType];
      const bundle = (await medplum.search('Patient', {
        identifier: `${system}|${idNumber.trim()}`,
        _count: '5',
      })) as Bundle<Patient>;
      const found = (bundle.entry ?? []).map((e) => e.resource).filter(Boolean) as Patient[];
      setExistingPatients(found);
      setActive(2);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setChecking(false);
    }
  }

  async function handleCreate(): Promise<void> {
    if (!dhaVerified) {
      return;
    } // should never reach here, but guard anyway
    const family = familyName.trim();
    if (!family) {
      setError('Family name is required.');
      return;
    }
    setCreating(true);
    setError(undefined);
    try {
      const name: HumanName = { family, ...(givenName.trim() ? { given: [givenName.trim()] } : {}) };
      const patient: Patient = {
        resourceType: 'Patient',
        name: [name],
        gender,
        ...(dob ? { birthDate: dob } : {}),
        identifier: [
          {
            system: ID_SYSTEM_MAP[idType],
            value: idNumber.trim(),
            type: { text: idType },
            ...(dhaPatient?.client_registry_id
              ? {
                  extension: [
                    {
                      url: 'https://afiax.africa/fhir/StructureDefinition/client-registry-id',
                      valueString: dhaPatient.client_registry_id,
                    },
                  ],
                }
              : {}),
          },
        ],
      };
      const created = await medplum.createResource(patient);
      showNotification({ color: 'green', message: `Patient created: ${family}` });
      navigate(`/Patient/${created.id}`)?.catch(console.error);
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      showNotification({ color: 'red', message: msg, autoClose: false });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Paper p="xl" maw={680} mx="auto" mt="md">
      <Stack gap="lg">
        <Title order={2}>New Patient</Title>

        <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false}>
          {/* Step 1: DHA Client Registry — mandatory verification */}
          <Stepper.Step label="DHA Verification" description="Kenya National Client Registry">
            <Stack gap="md" mt="lg">
              <Alert color="blue" variant="light">
                All patients must be verified in the DHA National Client Registry before registration. Enter the
                patient's government-issued ID to look them up.
              </Alert>

              <NativeSelect
                label="ID Type"
                data={KenyaPatientIdentificationTypes as unknown as string[]}
                value={idType}
                onChange={(e) => {
                  setIdType(e.currentTarget.value as KenyaPatientIdentificationType);
                  setDhaPatient(undefined);
                  setDhaSearched(false);
                  setError(undefined);
                }}
              />
              <TextInput
                label="ID Number"
                placeholder="12345678"
                value={idNumber}
                onChange={(e) => {
                  setIdNumber(e.currentTarget.value);
                  setDhaPatient(undefined);
                  setDhaSearched(false);
                  setError(undefined);
                }}
                onKeyDown={(e) => e.key === 'Enter' && handleDhaLookup().catch(console.error)}
              />

              {error && <Alert color="red">{error}</Alert>}

              {/* Search result feedback */}
              {dhaSearched && dhaVerified && dhaPatient && (
                <Alert color="green" variant="light" title="Patient verified in DHA Registry">
                  <Stack gap={4}>
                    <Group gap="xs">
                      <Badge size="xs" color="teal">
                        AfyaLink HIE
                      </Badge>
                      <Badge size="xs" color="green">
                        Verified
                      </Badge>
                    </Group>
                    <Divider my={4} />
                    {dhaPatient.full_name && (
                      <Text size="sm">
                        <b>Full Name:</b> {dhaPatient.full_name}
                      </Text>
                    )}
                    {dhaPatient.date_of_birth && (
                      <Text size="sm">
                        <b>Date of Birth:</b> {dhaPatient.date_of_birth}
                      </Text>
                    )}
                    {dhaPatient.gender && (
                      <Text size="sm">
                        <b>Gender:</b> {dhaPatient.gender}
                      </Text>
                    )}
                    {dhaPatient.client_registry_id && (
                      <Text size="sm">
                        <b>Registry ID:</b> {dhaPatient.client_registry_id}
                      </Text>
                    )}
                  </Stack>
                </Alert>
              )}

              {dhaSearched && !dhaVerified && (
                <Alert color="red" variant="light" title="Patient not found in DHA Registry">
                  No record found for {idType} {idNumber.trim()} in the Kenya National Client Registry. Registration
                  cannot proceed without DHA verification. Please verify the ID number and try again.
                </Alert>
              )}

              <Group>
                <Button
                  onClick={() => handleDhaLookup().catch(console.error)}
                  loading={searching}
                  disabled={!idNumber.trim()}
                >
                  Search DHA Registry
                </Button>
                {dhaSearched && dhaVerified && <Button onClick={() => setActive(1)}>Continue</Button>}
              </Group>
            </Stack>
          </Stepper.Step>

          {/* Step 2: System duplicate check */}
          <Stepper.Step label="System Check" description="Confirm not already registered">
            <Stack gap="md" mt="lg">
              {dhaPatient && (
                <Alert color="teal" variant="light">
                  <Group gap="xs">
                    <Badge size="xs" color="teal">
                      DHA Verified
                    </Badge>
                    <Text size="sm">{dhaPatient.full_name ?? `${idType} ${idNumber.trim()}`}</Text>
                  </Group>
                </Alert>
              )}

              {existingPatients && existingPatients.length > 0 && (
                <Alert color="orange" variant="light" title="Patient already registered">
                  <Stack gap={4}>
                    <Text size="sm">
                      A patient with {idType} {idNumber} already exists in this system:
                    </Text>
                    {existingPatients.map((p) => (
                      <MedplumLink key={p.id} to={`/Patient/${p.id}`}>
                        {p.name?.[0]?.given?.join(' ')} {p.name?.[0]?.family} — {p.birthDate ?? 'No DOB'} ({p.id})
                      </MedplumLink>
                    ))}
                    <Text size="sm" mt={4}>
                      Please open the existing record instead of creating a duplicate.
                    </Text>
                  </Stack>
                </Alert>
              )}

              {existingPatients?.length === 0 && (
                <Alert color="green" variant="light">
                  No existing record found — safe to register.
                </Alert>
              )}

              {checking && (
                <Group gap="xs">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    Checking system records...
                  </Text>
                </Group>
              )}

              {error && <Alert color="red">{error}</Alert>}

              <Group>
                <Button
                  variant="default"
                  onClick={() => {
                    setExistingPatients(undefined);
                    setActive(0);
                  }}
                  disabled={checking}
                >
                  Back
                </Button>
                {!existingPatients ? (
                  <Button onClick={() => handleSystemCheck().catch(console.error)} loading={checking}>
                    Check System Records
                  </Button>
                ) : (
                  <Button onClick={() => setActive(2)} disabled={existingPatients.length > 0}>
                    Proceed to Register
                  </Button>
                )}
              </Group>
            </Stack>
          </Stepper.Step>

          {/* Step 3: Register (form pre-filled from DHA) */}
          <Stepper.Step label="Register" description="Create patient record">
            <Stack gap="md" mt="lg">
              <Alert color="teal" variant="light">
                Details pre-filled from the DHA National Client Registry. Verify and confirm before creating.
              </Alert>

              <Group grow>
                <TextInput
                  label="Given Name"
                  placeholder="Jane"
                  value={givenName}
                  onChange={(e) => setGivenName(e.currentTarget.value)}
                />
                <TextInput
                  label="Family Name"
                  placeholder="Kamau"
                  required
                  value={familyName}
                  onChange={(e) => setFamilyName(e.currentTarget.value)}
                />
              </Group>
              <Group grow>
                <TextInput
                  label="Date of Birth"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.currentTarget.value)}
                />
                <NativeSelect
                  label="Gender"
                  data={[
                    { value: 'unknown', label: 'Unknown' },
                    { value: 'female', label: 'Female' },
                    { value: 'male', label: 'Male' },
                    { value: 'other', label: 'Other' },
                  ]}
                  value={gender}
                  onChange={(e) => setGender(e.currentTarget.value as Gender)}
                />
              </Group>
              <Group grow>
                <NativeSelect
                  label="ID Type"
                  data={KenyaPatientIdentificationTypes as unknown as string[]}
                  value={idType}
                  disabled
                />
                <TextInput label="ID Number" value={idNumber} disabled />
              </Group>

              {error && <Alert color="red">{error}</Alert>}

              <Group>
                <Button variant="default" onClick={() => setActive(1)} disabled={creating}>
                  Back
                </Button>
                <Button
                  onClick={() => handleCreate().catch(console.error)}
                  loading={creating}
                  disabled={!familyName.trim()}
                >
                  Create Patient
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>
        </Stepper>
      </Stack>
    </Paper>
  );
}
