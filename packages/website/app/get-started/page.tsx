// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

import { HeroArtwork } from '../../components/hero-artwork';
import { Container, Panel } from '../../components/medplum-ui';
import { GetStartedLeadFlow } from '../../components/get-started-lead-flow';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';

export default function GetStartedPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Get Started"
        title="Check the domain, choose the migration path, and hand the lead into ERPNext onboarding."
        body="The onboarding flow now behaves like a hosted WHMCS-style lead page for healthcare transformation: reserve or transfer the domain through OortCloud and ResellerClub, choose the legacy EHR or migration source, confirm the recommended Afiax commercial path, then hand the brief into ERPNext customer onboarding."
        note={{
          eyebrow: 'Lead posture',
          title: 'One onboarding flow from brand domain to implementation project.',
          body: 'Afiax and OortCloud own the front of the journey, while ERPNext becomes the billing, customer, and implementation handoff system of record.',
          items: [
            'ResellerClub-backed domain lookup or transfer through OortCloud',
            'Legacy EHR migration path selection',
            'ERPNext lead, subscription, and onboarding handoff',
          ],
        }}
        actions={[
          { href: '#lead-flow', label: 'Start domain lookup' },
          { href: '/data-migration', label: 'Review migration paths', variant: 'secondary' },
        ]}
        metrics={[
          { label: 'Lead start', value: 'WHMCS-style OortCloud and ResellerClub domain lookup' },
          { label: 'Migration source', value: 'OpenMRS, KenyaEMR, Tiberbu, Bahmni, SQL, and flat files' },
          { label: 'Commercial handoff', value: 'Recommended Afiax plan with hr or month pricing view' },
          { label: 'Back office', value: 'ERPNext customer onboarding and billing records' },
        ]}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <div>
            <SectionHeading
              eyebrow="Lead journey"
              title="Frame onboarding as a commercial and implementation motion."
              description="The user should understand the logic of the flow before they start it: domain, migration source, recommended offer, and ERPNext handoff as one connected intake path."
            />
            <div className="pill-row">
              <span className="info-pill">Domain and transfer</span>
              <span className="info-pill">Migration path</span>
              <span className="info-pill">ERPNext onboarding</span>
            </div>
          </div>
          <Panel className="corporate-panel artwork-panel" m={0} p="lg" radius="xl">
            <HeroArtwork variant="onboarding" title="Afiax onboarding from domain search to implementation handoff." compact />
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <GetStartedLeadFlow />
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Operating rule"
            title="Treat this page as the commercial intake layer, not the final implementation plan."
            description="The purpose of the flow is to secure the domain, choose the migration path, package the right Afiax offer, and hand a clean lead into ERPNext so delivery can open the implementation workstream with discipline."
          />
          <Panel className="note-card corporate-panel" m={0} p="xl" radius="xl">
            <p className="eyebrow">What happens next</p>
            <p>
              Once the lead is handed off, ERPNext should open the lead, opportunity, domain order, subscription plan,
              implementation project, and migration service line items without re-keying the commercial intake data.
            </p>
          </Panel>
        </Container>
      </section>
    </>
  );
}
