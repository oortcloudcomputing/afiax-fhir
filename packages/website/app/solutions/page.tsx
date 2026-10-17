// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { HeroArtwork } from '../../components/hero-artwork';
import { BillingViewToggle } from '../../components/site-controls';
import { Container, DescriptionList, DescriptionListEntry, Panel } from '../../components/medplum-ui';
import { PageHero } from '../../components/page-hero';
import { PriceTag } from '../../components/price-tag';
import { SectionHeading } from '../../components/section-heading';
import { applicationProducts, getProductHref, platformProducts, productMetrics } from '../../lib/product-catalog';
import { solutionOutcomeEntries } from '../../lib/site-content';

export default function SolutionsPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Solutions"
        title="Solutions to solve complex healthcare challenges"
        body="Deep healthcare data expertise powers our intelligent solutions, delivering near real-time insights that help enhance care and enable smart decisions."
        note={{
          eyebrow: 'Solution posture',
          title: 'Support holistic patient care',
          body: 'Deep healthcare data expertise powers our intelligent solutions, delivering near real-time insights that help enhance care and enable smart decisions.The Afiax Clinical Suite packs all you need to transform your Healthcare Enterprise',
          items: ['Patient Portals', 'Tele-Health', 'Healthcare Financial Services', 'Medical Imaging'],
        }}
        actions={[
          { href: '/pricing', label: 'View pricing' },
          { href: '/platform', label: 'Explore platform model', variant: 'secondary' },
        ]}
        metrics={productMetrics}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <div>
            <SectionHeading
              eyebrow="Visual platform story"
              title="Show the suite as one connected digital health estate."
              description="The product family should feel coordinated across care delivery, patient access, automation, interoperability, and managed operations before buyers even enter the product-level pages."
            />
            <div className="pill-row">
              <span className="info-pill">Clinical workflows</span>
              <span className="info-pill">Patient experience</span>
              <span className="info-pill">Cloud operations</span>
            </div>
          </div>
          <Panel className="corporate-panel artwork-panel" m={0} p="lg" radius="xl">
            <HeroArtwork variant="solutions" title="Afiax solutions across care, access, and enterprise operations." compact />
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Application portfolio"
            title="Afiax Clinical Suite Modules"
            description="Deep healthcare data expertise powers our intelligent solutions, delivering near real-time insights that help enhance care and enable smart decisions.The Afiax Clinical Suite packs all you need to transform your Healthcare Enterprise"
          />
          <div className="section-toolbar">
            <BillingViewToggle label="Application pricing" />
          </div>
          <div className="highlight-grid">
            {applicationProducts.map((product) => (
              <Panel key={product.title} className="highlight-card pathway-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
                <div className="pricing-card-header">
                  <p className="eyebrow">{product.category}</p>
                  <PriceTag price={product.price} unit={product.unit} />
                </div>
                <h3>{product.title}</h3>
                <p>{product.summary}</p>
                <p className="muted-copy">{product.description}</p>
                <Link href={getProductHref(product.title)} className="card-link">
                  View product page
                </Link>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Health-platform services"
            title="Interoperability solutions for Open, connected ecosystems"
            description="Enable collaborative third-party relationships and seamless data exchange. Equip providers with comprehensive patient information while giving developers the tools and training to focus on advancing healthcare innovation."
          />
          <div className="section-toolbar">
            <BillingViewToggle label="Platform pricing" />
          </div>
          <div className="highlight-grid">
            {platformProducts.map((product) => (
              <Panel key={product.title} className="highlight-card pathway-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
                <div className="pricing-card-header">
                  <p className="eyebrow">{product.category}</p>
                  <PriceTag price={product.price} unit={product.unit} />
                </div>
                <h3>{product.title}</h3>
                <p>{product.summary}</p>
                <p className="muted-copy">{product.description}</p>
                <Link href={getProductHref(product.title)} className="card-link">
                  View product page
                </Link>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout">
          <div>
            <SectionHeading
              eyebrow="Enterprise value"
              title="Why the connected-platform model matters operationally."
              description="Afiax connects platform structure to the outcomes executives actually care about: coordination, compliance, reimbursement integrity, and deployment control."
            />
            <Link href="/pricing" className="card-link inline-link">
              Review commercial model
            </Link>
          </div>
          <Panel className="detail-list-card corporate-panel" m={0} p="xl" radius="xl">
            <DescriptionList>
              {solutionOutcomeEntries.map((entry) => (
                <DescriptionListEntry key={entry.term} term={entry.term}>
                  {entry.description}
                </DescriptionListEntry>
              ))}
            </DescriptionList>
          </Panel>
        </Container>
      </section>
    </>
  );
}
