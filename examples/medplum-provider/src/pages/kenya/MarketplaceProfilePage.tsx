// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  Alert,
  Avatar,
  Badge,
  Button,
  Card,
  FileButton,
  Group,
  MultiSelect,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { showNotification } from '@mantine/notifications';
import { normalizeErrorString } from '@medplum/core';
import { Document } from '@medplum/react';
import { IconCamera } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { MarketplaceCatalog, MarketplaceCard, MarketplaceReview } from '../../components/kenya/marketplaceApi';
import { ProviderCardPreview, Stars } from '../../components/kenya/marketplace';
import { useMarketplace } from '../../components/kenya/marketplaceApi';

interface MyProfile {
  published: boolean;
  card?: MarketplaceCard;
  facilityListed: boolean;
  hasHours: boolean;
}

const Languages = ['English', 'Kiswahili', 'Kikuyu', 'Dholuo', 'Luhya', 'Kalenjin', 'Kamba', 'Kisii', 'Meru', 'Somali', 'Maasai', 'Arabic', 'French'];

/**
 * Shrinks a photo to at most 640 px as JPEG, so uploads stay small.
 * @param file - The chosen image.
 * @returns The JPEG, base64.
 */
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 640 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) {
          resolve(b);
        } else {
          reject(new Error('Could not read the photo'));
        }
      },
      'image/jpeg',
      0.85
    );
  });
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const b of bytes) {
    binary += String.fromCharCode(b);
  }
  return btoa(binary);
}

/**
 * A practitioner's own marketplace profile (ADR-018 §B): what patients see, their photo, their
 * registration, publishing (their consent) and their reviews. Only their own profile.
 * @returns The page.
 */
export function MarketplaceProfilePage(): JSX.Element {
  const { call, servicesUrl } = useMarketplace();
  const [catalog, setCatalog] = useState<MarketplaceCatalog>();
  const [profile, setProfile] = useState<MyProfile>();
  const [reviews, setReviews] = useState<{ rating?: number; reviews: MarketplaceReview[] }>();

  const reload = useCallback(async () => {
    const [p, r] = await Promise.all([call<MyProfile>('GET', 'my-profile'), call<{ rating?: number; reviews: MarketplaceReview[] }>('GET', 'my-profile/reviews')]);
    setProfile(p);
    setReviews(r);
  }, [call]);

  useEffect(() => {
    if (!servicesUrl) {
      return;
    }
    Promise.all([call<MarketplaceCatalog>('GET', 'catalog').then(setCatalog), reload()]).catch((err) =>
      showNotification({ color: 'red', message: normalizeErrorString(err) })
    );
  }, [call, reload, servicesUrl]);

  if (!servicesUrl) {
    return (
      <Document>
        <Alert color="yellow" title="The marketplace is not set up">
          This Afiax Provider has no afiax-services address (MEDPLUM_AFIAX_SERVICES_URL).
        </Alert>
      </Document>
    );
  }

  return (
    <Document>
      <Title order={2}>My marketplace profile</Title>
      <Text c="dimmed" mb="md">
        Patients find you in My Afiax with this profile and book into your clinic hours.
      </Text>
      {profile && catalog ? <ProfileForm key={profile.card?.id ?? 'new'} profile={profile} catalog={catalog} onSaved={reload} /> : null}
      {reviews ? (
        <Card withBorder padding="lg" mt="xl">
          <Group justify="space-between">
            <Title order={4}>Reviews from patients</Title>
            <Stars rating={reviews.rating} count={reviews.reviews.length} size={18} />
          </Group>
          {reviews.reviews.length === 0 ? (
            <Text c="dimmed" mt="sm">
              Patients can review a visit once it has happened. Their reviews will show here.
            </Text>
          ) : (
            <Stack mt="md" gap="sm">
              {reviews.reviews.map((r) => (
                <Card key={r.id} withBorder padding="sm">
                  <Group justify="space-between">
                    <Stars rating={r.rating} />
                    <Text size="xs" c="dimmed">
                      {r.author} · {r.visitType ? `${r.visitType} · ` : ''}
                      {new Date(r.date).toLocaleDateString()}
                    </Text>
                  </Group>
                  {r.comment ? <Text size="sm" mt={4}>{r.comment}</Text> : null}
                </Card>
              ))}
            </Stack>
          )}
        </Card>
      ) : null}
    </Document>
  );
}

