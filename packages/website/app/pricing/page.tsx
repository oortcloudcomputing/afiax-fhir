// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { HeroArtwork } from '../../components/hero-artwork';
import { Container, DescriptionList, DescriptionListEntry, Panel } from '../../components/medplum-ui';
import { PageHero } from '../../components/page-hero';
import { PriceTag } from '../../components/price-tag';
import { PricingExplorer } from '../../components/pricing-explorer';
import { SectionHeading } from '../../components/section-heading';
import {
  applicationProducts,
  erpnextBillingFlow,
  getProductHref,
  paasDeploymentLabels,
  paasDeploymentProfiles,
  pricingPlanOffers,
  platformProducts,
  pricingBundles,
  pricingMetrics,
  pricingPrinciples,
} from '../../lib/product-catalog';

export default function PricingPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        title="Enterprise SaaS and platform pricing for connected healthcare delivery."
        body="Afiax pricing is structured around application subscriptions for operational products and managed platform pricing for Afiax FHIR, country packs, integrations, data, and cloud operations across Afiax Public Cloud, Hybrid, and Private Afiax Cloud."
        note={{
          eyebrow: 'Commercial approach',
          title: 'Simple starting prices, enterprise commercial discipline.',
          body: 'Application products are priced by provider, facility, learner, or patient volume. Platform products are priced by managed deployment model, environment, country, connector, device, and usage. Every PaaS offer includes Afiax-managed operations plus complimentary tablets, displays, and activation devices sized to the tier.',
          items: ['Enterprise annual agreements', 'Volume discounts as you scale', 'Managed public, hybrid, private, and sovereign deployment options'],
        }}
        actions={[
          { href: 'mailto:info@afiax.africa', label: 'Request enterprise quote' },
          { href: '/solutions', label: 'Explore solutions', variant: 'secondary' },
        ]}
        metrics={pricingMetrics}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <div>
            <SectionHeading
              eyebrow="Commercial visual"
              title="Present pricing as a designed commercial system, not a spreadsheet dump."
              description="The pricing page should reinforce managed delivery, deployment choice, included devices, and ERPNext operating discipline before the user compares plans."
            />
            <div className="pill-row">
              <span className="info-pill">SaaS and managed PaaS</span>
              <span className="info-pill">Devices included</span>
              <span className="info-pill">ERPNext-ready packaging</span>
            </div>
          </div>
          <Panel className="corporate-panel artwork-panel" m={0} p="lg" radius="xl">
            <HeroArtwork variant="pricing" title="Commercial architecture for Afiax SaaS and managed platform delivery." compact />
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Plan explorer"
            title="Switch between SaaS and managed PaaS, then compare Basic, Pro, and Platinum."
            description="Use the commercial toggles to compare the recommended offering mix and a normalized hourly or monthly budget view. PaaS also differentiates between Afiax Public Cloud, Hybrid, and Private Afiax Cloud delivery."
          />
          <PricingExplorer />
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Managed deployment models"
            title="Every Afiax PaaS offer is managed, but the cloud boundary changes with your operating model."
            description="Choose Afiax Public Cloud for speed, Hybrid for mixed-boundary modernization, or Private Afiax Cloud for stronger isolation and private-network controls. Every model includes complimentary tablets, displays, and digital health activation hardware."
          />
          <div className="highlight-grid">
            {paasDeploymentProfiles.map((profile) => (
              <Panel key={profile.model} className="highlight-card pathway-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
                <div className="pricing-card-header">
                  <div>
                    <p className="eyebrow">{profile.badge}</p>
                    <h3>{profile.title}</h3>
                  </div>
                  <span className="info-pill">{paasDeploymentLabels[profile.model]}</span>
                </div>
                <p>{profile.summary}</p>
                <p className="muted-copy">{profile.audience}</p>
                <ul className="dense-list pricing-feature-list">
                  {profile.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="ERPNext billing map"
            title="The pricing guide maps directly to ERPNext, which will own quoting and invoicing."
            description="Each public plan has a clear ERPNext item code, item group, subscription plan, invoice cadence, deployment model, and usage-SKU pattern so commercial packaging, fulfillment, and finance operations stay aligned."
          />
          <div className="highlight-grid">
            {pricingPlanOffers.map((offer) => (
              <Panel
                key={`${offer.track}-${offer.tier}-${offer.deployment ?? 'standard'}`}
                className="highlight-card pathway-card corporate-panel pricing-card"
                m={0}
                p="xl"
                radius="xl"
              >
                <div className="pricing-card-header">
                  <p className="eyebrow">
                    {offer.badge}
                    {offer.deployment ? ` · ${paasDeploymentLabels[offer.deployment]}` : ''}
                  </p>
                  <div className="price-lockup">
                    <span className="price-amount">{offer.erpnext.itemCode}</span>
                    <span className="price-unit">{offer.erpnext.itemGroup}</span>
                  </div>
                </div>
                <h3>{offer.title}</h3>
                <p>{offer.erpnext.subscriptionPlan}</p>
                {offer.managedModel ? <p className="muted-copy">{offer.managedModel}</p> : null}
                <p className="muted-copy">{offer.erpnext.invoiceCadence}</p>
                <ul className="dense-list pricing-feature-list">
                  {offer.erpnext.usageItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Platform bundles"
            title="Choose the commercial model that matches your operating scale."
            description="These starting bundles are designed for enterprise launches. Managed public, hybrid, private, national, and sovereign models are tailored around deployment isolation, residency, support, interoperability scope, and activation hardware."
          />
          <div className="highlight-grid">
            {pricingBundles.map((bundle) => (
              <Panel key={bundle.title} className="highlight-card pathway-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
                <div className="pricing-card-header">
                  <p className="eyebrow">{bundle.badge}</p>
                  <PriceTag price={bundle.price} unit={bundle.unit} />
                </div>
                <h3>{bundle.title}</h3>
                <p>{bundle.summary}</p>
                <p className="muted-copy">{bundle.audience}</p>
                <ul className="dense-list pricing-feature-list">
                  {bundle.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="SaaS applications"
            title="Application pricing for the Afiax clinical and operational product family."
            description="These prices cover the enterprise application layer, including care delivery, patient engagement, virtual care, imaging, revenue, training, workforce, and AI-assisted workflows."
          />
          <div className="highlight-grid">
            {applicationProducts.map((product) => (
              <Panel key={product.title} className="highlight-card pathway-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
                <div className="pricing-card-header">
                  <p className="eyebrow">{product.category}</p>
                  <PriceTag price={product.price} unit={product.unit} />
                </div>
                <h3>{product.title}</h3>
                <p>{product.summary}</p>
                <p className="muted-copy">{product.commitment}</p>
                <ul className="dense-list pricing-feature-list">
                  {product.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Link href={getProductHref(product.title)} className="card-link">
                  View product page
                </Link>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="PaaS and managed services"
            title="Managed platform pricing for interoperability, cloud operations, and regulated delivery."
            description="These commercial models support the canonical FHIR core, country-aware execution, analytics, Medical I.O.T, integrations, and managed service operations across Afiax Public Cloud, Hybrid, and Private Afiax Cloud. Complimentary tablets, displays, and digital health starter devices are included with PaaS agreements."
          />
          <div className="highlight-grid">
            {platformProducts.map((product) => (
              <Panel key={product.title} className="highlight-card pathway-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
                <div className="pricing-card-header">
                  <p className="eyebrow">{product.category}</p>
                  <PriceTag price={product.price} unit={product.unit} />
                </div>
                <h3>{product.title}</h3>
                <p>{product.summary}</p>
                <p className="muted-copy">{product.commitment}</p>
                <ul className="dense-list pricing-feature-list">
                  {product.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <Link href={getProductHref(product.title)} className="card-link">
                  View product page
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
              eyebrow="ERPNext operating rules"
              title="Keep billing logic open and traceable from public pricing into ERPNext."
              description="ERPNext should remain the billing system of record, while the public pricing guide stays aligned to the same plan, add-on, and finance structure."
            />
          </div>
          <Panel className="detail-list-card corporate-panel" m={0} p="xl" radius="xl">
            <DescriptionList>
              {erpnextBillingFlow.map((entry) => (
                <DescriptionListEntry key={entry.term} term={entry.term}>
                  {entry.description}
                </DescriptionListEntry>
              ))}
            </DescriptionList>
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container two-column-layout">
          <div>
            <SectionHeading
              eyebrow="Commercial rules"
              title="What is included, what scales with usage, and what is quoted separately."
              description="Afiax pricing is designed to be readable at the website level while still supporting country-specific integrations, enterprise security requirements, and large-scale deployment patterns."
            />
          </div>
          <Panel className="detail-list-card corporate-panel" m={0} p="xl" radius="xl">
            <DescriptionList>
              {pricingPrinciples.map((entry) => (
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
          <Panel className="note-card corporate-panel" m={0} p="xl" radius="xl">
            <p className="eyebrow">Commercial note</p>
            <p>
              Pricing reflects starting commercial positions for enterprise rollout as of March 21, 2026. Final quotes
              vary by deployment model, country-pack scope, data residency, support windows, implementation complexity,
              hardware-activation sizing, and third-party statutory integrations.
            </p>
          </Panel>
        </Container>
      </section>
    </>
  );
}
