// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

import type { HeroArtworkVariant } from '../lib/hero-artwork';

interface ArtworkTheme {
  readonly kicker: string;
  readonly tags: readonly string[];
}

const artworkThemes: Record<HeroArtworkVariant, ArtworkTheme> = {
  overview: {
    kicker: 'Connected Digital Health',
    tags: ['FHIR core', 'Care operations', 'Patient access'],
  },
  solutions: {
    kicker: 'Enterprise Product Suite',
    tags: ['Clinical suite', 'Virtual care', 'Revenue flows'],
  },
  platform: {
    kicker: 'Platform Fabric',
    tags: ['Canonical FHIR', 'Country packs', 'Evidence model'],
  },
  pricing: {
    kicker: 'Commercial Architecture',
    tags: ['SaaS', 'Managed PaaS', 'ERPNext billing'],
  },
  about: {
    kicker: 'Pan-African Health Platform',
    tags: ['Open foundation', 'Managed delivery', 'Digital estates'],
  },
  team: {
    kicker: 'Execution Teams',
    tags: ['Clinical', 'Interoperability', 'Service ops'],
  },
  devices: {
    kicker: 'Afiax Device Layer',
    tags: ['Phone kits', 'Ward tablets', 'Diagnostic displays'],
  },
  developers: {
    kicker: 'Builder Path',
    tags: ['APIs', 'Integrations', 'Country runtime'],
  },
  migration: {
    kicker: 'Migration Flows',
    tags: ['OpenMRS', 'KenyaEMR', 'Structured cutover'],
  },
  onboarding: {
    kicker: 'Commercial Intake',
    tags: ['Domain check', 'Lead capture', 'ERPNext handoff'],
  },
  'country-packs': {
    kicker: 'Jurisdictional Adaptation',
    tags: ['Registries', 'Terminology', 'Claims rails'],
  },
  delivery: {
    kicker: 'Capability Model',
    tags: ['Platform', 'Market', 'Enterprise'],
  },
  blog: {
    kicker: 'Afiax Journal',
    tags: ['Field lessons', 'Platform thinking', 'Digital health operations'],
  },
  company: {
    kicker: 'Corporate Narrative',
    tags: ['Market context', 'Execution path', 'Managed growth'],
  },
  product: {
    kicker: 'Connected Product Surface',
    tags: ['Operational outcomes', 'Commercial fit', 'Deployment stance'],
  },
};

export function HeroArtwork(props: {
  readonly variant: HeroArtworkVariant;
  readonly title: string;
  readonly compact?: boolean;
}): JSX.Element {
  const { variant, title, compact = false } = props;
  const theme = artworkThemes[variant];

  return (
    <div className={compact ? `hero-artwork is-compact` : 'hero-artwork'}>
      <div className="hero-artwork-overlay hero-artwork-copy-only">
        <p className="hero-artwork-kicker">{theme.kicker}</p>
        <h3>{title}</h3>
        <p className="hero-artwork-summary">
          Afiax brings applications, country-aware services, and managed enterprise operations together on one
          coordinated healthcare platform.
        </p>
        <div className="hero-artwork-tag-row">
          {theme.tags.map((tag) => (
            <span key={tag} className="hero-artwork-tag">
              {tag}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
