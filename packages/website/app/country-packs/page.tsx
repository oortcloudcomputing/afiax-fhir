// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

import { Container, Panel } from '../../components/medplum-ui';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';
import { countryPackPrinciples } from '../../lib/site-content';

const kenyaWorkflowCards = [
  {
    title: 'Facility verification',
    body: 'Guided onboarding and resource-level workflows help organizations verify national facility identifiers while preserving canonical organization records.',
  },
  {
    title: 'Practitioner verification',
    body: 'Practitioner identity and authority checks run through pack-aware handlers, not browser-side regulator calls.',
  },
  {
    title: 'Coverage and claims',
    body: 'Coverage checks, claim submission, and claim-status refresh sit behind generic operations with normalized evidence written back into FHIR resources.',
  },
] as const;

export default function CountryPacksPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Country packs"
        title="National interoperability belongs in explicit country layers, not in core platform drift."
        body="The country-pack model is what makes the platform pan-African instead of country-shaped. Kenya operates as one reference market within a wider multi-country interoperability architecture."
        note={{
          eyebrow: 'Market model',
          title: 'Country packs scale the platform across markets.',
          body: 'The pack model allows each market to bind national workflows to the same platform semantics instead of hard-coding one country into the core.',
          items: ['Registry and payer integrations stay pack-aware', 'Browser clients do not call national rails directly', 'New markets should arrive as new packs'],
        }}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Pack model"
            title="Country packs let the platform talk about national workflows honestly."
            description="The public narrative can show Kenya as one operating pack while preserving the broader platform story across multiple markets."
          />
          <div className="highlight-grid">
            {countryPackPrinciples.map((principle) => (
              <Panel key={principle.title} className="highlight-card corporate-panel" m={0} p="xl" radius="xl">
                <h3>{principle.title}</h3>
                <p>{principle.body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Kenya reference pack"
            title="Present the Kenya story as one operating execution path."
            description="This creates a strong public narrative while showing how country-aware workflows fit into a broader pan-African market model."
          />
          <div className="layer-grid">
            {kenyaWorkflowCards.map((card) => (
              <Panel key={card.title} className="layer-card corporate-panel" m={0} p="xl" radius="xl">
                <h3>{card.title}</h3>
                <p>{card.body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
