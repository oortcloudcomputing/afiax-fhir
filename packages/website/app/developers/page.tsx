// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { HeroArtwork } from '../../components/hero-artwork';
import { Container, DescriptionList, DescriptionListEntry, Panel } from '../../components/medplum-ui';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';
import { StatusBadge } from '../../components/status-badge';
import { developerAssets, developerMetrics, developerModelEntries, implementationStates } from '../../lib/site-content';

export default function DevelopersPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Developers"
        title="Build country-aware health workflows without forking the clinical core."
        body="The repo centers on Afiax FHIR, pack-aware operations, and an enterprise platform boundary built for extension through explicit contracts rather than hidden national assumptions."
        note={{
          eyebrow: 'Developer model',
          title: 'Canonical core first, market logic second.',
          body: 'The implementation model keeps national integrations, payer rails, and enterprise services outside the canonical record while still writing normalized outcomes back into it.',
          items: ['Generic operations with pack-aware dispatch', 'Workflow evidence as first-class output', 'Country-pack execution across market services'],
        }}
        actions={[
          { href: '/country-packs', label: 'Review pack model' },
          { href: '/delivery', label: 'Review platform capabilities', variant: 'secondary' },
        ]}
        metrics={developerMetrics}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <div>
            <SectionHeading
              eyebrow="Developer visual"
              title="Let builders see the platform contract before they read the card deck."
              description="The developer surface should visually signal APIs, country-aware execution, and controlled extension boundaries so the narrative feels concrete from the first scroll."
            />
            <div className="pill-row">
              <span className="info-pill">FHIR core</span>
              <span className="info-pill">Pack-aware dispatch</span>
              <span className="info-pill">Governed extension model</span>
            </div>
          </div>
          <Panel className="corporate-panel artwork-panel" m={0} p="lg" radius="xl">
            <HeroArtwork variant="developers" title="Afiax for builders extending health workflows without forking the core." compact />
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Engineering assets"
            title="The developer narrative points to a real platform shape."
            description="A credible developer narrative highlights the canonical core, pack-aware integration model, market conformance, and enterprise services that operate around the platform."
          />
          <div className="highlight-grid">
            {developerAssets.map((asset) => (
              <Panel key={asset.title} className="highlight-card pathway-card corporate-panel" m={0} p="xl" radius="xl">
                <div className="card-topline">
                  <StatusBadge state={asset.state} />
                </div>
                <h3>{asset.title}</h3>
                <p>{asset.summary}</p>
                <p className="muted-copy">{asset.detail}</p>
                <Link href={asset.href} className="card-link">
                  {asset.cta}
                </Link>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container two-column-layout">
          <div>
            <SectionHeading
              eyebrow="Engineering model"
              title="Make the implementation contract legible."
              description="The more explicit the platform boundary is, the easier it becomes to grow market integrations and enterprise services without breaking the core."
            />
            <Link href="/platform" className="card-link inline-link">
              Revisit the platform boundary
            </Link>
          </div>
          <Panel className="detail-list-card corporate-panel" m={0} p="xl" radius="xl">
            <DescriptionList>
              {developerModelEntries.map((entry) => (
                <DescriptionListEntry key={entry.term} term={entry.term}>
                  {entry.description}
                </DescriptionListEntry>
              ))}
            </DescriptionList>
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Capability lanes"
            title="The most important platform and market capabilities are visible."
            description="The engineering narrative can show canonical core, market execution, and enterprise services without fragmenting the broader platform story."
          />
          <div className="highlight-grid">
            {implementationStates.enterprise.map((item) => (
              <Panel key={item.title} className="highlight-card corporate-panel" m={0} p="xl" radius="xl">
                <div className="card-topline">
                  <StatusBadge state={item.state} />
                </div>
                <h3>{item.title}</h3>
                <p>{item.summary}</p>
                <p className="muted-copy">{item.detail}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