function ProfileForm(props: { readonly profile: MyProfile; readonly catalog: MarketplaceCatalog; readonly onSaved: () => Promise<void> }): JSX.Element {
  const { call, asset } = useMarketplace();
  const { profile, catalog } = props;
  const card = profile.card;
  const [cadre, setCadre] = useState<string | null>(card?.cadre?.code ?? null);
  const [speciality, setSpeciality] = useState<string | null>(card?.speciality?.code ?? null);
  const [fee, setFee] = useState<number | string>(card?.feeKes ?? '');
  const [languages, setLanguages] = useState<string[]>(card?.languages ?? ['English', 'Kiswahili']);
  const [bio, setBio] = useState(card?.bio ?? '');
  const [registration, setRegistration] = useState(card?.registration?.value ?? '');
  const [body, setBody] = useState<string | null>(card?.registration?.system ?? null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const blocked = !profile.facilityListed || !profile.hasHours;
  const bodies = [...Object.values(catalog.regulators).map((r) => ({ value: r.code, label: `${r.code} — ${r.name}` })), { value: 'Other', label: 'Other' }];

  function chooseCadre(value: string | null): void {
    setCadre(value);
    // The body that licenses this cadre, unless they already chose one
    if (value && !registration.trim()) {
      setBody(catalog.cadreRegulator[value] ?? null);
    }
  }

  async function publish(): Promise<void> {
    setBusy(true);
    try {
      await call('POST', 'my-profile', {
        cadre,
        speciality: speciality ?? undefined,
        feeKes: fee === '' ? undefined : Number(fee),
        languages,
        bio,
        registration: registration.trim() ? { system: body ?? undefined, value: registration.trim() } : undefined,
      });
      showNotification({ color: 'green', message: profile.published ? 'Your profile is updated' : 'Your profile is published' });
      await props.onSaved();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setBusy(false);
    }
  }

  async function takeDown(): Promise<void> {
    try {
      await call('POST', 'my-profile/unpublish');
      showNotification({ color: 'green', message: 'Your profile is no longer in the marketplace' });
      await props.onSaved();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    }
  }

  async function upload(file: File | null): Promise<void> {
    if (!file) {
      return;
    }
    setUploading(true);
    try {
      await call('POST', 'my-profile/photo', { contentType: 'image/jpeg', data: await shrinkPhoto(file) });
      showNotification({ color: 'green', message: 'Your photo is updated' });
      await props.onSaved();
    } catch (err) {
      showNotification({ color: 'red', message: normalizeErrorString(err) });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card withBorder padding="lg">
      <Group justify="space-between">
        <Title order={4}>Profile</Title>
        <Badge color={profile.published ? 'green' : 'gray'}>{profile.published ? 'Published' : 'Not published'}</Badge>
      </Group>
      {!profile.facilityListed ? (
        <Alert color="yellow" mt="md">
          Your facility is not in the marketplace yet. Ask your facility admin.
        </Alert>
      ) : null}
      {!profile.hasHours ? (
        <Alert color="yellow" mt="md">
          Set your clinic hours first (Clinic hours): patients book into them.
        </Alert>
      ) : null}
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl" mt="md">
        <Stack>
          <Group>
            <Avatar src={asset(card?.photo)} size={72} radius="xl" color="blue" />
            <FileButton onChange={(f) => upload(f)} accept="image/png,image/jpeg,image/webp" disabled={!card}>
              {(p) => (
                <Button {...p} variant="light" leftSection={<IconCamera size={16} />} loading={uploading} disabled={!card}>
                  {card?.photo ? 'Change photo' : 'Add a photo'}
                </Button>
              )}
            </FileButton>
            {!card ? (
              <Text size="xs" c="dimmed">
                Publish first, then add a photo.
              </Text>
            ) : null}
          </Group>
          <Select label="Cadre" required data={Object.entries(catalog.cadres).map(([value, label]) => ({ value, label }))} value={cadre} onChange={chooseCadre} />
          <Select
            label="Speciality"
            data={Object.entries(catalog.specialities).map(([value, label]) => ({ value, label }))}
            value={speciality}
            onChange={setSpeciality}
            searchable
            clearable
          />
          <NumberInput label="Consultation fee (KES)" min={0} max={100000} value={fee} onChange={setFee} thousandSeparator="," />
          <MultiSelect label="Languages" data={Languages} value={languages} onChange={setLanguages} searchable />
          <Textarea label="About you (patients see this)" autosize minRows={3} maxLength={1000} value={bio} onChange={(e) => setBio(e.currentTarget.value)} />
          <Select label="Registered with" data={bodies} value={body} onChange={setBody} searchable />
          <TextInput
            label="Registration number"
            description="Your facility admin checks it against the register; patients then see it as checked."
            value={registration}
            onChange={(e) => setRegistration(e.currentTarget.value)}
          />
          <Text size="sm" c="dimmed">
            Publishing lists you in the Afiax marketplace with this profile, your photo, your facility and your clinic hours.
            It is your consent to be listed; you can take it down at any time.
          </Text>
          <Group>
            <Button loading={busy} disabled={blocked || !cadre} onClick={() => publish()}>
              {profile.published ? 'Update my profile' : 'Publish my profile'}
            </Button>
            {profile.published ? (
              <Button variant="light" color="red" onClick={() => takeDown()}>
                Take it down
              </Button>
            ) : null}
          </Group>
        </Stack>
        <Stack gap={4}>
          <Text size="sm" fw={600} c="dimmed">
            Patients see
          </Text>
          {card ? (
            <ProviderCardPreview card={card} visitTypes={catalog.visitTypes} asset={asset} />
          ) : (
            <Text size="sm" c="dimmed">
              Your card shows here once you publish.
            </Text>
          )}
          {card?.bio ? (
            <Text size="sm" mt="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {card.bio}
            </Text>
          ) : null}
          {card?.languages.length ? (
            <Text size="sm" c="dimmed">
              Speaks {card.languages.join(', ')}
            </Text>
          ) : null}
        </Stack>
      </SimpleGrid>
    </Card>
  );
}
