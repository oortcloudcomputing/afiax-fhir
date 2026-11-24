// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Avatar, Badge, Button, Card, Group, Select, Stack, Switch, Table, Text, Title } from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { MarketplaceCatalog, MarketplaceCard } from '../../components/kenya/marketplaceApi';
import { RegistrationBadge, Stars } from '../../components/kenya/marketplace';
import { useMarketplace } from '../../components/kenya/marketplaceApi';

interface MyFacility {
  name: string;
  listed: boolean;
  county?: string;
  region?: string;
  canEdit: boolean;
}

type RosterEntry = MarketplaceCard & { published: boolean; consented?: string };

/**
 * The facility admin's marketplace page (ADR-018 §B): join or leave, the county, and every
 * practitioner's profile: check registrations against the register, take a profile down.
 * Practitioners edit only their own profile (My marketplace profile).
 * @returns The page.
 */
export function MarketplaceFacilityPage(): JSX.Element {
  const { call, servicesUrl, asset } = useMarketplace();
  const [catalog, setCatalog] = useState<MarketplaceCatalog>();
  const [facility, setFacility] = useState<MyFacility>();
  const [roster, setRoster] = useState<RosterEntry[]>();

  const loadRoster = useCallback(async () => setRoster(await call<RosterEntry[]>('GET', 'my-facility/profiles')), [call]);

  useEffect(() => {
    if (!servicesUrl) {
      return;
    }
    Promise.all([call<MarketplaceCatalog>('GET', 'catalog'), call<MyFacility>('GET', 'my-facility')])
      .then(async ([c, f]) => {
        setCatalog(c);
        setFacility(f);
        if (f.canEdit) {
          await loadRoster();
        }
      })
      .catch((err) => showNotification({ color: 'red', message: normalizeErrorString(err) }));
  }, [call, loadRoster, servicesUrl]);

  if (!servicesUrl) {
    return (
      <Document>
        <Alert color="yellow" title="The marketplace is not set up">
          This Afiax Provider has no afiax-services address (MEDPLUM_AFIAX_SERVICES_URL).
        </Alert>
      </Document>
    );
  }
  if (facility && !facility.canEdit) {
    return (
      <Document>
        <Alert color="blue" title="For the facility admin">
          Only your facility admin manages the facility in the marketplace. Your own profile is under My marketplace profile.
        </Alert>
      </Document>
    );
  }

  async function verify(entry: RosterEntry, verified: boolean): Promise<void> {
    try {
      await call('POST', `profiles/${entry.id}/verify`, { verified });
      await loadRoster();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  async function takeDown(entry: RosterEntry): Promise<void> {
    try {
      await call('POST', `profiles/${entry.id}/unpublish`);
      showNotification({ color: 'green', message: `${entry.name} is no longer in the marketplace` });
      await loadRoster();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  return (
    <Document>
      <Title order={2}>Facility marketplace</Title>
      <Text c="dimmed" mb="md">
        Patients find your practitioners in My Afiax and book into their clinic hours.
      </Text>
      <Stack gap="xl">
        {facility && catalog ? <FacilitySettings facility={facility} catalog={catalog} onSaved={setFacility} /> : null}
        {roster ? (
          <Card withBorder padding="lg">
            <Title order={4}>Practitioners</Title>
            <Text size="sm" c="dimmed" mb="md">
              Each practitioner publishes their own profile (their consent). Check each registration number on the body&apos;s
              register before ticking it as checked: patients see it as checked.
            </Text>
            {roster.length === 0 ? (
              <Text c="dimmed">No practitioner has published a profile yet.</Text>
            ) : (
              <Table verticalSpacing="sm" striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Practitioner</Table.Th>
                    <Table.Th>Registration</Table.Th>
                    <Table.Th>Checked</Table.Th>
                    <Table.Th>Reviews</Table.Th>
                    <Table.Th>Status</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {roster.map((p) => (
                    <Table.Tr key={p.id}>
                      <Table.Td>
                        <Group gap="sm" wrap="nowrap">
                          <Avatar src={asset(p.photo)} radius="xl" color="blue" />
                          <div>
                            <Text fw={600}>{p.name}</Text>
                            <Text size="xs" c="dimmed">
                              {[p.cadre?.display, p.speciality?.display].filter(Boolean).join(' · ')}
                              {p.feeKes !== undefined ? ` · KES ${p.feeKes.toLocaleString()}` : ''}
                            </Text>
                          </div>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        {p.registration?.value ? (
                          <Stack gap={2}>
                            <RegistrationBadge registration={p.registration} asset={asset} compact />
                            {p.registration.body?.register ? (
                              <Anchor href={p.registration.body.register} target="_blank" rel="noopener noreferrer" size="xs">
                                Open the {p.registration.body.code} register
                              </Anchor>
                            ) : null}
                          </Stack>
                        ) : (
                          <Text size="xs" c="dimmed">
                            None given
                          </Text>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Switch
                          checked={!!p.registration?.verified}
                          disabled={!p.registration?.value}
                          onChange={(e) => verify(p, e.currentTarget.checked)}
                          aria-label={`Registration of ${p.name} checked`}
                        />
                      </Table.Td>
                      <Table.Td>
                        <Stars rating={p.rating} count={p.reviews} />
                      </Table.Td>
                      <Table.Td>
                        <Badge color={p.published ? 'green' : 'gray'} variant="light">
                          {p.published ? 'Published' : 'Taken down'}
                        </Badge>
                        {p.consented ? (
                          <Text size="xs" c="dimmed">
                            consented {new Date(p.consented).toLocaleDateString()}
                          </Text>
                        ) : null}
                      </Table.Td>
                      <Table.Td>
                        {p.published ? (
                          <Button size="xs" variant="subtle" color="red" onClick={() => takeDown(p)}>
                            Take down
                          </Button>
                        ) : null}
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
          </Card>
        ) : null}
      </Stack>
    </Document>
  );
}

function FacilitySettings(props: { readonly facility: MyFacility; readonly catalog: MarketplaceCatalog; readonly onSaved: (f: MyFacility) => void }): JSX.Element {
  const { call } = useMarketplace();
  const { facility, catalog } = props;
  const [listed, setListed] = useState(facility.listed);
  const [county, setCounty] = useState<string | null>(facility.county ?? null);
  const [busy, setBusy] = useState(false);
  const counties = Object.entries(catalog.regions).map(([region, list]) => ({ group: region, items: list }));

  async function save(): Promise<void> {
    setBusy(true);
    try {
      props.onSaved(await call<MyFacility>('POST', 'my-facility', { listed, county: county ?? undefined }));
      showNotification({ color: 'green', message: listed ? `${facility.name} is in the marketplace` : `${facility.name} left the marketplace` });
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between">
        <Title order={4}>{facility.name}</Title>
        <Badge color={facility.listed ? 'green' : 'gray'}>{facility.listed ? 'In the marketplace' : 'Not in the marketplace'}</Badge>
      </Group>
      <Stack mt="md" maw={480}>
        <Select label="County" data={counties} value={county} onChange={setCounty} searchable description={facility.region ? `Region: ${facility.region}` : undefined} />
        <Switch label="List our practitioners in the marketplace" checked={listed} onChange={(e) => setListed(e.currentTarget.checked)} />
        <Button loading={busy} onClick={() => save()} w={160}>
          Save
        </Button>
      </Stack>
    </Card>
  );
}
