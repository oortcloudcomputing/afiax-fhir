// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Shared by the marketplace pages (ADR-018 §B): the afiax-services /directory API, the card patients
// see, the licensing body badge and star ratings.
import { Avatar, Badge, Card, Group, Image, Stack, Text, Tooltip } from '@mantine/core';
import { IconRosetteDiscountCheckFilled, IconStar, IconStarFilled } from '@tabler/icons-react';
import type { JSX } from 'react';
import type { MarketplaceCard } from './marketplaceApi';

/**
 * Stars out of 5, with the number of reviews.
 * @param props - The rating and how many reviews.
 * @param props.rating - The average, 1 to 5.
 * @param props.count - How many reviews.
 * @param props.size - Icon size.
 * @returns The stars.
 */
export function Stars(props: { readonly rating?: number; readonly count?: number; readonly size?: number }): JSX.Element {
  const size = props.size ?? 14;
  if (!props.rating) {
    return (
      <Text size="xs" c="dimmed">
        No reviews yet
      </Text>
    );
  }
  return (
    <Group gap={2} wrap="nowrap">
      {[1, 2, 3, 4, 5].map((n) =>
        n <= Math.round(props.rating ?? 0) ? (
          <IconStarFilled key={n} size={size} color="var(--mantine-color-yellow-6)" />
        ) : (
          <IconStar key={n} size={size} color="var(--mantine-color-gray-5)" />
        )
      )}
      <Text size="xs" ml={4}>
        {props.rating.toFixed(1)}
        {props.count !== undefined ? ` (${props.count})` : ''}
      </Text>
    </Group>
  );
}

/**
 * "Registered with" badge: the licensing body's logo, the number, and whether the facility checked it.
 * @param props - The registration.
 * @param props.registration - The registration on the card.
 * @param props.asset - Turns an afiax-services path into a URL.
 * @param props.compact - Smaller, for tables.
 * @returns The badge.
 */
export function RegistrationBadge(props: {
  readonly registration?: MarketplaceCard['registration'];
  readonly asset: (path?: string) => string | undefined;
  readonly compact?: boolean;
}): JSX.Element | null {
  const reg = props.registration;
  if (!reg?.value) {
    return null;
  }
  const logo = props.asset(reg.body?.logo);
  return (
    <Tooltip label={reg.verified ? `Checked by the facility against the ${reg.body?.name ?? 'register'}` : 'Not yet checked by the facility'}>
      <Group gap={6} wrap="nowrap">
        {logo ? <Image src={logo} alt={reg.body?.name ?? reg.system} h={props.compact ? 18 : 26} w="auto" fit="contain" /> : null}
        <Text size="xs" fw={600}>
          {reg.body?.code ?? reg.system} {reg.value}
        </Text>
        {reg.verified ? (
          <IconRosetteDiscountCheckFilled size={16} color="var(--mantine-color-green-6)" aria-label="verified" />
        ) : (
          <Text size="xs" c="dimmed">
            not yet checked
          </Text>
        )}
      </Group>
    </Tooltip>
  );
}

/**
 * The card as patients see it in My Afiax.
 * @param props - The card.
 * @param props.card - The provider card.
 * @param props.visitTypes - Names of the kinds of visit.
 * @param props.asset - Turns an afiax-services path into a URL.
 * @returns The card.
 */
export function ProviderCardPreview(props: {
  readonly card: MarketplaceCard;
  readonly visitTypes: Record<string, string>;
  readonly asset: (path?: string) => string | undefined;
}): JSX.Element {
  const { card } = props;
  return (
    <Card withBorder padding="md" radius="md">
      <Group align="flex-start" wrap="nowrap">
        <Avatar src={props.asset(card.photo)} size={64} radius="xl" color="blue">
          {card.name
            .split(' ')
            .map((w) => w.charAt(0))
            .slice(0, 2)
            .join('')}
        </Avatar>
        <Stack gap={2} style={{ minWidth: 0 }}>
          <Text fw={700}>{card.name}</Text>
          <Text size="sm">{[card.cadre?.display, card.speciality?.display].filter(Boolean).join(' · ')}</Text>
          <Text size="sm" c="dimmed">
            {card.facility.name}
            {card.facility.county ? `, ${card.facility.county}` : ''}
          </Text>
          <Stars rating={card.rating} count={card.reviews} />
        </Stack>
      </Group>
      <Group gap={4} mt="sm">
        {card.visitTypes.map((v) => (
          <Badge key={v} size="xs" variant="light">
            {props.visitTypes[v] ?? v}
          </Badge>
        ))}
      </Group>
      {card.feeKes !== undefined ? (
        <Text fw={700} mt={6}>
          KES {card.feeKes.toLocaleString()}
        </Text>
      ) : null}
      <Stack mt={6} gap={4}>
        <RegistrationBadge registration={card.registration} asset={props.asset} />
      </Stack>
    </Card>
  );
}
