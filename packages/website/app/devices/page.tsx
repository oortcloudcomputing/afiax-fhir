// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { BillingViewToggle } from '../../components/site-controls';
import { Container, Panel } from '../../components/medplum-ui';
import { MetricStrip } from '../../components/metric-strip';
import { PageHero } from '../../components/page-hero';
import { PriceTag } from '../../components/price-tag';
import { SectionHeading } from '../../components/section-heading';
import { deviceFamilies, deviceMetrics, devicePrograms } from '../../lib/experience-content';
import { allProducts, getProductHref } from '../../lib/product-catalog';

export default function DevicesPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Afiax Devices"
        title="Afiax-enabled phones, tablets, displays, and care kits prepared for clinical and operational rollout."
        body="The device program extends Afiax beyond software screens alone. Managed device bundles help customers launch consultation, bedside, mobile, and command-center experiences with less friction."
        note={{
          eyebrow: 'Managed PaaS advantage',
          title: 'Hardware activation is part of the rollout story.',
          body: 'Managed PaaS offerings include free tablets, displays, and starter digital health accessories so customers can move faster from commercial agreement to field-ready operations.',
          items: ['Provisioned phones and tablets', 'Operations and nurse-station displays', 'Configuration, training, and continuity support'],
        }}
        actions={[
          { href: '/pricing', label: 'Review managed pricing' },
          { href: '/get-started', label: 'Start onboarding', variant: 'secondary' },
        ]}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <MetricStrip items={deviceMetrics} />
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <div>
            <SectionHeading
              eyebrow="Device operating model"
              title="Define devices as managed enterprise assets, not mockup surfaces."
              description="Afiax devices are presented as governed launch kits for clinical, patient, and operational environments with clear provisioning, support, and paired-product alignment."
            />
            <div className="pill-row">
              <span className="info-pill">Diagnostic review</span>
              <span className="info-pill">Bedside charting</span>
              <span className="info-pill">Mobile care coordination</span>
            </div>
          </div>
          <Panel className="voice-rule-list corporate-panel" m={0} p="xl" radius="xl">
            <p className="eyebrow">Included device categories</p>
            <div className="stacked-copy">
              <h3>Phones and mobile kits</h3>
              <p>Configured for rounding, alerts, tele-health coordination, community workflows, and managed secure access.</p>
            </div>
            <div className="stacked-copy">
              <h3>Tablets and consultation surfaces</h3>
              <p>Prepared for bedside charting, triage, intake, patient engagement, and clinician collaboration.</p>
            </div>
            <div className="stacked-copy">
              <h3>Displays and command surfaces</h3>
              <p>Used for diagnostic review, nurse-station visibility, executive operations, and shared service monitoring.</p>
            </div>
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Device families"
            title="Pair each deployment environment with the right Afiax-enabled hardware profile."
            description="Every device family is tied back to a product surface so the hardware story supports the application and pricing story rather than drifting into a separate catalog."
          />
          <div className="section-toolbar section-toolbar-inline">
            <BillingViewToggle label="Paired product pricing" />
          </div>
          <div className="highlight-grid">
            {deviceFamilies.map((family) => {
              const primaryProduct = allProducts.find((product) => product.title === family.pairedProductTitles[0]);

              return (
                <Panel key={family.title} className="highlight-card pathway-card corporate-panel pricing-card" m={0} p="xl" radius="xl">
                  <div className="pricing-card-header">
                    <p className="eyebrow">{family.eyebrow}</p>
                    {primaryProduct ? <PriceTag price={primaryProduct.price} unit={primaryProduct.unit} /> : null}
                  </div>
                  <h3>{family.title}</h3>
                  <p>{family.summary}</p>
                  <p className="muted-copy">{family.suitedFor}</p>
                  <ul className="dense-list">
                    {family.includes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <div className="link-row">
                    {family.pairedProductTitles.map((title) => (
                      <Link key={title} href={getProductHref(title)} className="card-link">
                        {title}
                      </Link>
                    ))}
                  </div>
                </Panel>
              );
            })}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Rollout programs"
            title="Keep devices inside the same onboarding and service model as the platform."
            description="The hardware story becomes more credible when it is clearly tied to managed PaaS, migration planning, training, and post-go-live support."
          />
          <div className="highlight-grid">
            {devicePrograms.map((program) => (
              <Panel key={program.title} className="highlight-card corporate-panel" m={0} p="xl" radius="xl">
                <h3>{program.title}</h3>
                <p>{program.summary}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
