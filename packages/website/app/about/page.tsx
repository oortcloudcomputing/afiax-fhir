// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { Container, DescriptionList, DescriptionListEntry, Panel } from '../../components/medplum-ui';
import { MetricStrip } from '../../components/metric-strip';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';
import { aboutMetrics, aboutPillars, teamPrinciples } from '../../lib/experience-content';
import { companyModelEntries } from '../../lib/site-content';

export default function AboutPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="About Afiax"
        title="An enterprise digital health company shaped around interoperable care, managed delivery, and real-world rollout."
        body="Afiax brings together clinical systems, interoperability services, device programs, and managed operations so healthcare organizations can move from fragmented tooling to one coordinated enterprise operating environment."
        note={{
          eyebrow: 'Company position',
          title: 'Built for the platform, the rollout, and the field environment.',
          body: 'The Afiax story is not only software. It is software, country-aware interoperability, devices, migration, onboarding, and managed operations presented as one enterprise program.',
          items: ['Canonical FHIR foundation', 'Country-pack execution model', 'Phone, tablet, and large-screen operating surfaces'],
        }}
        actions={[
          { href: '/solutions', label: 'Explore solutions' },
          { href: '/devices', label: 'Explore devices', variant: 'secondary' },
        ]}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <MetricStrip items={aboutMetrics} />
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="What defines Afiax"
            title="A corporate posture built around open architecture and practical delivery."
            description="The public company story works best when it shows how Afiax connects software, infrastructure, devices, and operational rollout into one healthcare enterprise program."
          />
          <div className="highlight-grid">
            {aboutPillars.map((pillar) => (
              <Panel key={pillar.title} className="highlight-card corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">{pillar.eyebrow}</p>
                <h3>{pillar.title}</h3>
                <p>{pillar.body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <div>
            <SectionHeading
              eyebrow="Enterprise footprint"
              title="Show the platform through operating surfaces, not decorative mockups."
              description="Afiax is positioned as a connected enterprise environment across clinical workstations, tablets, patient channels, market services, and managed operations."
            />
            <div className="pill-row">
              <span className="info-pill">Clinical workstations</span>
              <span className="info-pill">Consultation tablets</span>
              <span className="info-pill">Operations consoles</span>
            </div>
          </div>
          <Panel className="voice-rule-list corporate-panel" m={0} p="xl" radius="xl">
            <p className="eyebrow">Operational surfaces</p>
            <div className="stacked-copy">
              <h3>Clinical applications</h3>
              <p>Afiax EHR, portals, tele-health, remote care, imaging, and financial services operate on one coordinated clinical platform.</p>
            </div>
            <div className="stacked-copy">
              <h3>Country-aware services</h3>
              <p>Country packs, registry workflows, claims rails, terminology, and interoperability services extend the same platform across markets.</p>
            </div>
            <div className="stacked-copy">
              <h3>Managed enterprise delivery</h3>
              <p>Domain onboarding, migration, ERPNext handoff, training, device programs, and support stay inside one enterprise operating model.</p>
            </div>
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <Panel className="detail-list-card corporate-panel" m={0} p="xl" radius="xl">
            <p className="eyebrow">Operating model</p>
            <DescriptionList>
              {companyModelEntries.map((entry) => (
                <DescriptionListEntry key={entry.term} term={entry.term}>
                  {entry.description}
                </DescriptionListEntry>
              ))}
            </DescriptionList>
          </Panel>
          <Panel className="voice-rule-list corporate-panel" m={0} p="xl" radius="xl">
            <p className="eyebrow">How the company works</p>
            {teamPrinciples.map((principle) => (
              <div key={principle.title} className="stacked-copy">
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </div>
            ))}
            <Link href="/team" className="card-link">
              Explore the team model
            </Link>
          </Panel>
        </Container>
      </section>
    </>
  );
}
