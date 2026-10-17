// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export type HeroArtworkVariant =
  | 'overview'
  | 'solutions'
  | 'platform'
  | 'pricing'
  | 'about'
  | 'team'
  | 'devices'
  | 'developers'
  | 'migration'
  | 'onboarding'
  | 'country-packs'
  | 'delivery'
  | 'blog'
  | 'company'
  | 'product';

export function resolveHeroArtworkVariant(eyebrow: string): HeroArtworkVariant {
  const normalized = eyebrow.toLowerCase();

  if (normalized.includes('solution')) {
    return 'solutions';
  }
  if (normalized.includes('platform')) {
    return 'platform';
  }
  if (normalized.includes('pricing')) {
    return 'pricing';
  }
  if (normalized.includes('about')) {
    return 'about';
  }
  if (normalized.includes('team')) {
    return 'team';
  }
  if (normalized.includes('device')) {
    return 'devices';
  }
  if (normalized.includes('developer')) {
    return 'developers';
  }
  if (normalized.includes('migration')) {
    return 'migration';
  }
  if (normalized.includes('get started') || normalized.includes('erpnext')) {
    return 'onboarding';
  }
  if (normalized.includes('country')) {
    return 'country-packs';
  }
  if (normalized.includes('delivery')) {
    return 'delivery';
  }
  if (normalized.includes('company')) {
    return 'company';
  }
  if (normalized.includes('enterprise solution') || normalized.includes('platform service')) {
    return 'product';
  }

  return 'overview';
}
