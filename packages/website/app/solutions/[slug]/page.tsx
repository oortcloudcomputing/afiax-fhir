// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable react-refresh/only-export-components */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';

import { BillingViewToggle } from '../../../components/site-controls';
import { Container, DescriptionList, DescriptionListEntry, Panel } from '../../../components/medplum-ui';
import { PageHero } from '../../../components/page-hero';
import { PriceTag } from '../../../components/price-tag';
import { SectionHeading } from '../../../components/section-heading';
import { getCatalogProductBySlug, getRelatedProducts, allProducts } from '../../../lib/product-catalog';

export function generateStaticParams(): { slug: string }[] {
  return allProducts.map((product) => ({ slug: product.slug }));
}

export default async function SolutionDetailPage(props: {
  readonly params: Promise<{ slug: string }>;
}): Promise<JSX.Element> {
  const { slug } = await props.params;
  const product = getCatalogProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const relatedProducts = getRelatedProducts(product);
  const metrics = [
    { label: 'Commercial model', value: product.category },
    { label: 'Starting price', value: `${product.price} ${product.unit}` },
    { label: 'Deployment fit', value: product.deploymentFit },
    {
      label: 'Platform posture',
      value: product.category === 'SaaS' ? 'Built on the Afiax enterprise platform' : 'Extends the Afiax enterprise platform',
    },
  ] as const;

  const operationalEntries = [
    {
      term: 'Ideal for',
      description: product.audience,
    },
    {
      term: 'Commercial model',
      description: `${product.price} ${product.unit}`,
    },
    {
      term: 'Commitment',
      description: product.commitment,
    },
    {
      term: 'Deployment fit',
      description: product.deploymentFit,
    },
  ] as const;

  return (
    <>
      <PageHero
        eyebrow={product.category === 'SaaS' ? 'Enterprise solution' : 'Platform service'}
        title={product.title}
        body={product.description}
        note={{
          eyebrow: 'Why it matters',
          title: product.summary,
          body: `${product.title} is designed for ${product.audience.toLowerCase()}`,
          items: product.outcomes,
        }}
        actions={[
          { href: '/pricing', label: 'View pricing' },
          { href: 'mailto:info@afiax.africa', label: 'Request enterprise quote', variant: 'secondary' },
        ]}
        metrics={metrics}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout">
          <div>
            <SectionHeading
              eyebrow="Commercial profile"
              title="Review the live starting price and move directly into onboarding."
              description="Price view can switch between monthly and normalized hourly budget views while keeping the same product commercial position."
            />
            <div className="section-toolbar section-toolbar-inline">
              <BillingViewToggle label="Price view" />
            </div>
          </div>
          <Panel className="note-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
            <div className="pricing-card-header">
              <p className="eyebrow">Starting commercial position</p>
              <PriceTag price={product.price} unit={product.unit} prefix="Starting at" />
            </div>
            <p>{product.commitment}</p>
            <Link href="/pricing" className="card-link">
              Review full pricing
            </Link>
            <Link href="/get-started" className="card-link">
              Start onboarding
            </Link>
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Operational outcomes"
            title={`How ${product.title} strengthens enterprise healthcare operations.`}
            description="Each Afiax product is positioned as part of a connected operating environment, not as a disconnected point tool."
          />
          <div className="highlight-grid">
            {product.outcomes.map((outcome) => (
              <Panel key={outcome} className="highlight-card corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">{product.category}</p>
                <p>{outcome}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container two-column-layout">
          <div>
            <SectionHeading
              eyebrow="Capabilities included"
              title="Included capabilities and commercial profile."
              description="The product page keeps the value story, included capabilities, and pricing posture visible in one place."
            />
            <Panel className="note-card corporate-panel" m={0} p="xl" radius="xl">
              <p className="eyebrow">Included in the offer</p>
              <ul className="dense-list pricing-feature-list">
                {product.includes.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </Panel>
          </div>
          <Panel className="detail-list-card corporate-panel" m={0} p="xl" radius="xl">
            <DescriptionList>
              {operationalEntries.map((entry) => (
                <DescriptionListEntry key={entry.term} term={entry.term}>
                  {entry.description}
                </DescriptionListEntry>
              ))}
            </DescriptionList>
          </Panel>
        </Container>
      </section>

      {relatedProducts.length ? (
        <section className="content-section content-section-light">
          <Container size={1320} className="shell-container">
            <SectionHeading
              eyebrow="Related products"
              title="Position this offer inside the wider Afiax portfolio."
              description="Enterprise buyers should be able to move from one solution to adjacent platform services and applications without losing the thread."
            />
            <div className="highlight-grid">
              {relatedProducts.map((relatedProduct) => (
                <Panel key={relatedProduct.slug} className="highlight-card pathway-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
                <div className="pricing-card-header">
                  <p className="eyebrow">{relatedProduct.category}</p>
                  <PriceTag price={relatedProduct.price} unit={relatedProduct.unit} />
                </div>
                <h3>{relatedProduct.title}</h3>
                <p>{relatedProduct.summary}</p>
                <Link href={`/solutions/${relatedProduct.slug}`} className="card-link">
                  View product page
                </Link>
              </Panel>
            ))}
            </div>
          </Container>
        </section>
      ) : null}

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <Panel className="note-card corporate-panel" m={0} p="xl" radius="xl">
            <p className="eyebrow">Next step</p>
            <p>
              Request a commercial workshop to align deployment model, implementation scope, statutory integrations,
              training, and support windows for {product.title}.
            </p>
            <Link href="mailto:info@afiax.africa" className="card-link">
              Start the commercial conversation
            </Link>
          </Panel>
        </Container>
      </section>
    </>
  );
}
