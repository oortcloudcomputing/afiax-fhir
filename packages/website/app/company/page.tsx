// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { HeroArtwork } from '../../components/hero-artwork';
import { MetricStrip } from '../../components/metric-strip';
import { Container, DescriptionList, DescriptionListEntry, Panel } from '../../components/medplum-ui';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';
import { companyCommitments, companyMetrics, companyModelEntries, websiteVoiceRules } from '../../lib/site-content';

export default function CompanyPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Company"
        title="A pan-African enterprise health platform company with country-aware execution."
        body="Afiax is an enterprise healthcare platform company built on a canonical FHIR foundation, country-pack market services, and managed enterprise operations across the wider portfolio."
        note={{
          eyebrow: 'Corporate stance',
          title: 'Operate one connected enterprise portfolio.',
          body: 'The corporate narrative is strongest when the company is shown as execution-led, regionally aware, and capable across applications, market services, and managed operations.',
          items: ['Pan-African platform architecture', 'Country-aware enterprise execution', 'Managed expansion across the portfolio'],
        }}
        actions={[
          { href: '/solutions', label: 'Explore solutions' },
          { href: '/developers', label: 'Explore developer path', variant: 'secondary' },
        ]}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <MetricStrip items={companyMetrics} />
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <div>
          <SectionHeading
            eyebrow="Corporate framing"
            title="Make the market story feel operational, not aspirational."
            description="The strongest company page shows pan-African ambition, market execution, and managed expansion through a designed visual layer rather than plain claims."
          />
          <div className="pill-row">
            <span className="info-pill">Pan-African scope</span>
            <span className="info-pill">Country-aware execution</span>
            <span className="info-pill">Managed expansion path</span>
          </div>
          </div>
          <Panel className="corporate-panel artwork-panel" m={0} p="lg" radius="xl">
            <HeroArtwork variant="company" title="Afiax positioned as an execution-led health platform company." compact />
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="What the company is building"
            title="The company narrative stays anchored to platform reality."
            description="The site can be ambitious and enterprise-grade while still grounding the story in the actual platform shape, market services, and enterprise operations."
          />
          <div className="highlight-grid">
            {companyCommitments.map((item) => (
              <Panel key={item.title} className="highlight-card corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">{item.eyebrow}</p>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container two-column-layout">
          <div>
          <SectionHeading
            eyebrow="Operating stance"
            title="The company story is explicit about geography, scope, and delivery."
            description="A Fortune 500-style corporate presentation works better when it is clear about market context, platform boundary, and communications discipline."
          />
          <Link href="/delivery" className="card-link inline-link">
              Review platform capabilities
          </Link>
          </div>
          <Panel className="detail-list-card corporate-panel" m={0} p="xl" radius="xl">
            <DescriptionList>
              {companyModelEntries.map((entry) => (
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
            eyebrow="Voice discipline"
            title="Keep the corporate tone calm, executive, and specific."
            description="The goal is an enterprise healthcare platform voice that feels credible to buyers, partners, and developers because it stays precise about scope and maturity."
          />
          <Panel className="voice-rule-list corporate-panel" m={0} p="xl" radius="xl">
            {websiteVoiceRules.map((rule) => (
              <p key={rule}>{rule}</p>
            ))}
          </Panel>
        </Container>
      </section>
    </>
  );
}
