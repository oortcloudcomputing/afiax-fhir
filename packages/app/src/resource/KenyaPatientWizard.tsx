// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Button,
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
import {
  KenyaPatientIdentificationTypes,
  normalizeErrorString,
  type KenyaPatientIdentificationType,
} from '@medplum/core';
import type { Bundle, HumanName, Parameters, Patient } from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

type Gender = 'male' | 'female' | 'other' | 'unknown';

const ID_SYSTEM_MAP: Record<KenyaPatientIdentificationType, string> = {
  'National ID': 'https://afiax.africa/kenya/identifier/national-id',
  'Alien ID': 'https://afiax.africa/kenya/identifier/alien-id',
  'Passport': 'https://afiax.africa/kenya/identifier/passport',
  'Birth Certificate': 'https://afiax.africa/kenya/identifier/birth-certificate',
  'Refugee ID': 'https://afiax.africa/kenya/identifier/refugee-id',
};

export function KenyaPatientWizard(): JSX.Element {
  const medplum = useMedplum();
  const navigate = useNavigate();

  const [active, setActive] = useState(0);

  // Step 1
  const [idType, setIdType] = useState<KenyaPatientIdentificationType>('National ID');
  const [idNumber, setIdNumber] = useState('');
  const [checking, setChecking] = useState(false);
  const [duplicates, setDuplicates] = useState<Patient[] | undefined>();
  const [checkedId, setCheckedId] = useState('');

  // Step 2
  const [givenName, setGivenName] = useState('');
  const [familyName, setFamilyName] = useState('');
  const [dob, setDob] = useState('');
  const [gender, setGender] = useState<Gender>('unknown');

  // Step 3 (creating)
  const [creating, setCreating] = useState(false);
  const [resolving, setResolving] = useState(false);

  const [error, setError] = useState<string | undefined>();

  async function handleCheckDuplicate(): Promise<void> {
    const number = idNumber.trim();
    if (!number) { setError('Enter an ID number.'); return; }
    setChecking(true); setError(undefined);
    try {
      const system = ID_SYSTEM_MAP[idType];
      const bundle = (await medplum.search('Patient', {
        identifier: `${system}|${number}`,
        _count: '5',
      })) as Bundle<Patient>;
      const found = (bundle.entry ?? []).map((e) => e.resource).filter(Boolean) as Patient[];
      setDuplicates(found);
      setCheckedId(number);
      setActive(1);
    } catch (err) {
      setError(normalizeErrorString(err));
    } finally {
      setChecking(false);
    }
  }

  async function handleCreate(): Promise<void> {
    const family = familyName.trim();
    if (!family) { setError('Family name is required.'); return; }
    setCreating(true); setError(undefined);
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
          },
        ],
      };
      const created = await medplum.createResource(patient);
      setCreating(false);

      // Auto-resolve identity from DHA Client Registry
      setResolving(true);
      try {
        await medplum.post(
          medplum.fhirUrl('Patient', created.id as string, '$resolve-patient-identity'),
          {
            resourceType: 'Parameters',
            parameter: [
              { name: 'identificationType', valueString: idType },
              { name: 'identificationNumber', valueString: idNumber.trim() },
            ],
          } as Parameters
        );
      } catch {
        // Identity resolution failure is non-fatal — patient is already created
      } finally {
        setResolving(false);
      }

      showNotification({ color: 'green', message: `Patient created: ${family}` });
      navigate(`/Patient/${created.id}`);
    } catch (err) {
      const msg = normalizeErrorString(err);
      setError(msg);
      setCreating(false);
      showNotification({ color: 'red', message: msg, autoClose: false });
    }
  }

  const isCreatingOrResolving = creating || resolving;

  return (
    <Paper p="xl" maw={640} mx="auto" mt="md">
      <Stack gap="lg">
        <Title order={2}>New Patient</Title>

        <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false}>
          <Stepper.Step label="Patient ID" description="Check for duplicates">
            <Stack gap="md" mt="lg">
              <Alert color="blue" variant="light">
                Enter the patient's identification document to check for existing records before creating a new patient.
              </Alert>
              <NativeSelect
                label="ID Type"
                data={KenyaPatientIdentificationTypes as unknown as string[]}
                value={idType}
                onChange={(e) => setIdType(e.currentTarget.value as KenyaPatientIdentificationType)}
              />
              <TextInput
                label="ID Number"
                placeholder="12345678"
                value={idNumber}
                onChange={(e) => setIdNumber(e.currentTarget.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCheckDuplicate().catch(console.error)}
              />
              {error && <Alert color="red">{error}</Alert>}
              <Group>
                <Button onClick={() => handleCheckDuplicate().catch(console.error)} loading={checking} disabled={!idNumber.trim()}>
                  Check for existing patient
                </Button>
                <Button variant="subtle" onClick={() => { setDuplicates([]); setCheckedId(''); setActive(1); }}>
                  Skip check
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Patient Details" description="Name, DOB, and gender">
            <Stack gap="md" mt="lg">
              {duplicates && duplicates.length > 0 && (
                <Alert color="orange" variant="light" title="Existing patient(s) found">
                  <Stack gap={4}>
                    <Text size="sm">A patient with {idType} {checkedId} already exists:</Text>
                    {duplicates.map((p) => (
                      <MedplumLink key={p.id} to={`/Patient/${p.id}`}>
                        {p.name?.[0]?.given?.join(' ')} {p.name?.[0]?.family} — {p.birthDate ?? 'No DOB'} ({p.id})
                      </MedplumLink>
                    ))}
                    <Text size="sm" mt={4}>You can still create a new patient if this is a different person.</Text>
                  </Stack>
                </Alert>
              )}

              {duplicates && duplicates.length === 0 && (
                <Alert color="green" variant="light">
                  No existing patient found with {idType} {checkedId} — safe to proceed.
                </Alert>
              )}

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
                  onChange={(e) => setIdType(e.currentTarget.value as KenyaPatientIdentificationType)}
                />
                <TextInput
                  label="ID Number"
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.currentTarget.value)}
                />
              </Group>

              <Alert color="blue" variant="light">
                After creation, Afiax will automatically query the DHA Client Registry to resolve this patient's identity.
              </Alert>

              {isCreatingOrResolving && (
                <Group gap="xs">
                  <Loader size="sm" />
                  <Text size="sm" c="dimmed">
                    {creating ? 'Creating patient...' : 'Resolving identity from DHA Client Registry...'}
                  </Text>
                </Group>
              )}

              {error && <Alert color="red">{error}</Alert>}

              <Group>
                <Button variant="default" onClick={() => setActive(0)} disabled={isCreatingOrResolving}>Back</Button>
                <Button
                  onClick={() => handleCreate().catch(console.error)}
                  loading={isCreatingOrResolving}
                  disabled={!familyName.trim() || !idNumber.trim()}
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
