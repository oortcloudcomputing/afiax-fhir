// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { BillingViewToggle } from '../components/site-controls';
import { HeroCarousel } from '../components/hero-carousel';
import { MetricStrip } from '../components/metric-strip';
import { Container, Panel } from '../components/medplum-ui';
import { PriceTag } from '../components/price-tag';
import { SectionHeading } from '../components/section-heading';
import { featuredBlogPosts } from '../lib/blog-content';
import { allProducts, applicationProducts, getProductHref, pricingBundles } from '../lib/product-catalog';
import {
  audienceSegments,
  heroHighlights,
  homePathways,
  homepageMetrics,
  platformLayers,
} from '../lib/site-content';

export default function HomePage(): JSX.Element {
  const heroSlides = [
    {
      tone: 'blue' as const,
      media: '/media/experience/clinical-workspace.png',
      mediaAlt: 'Clinical workspace',
      eyebrow: 'Intelligent solutions powering healthcare',
      title: 'Full suite of integrated solutions to manage all aspects of your Healthcare Enterprise.',
      body:
        'We’re focused on strengthening patient experiences and clinical workflows. Our innovative, open platforms strengthen scope and services across the continuum. Together, our open business approach for interoperable technologies helps organizations advance patient care by securely exchanging and accessing information across the health care ecosystem.',
      highlights: ['Clinical applications', 'Interoperability', 'Enterprise operations'],
      primaryAction: { href: '/solutions', label: 'Our Clinical Solutions' },
      secondaryAction: { href: '/pricing', label: 'Find Your Plans' },
      panelTitle: 'Enterprise healthcare operations on one coordinated platform.',
      panelBody:
        'Afiax combines applications, market services, and managed operations so providers, payers, and digital health operators can run on one connected foundation.',
      panelItems: ['Afiax EHR and patient-facing products', 'Canonical FHIR platform services', 'Managed onboarding and cloud operations'],
    },
    {
      tone: 'green' as const,
      media: '/media/experience/charting-suite.png',
      mediaAlt: 'Bedside charting',
      eyebrow: 'The health care cloud that understands clinicians',
      title: 'Leverage AI-driven solutions that help simplify workflows, alleviate administrative burden, and support patient safety.',
      body:
        'Transform your EHR from a cumbersome administrative tool into an intelligent, collaborative assistant with embedded advanced automation. Integrated clinical AI, patient access, and country-aware workflows keep the focus on care teams and patients.',
      highlights: ['Clinical AI Agent', 'Patient access', 'Care coordination'],
      primaryAction: { href: '/solutions/afiax-fhir-cloud', label: 'Explore Afiax FHIR Cloud' },
      secondaryAction: { href: '/solutions/afiax-clinical-ai-agent', label: 'View Clinical AI Agent' },
      panelTitle: 'Designed for clinicians, operators, and enterprise teams.',
      panelBody:
        'Applications, automation, and interoperability services are aligned to one platform contract so operational change does not create a second system landscape.',
      panelItems: ['Canonical FHIR core', 'Country-pack execution', 'Managed support and continuity'],
    },
    {
      tone: 'red' as const,
      media: '/media/experience/executive-console.png',
      mediaAlt: 'Executive operational dashboard',
      eyebrow: 'Open, connected ecosystems',
      title: 'Interoperability, analytics, and revenue workflows built for coordinated enterprise growth.',
      body:
        'Enable collaborative third-party relationships and seamless data exchange. Equip providers with comprehensive patient information while giving developers the tools and training to focus on advancing healthcare innovation.',
      highlights: ['APIs and integrations', 'Analytics and reporting', 'Revenue operations'],
      primaryAction: { href: '/solutions', label: 'Explore the Portfolio' },
      secondaryAction: { href: '/developers', label: 'Review Developer Path' },
      panelTitle: 'Afiax brings commercial, clinical, and market services together.',
      panelBody:
        'From ERPNext-connected onboarding to analytics, Medical I.O.T, claims, and managed cloud operations, the enterprise stack stays connected across the full Afiax portfolio.',
      panelItems: ['API and Integration Hub', 'Data and AI Workspace', 'Managed Digital Health Services'],
    },
  ] as const;

  const featuredProducts = [
    allProducts.find((item) => item.title === 'Afiax FHIR Cloud'),
    allProducts.find((item) => item.title === 'Afiax EHR'),
    allProducts.find((item) => item.title === 'Managed Digital Health Services'),
  ].filter((product): product is (typeof allProducts)[number] => Boolean(product));

  return (
    <>
      <section className="hero-section">
        <Container size={1320} className="shell-container">
          <HeroCarousel slides={heroSlides} />
        </Container>
        <Container size={1320} className="shell-container">
          <MetricStrip items={homepageMetrics} />
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Solutions"
            title="Solutions to solve complex healthcare challenges"
            description="Deep healthcare data expertise powers our intelligent solutions, delivering near real-time insights that help enhance care and enable smart decisions."
          />
          <div className="highlight-grid">
            {heroHighlights.map((item) => (
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
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Afiax Clinical Suite Modules"
            title="Support holistic patient care"
            description="Deep healthcare data expertise powers our intelligent solutions, delivering near real-time insights that help enhance care and enable smart decisions.The Afiax Clinical Suite packs all you need to transform your Healthcare Enterprise"
          />
          <div className="section-toolbar section-toolbar-inline">
            <BillingViewToggle label="Starting product pricing" />
          </div>
          <div className="experience-feature-grid">
            {featuredProducts.map((product) => (
              <Panel key={product.title} className="experience-panel corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">{product.category}</p>
                <h3>{product.title}</h3>
                <p>{product.summary}</p>
                <div className="pricing-card-header">
                  <PriceTag price={product.price} unit={product.unit} />
                </div>
                <ul className="dense-list pricing-feature-list">
                  {product.includes.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
                <p className="muted-copy">{product.commitment}</p>
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
            eyebrow="Navigate Afiax"
            title="Explore the commercial, platform, and pricing story from one enterprise web layer."
            description="The site helps buyers, operators, and partners move from products to platform to commercial model without losing the thread."
          />
          <div className="highlight-grid">
            {homePathways.map((pathway) => (
              <Panel key={pathway.title} className="highlight-card pathway-card corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">{pathway.eyebrow}</p>
                <h3>{pathway.title}</h3>
                <p>{pathway.body}</p>
                <Link href={pathway.href} className="card-link">
                  {pathway.cta}
                </Link>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Clinical suite modules"
            title="Support holistic patient care with connected enterprise products."
            description="Deep healthcare data expertise powers intelligent solutions that deliver near real-time insights, improve coordination, and strengthen patient and clinician experiences."
          />
          <div className="section-toolbar">
            <BillingViewToggle label="Product pricing" />
          </div>
          <div className="highlight-grid">
            {applicationProducts.slice(0, 6).map((product) => (
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
            eyebrow="Platform"
            title="THE HEALTH CARE CLOUD THAT UNDERSTANDS CLINICIANS"
            description="Leverage AI-driven solutions that help simplify workflows, alleviate administrative burden, and support patient safety. Transform your EHR from a cumbersome administrative tool into an intelligent, collaborative assistant with embedded advanced automation."
          />
          <div className="layer-grid">
            {platformLayers.map((layer) => (
              <Panel key={layer.name} className="layer-card corporate-panel" m={0} p="xl" radius="xl">
                <h3>{layer.name}</h3>
                <p>{layer.summary}</p>
                <p className="muted-copy">{layer.responsibility}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Commercial model"
            title="Pricing is structured for enterprise rollout, not one-off software sales."
            description="Afiax offers application suites for care delivery and usage-based platform pricing for interoperability, data, and managed cloud operations."
          />
          <div className="section-toolbar">
            <BillingViewToggle label="Bundle pricing" />
          </div>
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
                <Link href="/pricing" className="card-link">
                  Review bundle
                </Link>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Who it serves"
            title="Position the platform around real operating environments."
            description="Afiax is structured for provider groups, public-sector programs, payers, and digital health operators that need one operational foundation."
          />
          <div className="highlight-grid">
            {audienceSegments.map((segment) => (
              <Panel key={segment.title} className="highlight-card corporate-panel" m={0} p="xl" radius="xl">
                <h3>{segment.title}</h3>
                <p>{segment.summary}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Afiax Journal"
            title="Editorial content that explains the platform, the rollout, and the field reality."
            description="The blog now acts as a full content layer for Afiax, carrying longer-form product, migration, managed-services, and device narratives across the public site."
          />
          <div className="blog-grid">
            {featuredBlogPosts.map((post) => (
              <Panel key={post.slug} className="blog-card corporate-panel" m={0} p="xl" radius="xl">
                <div className="blog-card-copy">
                  <p className="eyebrow">{post.category}</p>
                  <h3>{post.title}</h3>
                  <p className="muted-copy">{post.heroTitle}</p>
                  <p>{post.excerpt}</p>
                  <p className="muted-copy">
                    {post.date} · {post.readingTime}
                  </p>
                  <Link href={`/blog/${post.slug}`} className="card-link">
                    Read article
                  </Link>
                </div>
              </Panel>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
