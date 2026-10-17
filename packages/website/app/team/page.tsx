// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { Container, Panel } from '../../components/medplum-ui';
import { MetricStrip } from '../../components/metric-strip';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';
import { teamMetrics, teamPrinciples, teamUnits } from '../../lib/experience-content';

export default function TeamPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Team"
        title="Cross-functional teams aligned around rollout, interoperability, and managed enterprise operations."
        body="Afiax is structured so clinical transformation, platform engineering, country interoperability, migration, and device enablement reinforce one delivery program rather than competing workstreams."
        note={{
          eyebrow: 'Team posture',
          title: 'Built to move customers from planning to live operations.',
          body: 'The team model is designed to carry customers through readiness, migration, configuration, onboarding, device setup, launch, and managed support.',
          items: ['Clinical and workflow transformation', 'Platform and country-pack engineering', 'Migration, service operations, and field enablement'],
        }}
        actions={[
          { href: '/get-started', label: 'Start onboarding' },
          { href: '/developers', label: 'View developer path', variant: 'secondary' },
        ]}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <MetricStrip items={teamMetrics} />
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Operating teams"
            title="Each team owns a visible part of the delivery path."
            description="This page uses functional teams instead of invented biographies so the public site stays accurate while still showing how Afiax executes."
          />
          <div className="highlight-grid">
            {teamUnits.map((unit) => (
              <Panel key={unit.title} className="highlight-card pathway-card corporate-panel" m={0} p="xl" radius="xl">
                <div className="team-avatar">{unit.title.slice(0, 2).toUpperCase()}</div>
                <h3>{unit.title}</h3>
                <p>{unit.summary}</p>
                <ul className="dense-list">
                  {unit.focus.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <Panel className="voice-rule-list corporate-panel" m={0} p="xl" radius="xl">
            <p className="eyebrow">Execution principles</p>
            {teamPrinciples.map((principle) => (
              <div key={principle.title} className="stacked-copy">
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </div>
            ))}
          </Panel>
          <Panel className="voice-rule-list corporate-panel team-callout-card" m={0} p="xl" radius="xl">
            <p className="eyebrow">Where the team lands</p>
            <h3>Afiax is delivered as a coordinated operating program.</h3>
            <p>
              Customers should see one joined-up path from domain registration and migration planning to product rollout,
              device enablement, and managed support.
            </p>
            <div className="pill-row">
              <span className="info-pill">Readiness and migration</span>
              <span className="info-pill">Country-aware rollout</span>
              <span className="info-pill">Managed post-go-live operations</span>
            </div>
            <Link href="/devices" className="card-link">
              Review device enablement
            </Link>
          </Panel>
        </Container>
      </section>
    </>
  );
}
