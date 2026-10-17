// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { Container, DescriptionList, DescriptionListEntry, Panel } from '../../components/medplum-ui';
import { ErpnextOnboardingActions } from '../../components/erpnext-onboarding-actions';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';
import { buildOnboardingPacketFromSearchParams, getTransferSummary } from '../../lib/onboarding-packet';
import type { SearchParams } from '../../lib/onboarding-packet';

function buildErpnextSignupUrl(baseUrl: string, values: Record<string, string>): string | undefined {
  try {
    const url = new URL(baseUrl);

    for (const [key, value] of Object.entries(values)) {
      if (value && value !== 'Pending') {
        url.searchParams.set(key, value);
      }
    }

    url.searchParams.set('lead_source', 'afiax_website');
    url.searchParams.set('lead_stage', 'commercial_intake');
    return url.toString();
  } catch {
    return undefined;
  }
}

export default async function ErpnextSignupPage(props: {
  readonly searchParams: Promise<SearchParams>;
}): Promise<JSX.Element> {
  const searchParams = await props.searchParams;
  const packet = buildOnboardingPacketFromSearchParams(searchParams);

  const erpnextBaseUrl = process.env.ERPNEXT_SIGNUP_URL ?? process.env.NEXT_PUBLIC_ERPNEXT_SIGNUP_URL;
  const erpnextSignupUrl = erpnextBaseUrl
    ? buildErpnextSignupUrl(erpnextBaseUrl, {
        organization: packet.organizationName,
        contact: packet.contactName,
        email: packet.workEmail,
        country: packet.country,
        domain: packet.domain,
        domain_mode: packet.domainMode,
        migration_source: packet.source,
        service_item: packet.serviceItem,
        recommended_plan: packet.plan,
        deployment: packet.deployment,
        transfer_status: packet.transferStatus,
        lookup_provider: packet.lookupProvider,
      })
    : undefined;

  return (
    <>
      <PageHero
        eyebrow="ERPNext Signup"
        title="The customer onboarding packet is ready for ERPNext."
        body="The reseller-style intake has already captured the domain intent, migration source, and commercial recommendation. ERPNext now becomes the lead, customer, billing, and implementation handoff system of record."
        note={{
          eyebrow: 'Handoff scope',
          title: 'Everything needed for customer onboarding is already structured.',
          body: 'ERPNext should receive the lead packet without re-keying domain, migration, subscription, or delivery context from the website wizard.',
          items: [
            'Domain registration or transfer intent from OortCloud',
            'Legacy EHR migration source and service item',
            'Recommended Afiax plan and deployment model',
          ],
        }}
        actions={[
          { href: '/get-started', label: 'Return to wizard' },
          { href: '/pricing', label: 'Review pricing', variant: 'secondary' },
        ]}
        metrics={[
          { label: 'Organization', value: packet.organizationName },
          { label: 'Domain', value: `${packet.domain} (${packet.domainMode})` },
          { label: 'Migration source', value: packet.source },
          { label: 'Commercial path', value: `${packet.plan} on ${packet.deployment}` },
        ]}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <div className="signup-grid">
            <div className="signup-stack">
              <SectionHeading
                eyebrow="Lead packet"
                title="Commercial intake is normalized and ready to become an ERPNext customer record."
                description="This is the structured handoff page between the website wizard and ERPNext. It should map directly to the lead, opportunity, subscription, implementation, and domain-order objects."
              />
              <Panel className="corporate-panel" m={0} p="xl" radius="xl">
                <DescriptionList>
                  <DescriptionListEntry term="Organization">{packet.organizationName}</DescriptionListEntry>
                  <DescriptionListEntry term="Primary contact">{packet.contactName}</DescriptionListEntry>
                  <DescriptionListEntry term="Work email">{packet.workEmail}</DescriptionListEntry>
                  <DescriptionListEntry term="Country context">{packet.country}</DescriptionListEntry>
                  <DescriptionListEntry term="Domain order">
                    {packet.domain} via {packet.domainMode}
                  </DescriptionListEntry>
                  <DescriptionListEntry term="Migration source">{packet.source}</DescriptionListEntry>
                  <DescriptionListEntry term="ERPNext service item">{packet.serviceItem}</DescriptionListEntry>
                  <DescriptionListEntry term="Recommended plan">
                    {packet.planBadge !== 'Pending' ? `${packet.planBadge} - ${packet.plan}` : packet.plan}
                  </DescriptionListEntry>
                  <DescriptionListEntry term="Commercial baseline">
                    {packet.planMonthlyPrice !== 'Pending' ? `$${Number(packet.planMonthlyPrice).toLocaleString()} per month base` : 'Pending'}
                  </DescriptionListEntry>
                  <DescriptionListEntry term="Deployment">{packet.deployment}</DescriptionListEntry>
                  <DescriptionListEntry term="Lookup provider">{packet.lookupProvider}</DescriptionListEntry>
                  <DescriptionListEntry term="Transfer summary">{getTransferSummary(packet.transferStatus)}</DescriptionListEntry>
                </DescriptionList>
              </Panel>

              <Panel className="note-card corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">ERPNext objects</p>
                <p>
                  The website now creates a standard ERPNext lead record and attaches the normalized onboarding packet as
                  a comment. That keeps the website intake disciplined while leaving downstream qualification and conversion
                  inside ERPNext.
                </p>
                <ul className="dense-list">
                  <li>The handoff creates a `Lead` using standard Frappe REST endpoints.</li>
                  <li>The onboarding packet is attached as a `Comment` on that lead for sales and delivery review.</li>
                  <li>Domain, migration, and pricing context are preserved in one lead record instead of being re-keyed later.</li>
                </ul>
              </Panel>
            </div>

            <div className="signup-stack">
              <Panel className="signup-action-card corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">Next action</p>
                <h3>{erpnextSignupUrl ? 'Create the ERPNext lead, then continue into the portal if needed.' : 'Create the ERPNext lead.'}</h3>
                <p>
                  {erpnextSignupUrl
                    ? 'The ERPNext portal URL is configured. Create the lead first, then open the ERPNext portal or the lead record for follow-through.'
                    : 'If only the API is configured, this page can still create the ERPNext lead directly. Add `ERPNEXT_SIGNUP_URL` or `NEXT_PUBLIC_ERPNEXT_SIGNUP_URL` only if you also want a portal link.'}
                </p>
                <ErpnextOnboardingActions packet={packet} externalSignupUrl={erpnextSignupUrl} />
                <Link href="/get-started" className="secondary-link">
                  Return to get started
                </Link>
              </Panel>

              {packet.transferMessage ? (
                <Panel className="note-card corporate-panel" m={0} p="xl" radius="xl">
                  <p className="eyebrow">Transfer detail</p>
                  <p>{packet.transferMessage}</p>
                </Panel>
              ) : null}

              <Panel className="note-card corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">Operating rule</p>
                <p>
                  Domain, migration, and pricing intent should be captured here once, then owned operationally inside
                  ERPNext. The website wizard should not become a parallel system of record for customer onboarding.
                </p>
              </Panel>
            </div>
          </div>
        </Container>
      </section>
    </>
  );
}
