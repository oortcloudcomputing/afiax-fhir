// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Badge, Button, Group, Stack, Table, Text } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { formatDateTime, normalizeErrorString } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  Coding,
  Condition,
  Coverage,
  Encounter,
  Organization,
  Patient,
  Practitioner,
  Reference,
} from '@medplum/fhirtypes';
import { MedplumLink, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { KnhtsCodeInput } from '../coding/KnhtsCodeInput';
import { ClaimNationalSubmissionPanel } from './ClaimNationalSubmissionPanel';
import { buildKenyaShaClaim, getVisitClaims } from './kenya-billing';

export interface KenyaVisitClaimProps {
  readonly patient: Patient;
  readonly encounter: Encounter;
  /** The patient's active SHA cover, if any. */
  readonly shaCoverage?: Coverage;
}

interface ClaimData {
  readonly claims: Claim[];
  readonly charges: ChargeItem[];
  readonly diagnoses: Condition[];
}

/**
 * The visit's SHA claim. Without one, the cashier picks the SHA benefit code for each charge and
 * makes the claim; then submits it to SHA ($submit-national-claim) and checks its status.
 * @param props - The component props.
 * @returns The claim section.
 */
export function KenyaVisitClaim(props: KenyaVisitClaimProps): JSX.Element {
  const { patient, encounter, shaCoverage } = props;
  const medplum = useMedplum();
  const [data, setData] = useState<ClaimData>();
  const [codes, setCodes] = useState<Record<string, Coding | undefined>>({});
  const [creating, setCreating] = useState(false);
  const encounterRef = `Encounter/${encounter.id}`;
  const facility = getFacility(encounter, patient);
  const practitioner = encounter.participant?.find((p) => p.individual?.reference?.startsWith('Practitioner/'))
    ?.individual as Reference<Practitioner> | undefined;

  const load = useCallback(() => {
    const options = { cache: 'no-cache' as const };
    const diagnosisRefs = (encounter.diagnosis ?? [])
      .slice()
      .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
      .map((d) => d.condition)
      .filter((r): r is Reference<Condition> => !!r?.reference?.startsWith('Condition/'));
    Promise.all([
      medplum.searchResources('Claim', { encounter: encounterRef, _count: '50' }, options),
      medplum.searchResources('ChargeItem', { context: encounterRef, _count: '200' }, options),
      Promise.all(diagnosisRefs.map((r) => medplum.readReference(r).catch(() => undefined))),
    ])
      .then(([claims, charges, diagnoses]) =>
        setData({
          claims: getVisitClaims(claims),
          charges: charges.filter((c) => c.status === 'billable' || c.status === 'billed'),
          diagnoses: diagnoses.filter((d) => d !== undefined),
        })
      )
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false }));
  }, [medplum, encounterRef, encounter.diagnosis]);
  useEffect(load, [load]);

  if (!data) {
    return <Text c="dimmed">Loading…</Text>;
  }

  if (data.claims.length > 0) {
    return (
      <Stack gap="md" data-testid="kenya-visit-claim">
        {data.claims.map((claim) => (
          <Stack key={claim.id} gap="xs">
            <Group gap="xs">
              <MedplumLink to={claim}>SHA claim {formatDateTime(claim.created)}</MedplumLink>
              <Badge variant="light">{claim.status}</Badge>
              <Text size="sm">KES {(claim.total?.value ?? 0).toLocaleString()}</Text>
            </Group>
            <ClaimNationalSubmissionPanel claim={claim} />
          </Stack>
        ))}
      </Stack>
    );
  }

  const problems = [
    !shaCoverage && 'The patient has no active SHA cover. Add it under Insurance cover first.',
    !facility && 'The visit has no facility. Set the facility (service provider) on the visit first.',
    data.charges.length === 0 && 'There are no charges to claim yet.',
  ].filter((p): p is string => !!p);
  const missingCodes = data.charges.some((c) => !codes[c.id as string]);

  async function create(): Promise<void> {
    if (!shaCoverage || !facility) {
      return;
    }
    setCreating(true);
    try {
      await medplum.createResource(
        buildKenyaShaClaim({
          patient,
          encounter,
          facility,
          practitioner,
          coverage: shaCoverage,
          diagnoses: data?.diagnoses ?? [],
          lines: (data?.charges ?? []).map((charge) => ({ charge, shaCode: codes[charge.id as string] as Coding })),
        })
      );
      showNotification({ color: 'green', message: 'SHA claim created. Submit it to SHA when ready.' });
      load();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err), autoClose: false });
    } finally {
      setCreating(false);
    }
  }

  return (
    <Stack gap="sm" data-testid="kenya-visit-claim">
      <Text c="dimmed">No SHA claim for this visit yet.</Text>
      {problems.map((p) => (
        <Alert key={p} color="yellow">
          {p}
        </Alert>
      ))}
      {problems.length === 0 && (
        <>
          {data.diagnoses.length === 0 && (
            <Alert color="yellow">This visit has no diagnosis. SHA usually rejects claims without one.</Alert>
          )}
          <Text size="sm">Choose the SHA benefit code for each charge:</Text>
          <Table>
            <Table.Tbody>
              {data.charges.map((charge) => (
                <Table.Tr key={charge.id}>
                  <Table.Td w="40%">
                    {charge.code?.text ?? charge.code?.coding?.[0]?.display}
                    <Text size="xs" c="dimmed">
                      KES {(charge.priceOverride?.value ?? 0).toLocaleString()}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <KnhtsCodeInput
                      kind="sha-intervention"
                      label={`SHA benefit code for ${charge.code?.text ?? 'this charge'}`}
                      placeholder="Type to search the SHA benefit list"
                      value={codes[charge.id as string]}
                      onChange={(value) => setCodes((c) => ({ ...c, [charge.id as string]: value }))}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group justify="flex-end">
            <Button onClick={() => create()} loading={creating} disabled={missingCodes}>
              Make SHA claim
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}

function getFacility(encounter: Encounter, patient: Patient): Reference<Organization> | undefined {
  for (const ref of [encounter.serviceProvider, patient.managingOrganization]) {
    if (ref?.reference?.startsWith('Organization/')) {
      return ref;
    }
  }
  return undefined;
}
