// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

import { HeroArtwork } from '../../components/hero-artwork';
import { Container, DescriptionList, DescriptionListEntry, Panel } from '../../components/medplum-ui';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';
import { deploymentModels, governancePrinciples, platformLayers } from '../../lib/site-content';

const platformBoundaryEntries = [
  {
    term: 'Clinical core',
    description: 'Own the canonical clinical and reimbursement record, access controls, generic operations, and workflow evidence.',
  },
  {
    term: 'Country layers',
    description: 'Bind national registries, terminology, claims rails, and compliance requirements to generic platform semantics.',
  },
  {
    term: 'Digital products',
    description: 'Deliver provider, patient, partner, and operational experiences without bypassing the canonical platform.',
  },
  {
    term: 'Adjacent services',
    description: 'Extend into billing, payments, analytics, and AI while publishing normalized outcomes back into the shared model.',
  },
] as const;

export default function PlatformPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Platform"
        title="A governed platform foundation for connected healthcare delivery."
        body="Afiax Enterprise is not a single application. It is a platform anchored by Afiax FHIR, extended by country packs, and surrounded by adjacent operational services."
        note={{
          eyebrow: 'Operating premise',
          title: 'One core platform, explicit extension boundaries.',
          body: 'The strongest enterprise narrative explains what the platform owns, what country packs own, and what adjacent services are expected to do around that core.',
          items: ['Canonical FHIR source of truth', 'Country-pack dispatch for national variation', 'Normalized write-back from external workflows'],
        }}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <div>
            <SectionHeading
              eyebrow="Platform visual"
              title="Make the platform boundary visible, not just described."
              description="Readers should immediately see that the clinical core, country runtime, and enterprise services belong to one governed platform fabric instead of unrelated modules."
            />
            <div className="pill-row">
              <span className="info-pill">FHIR source of truth</span>
              <span className="info-pill">Country-pack overlays</span>
              <span className="info-pill">Managed service perimeter</span>
            </div>
          </div>
          <Panel className="corporate-panel artwork-panel" m={0} p="lg" radius="xl">
            <HeroArtwork variant="platform" title="Afiax platform ownership across core, packs, and adjacent services." compact />
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Layer model"
            title="Explain ownership before features."
            description="Enterprise readers can understand what the platform owns, what adjacent services own, and how those pieces connect before they are asked to trust the scope."
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

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container two-column-layout">
          <div>
            <SectionHeading
              eyebrow="Execution boundary"
              title="The platform contract stays stable as services expand around it."
              description="The platform definition stays crisp enough that new market integrations and enterprise services do not read as a different product each time."
            />
          </div>
          <Panel className="detail-list-card corporate-panel" m={0} p="xl" radius="xl">
            <DescriptionList>
              {platformBoundaryEntries.map((entry) => (
                <DescriptionListEntry key={entry.term} term={entry.term}>
                  {entry.description}
                </DescriptionListEntry>
              ))}
            </DescriptionList>
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout">
          <div>
            <SectionHeading
              eyebrow="Deployment models"
              title="One platform, multiple operating models."
              description="Afiax can support different deployment patterns without implying that every pattern is already live for every market."
            />
            <div className="pill-row">
              {deploymentModels.map((model) => (
                <span key={model} className="info-pill">
                  {model}
                </span>
              ))}
            </div>
          </div>
          <Panel className="note-card corporate-panel" m={0} p="xl" radius="xl">
            <p className="eyebrow">Messaging rule</p>
            <p>
              Describe deployment options as supported architectural models. Only attach market claims, certifications, or
              operating statements to models that are actually in service.
            </p>
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Governance"
            title="Enterprise tone stays disciplined."
            description="The strongest platform voice here is calm, integrated, outcome-led, and explicit about stage of delivery."
          />
          <div className="highlight-grid">
            {governancePrinciples.map((principle) => (
              <Panel key={principle.title} className="highlight-card corporate-panel" m={0} p="xl" radius="xl">
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
