// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { HeroArtwork } from '../../components/hero-artwork';
import { Container, DescriptionList, DescriptionListEntry, Panel } from '../../components/medplum-ui';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';

const migrationPaths = [
  {
    title: 'OpenMRS',
    summary: 'Migrate patient, encounter, program, observation, and concept-backed clinical history from OpenMRS into the Afiax canonical FHIR model.',
    detail: 'Typical path: schema review, concept mapping, patient identity reconciliation, FHIR normalization, attachment handling, and parallel validation.',
  },
  {
    title: 'KenyaMRS and KenyaEMR-derived stacks',
    summary: 'Support migrations from Kenya-specific OpenMRS distributions and local derivatives without losing operational or regulatory context.',
    detail: 'Typical path: OpenMRS-compatible extraction plus Kenya-specific forms, program workflows, identifiers, and claims or registry mappings.',
  },
  {
    title: 'Tiberbu',
    summary: 'Move appointments, billing, patient master data, and operational history from Tiberbu-style practice workflows into the Afiax operating model.',
    detail: 'Typical path: API or export extraction, field mapping, financial reconciliation, and staged cutover into Afiax enterprise workflows.',
  },
  {
    title: 'FHIR and HL7-native platforms',
    summary: 'Accelerate migration from systems that already expose FHIR, HL7, or structured healthcare messaging interfaces.',
    detail: 'Typical path: direct extract, terminology normalization, identifier strategy, audit validation, and incremental cutover.',
  },
  {
    title: 'CSV, Excel, and bespoke SQL systems',
    summary: 'Support lower-maturity sources through data extraction, cleansing, mapping, and canonical loading with explicit validation gates.',
    detail: 'Typical path: profiling, data quality scoring, normalization, exception handling, and staged import waves.',
  },
  {
    title: 'Imaging and document archives',
    summary: 'Bring over study links, file references, diagnostic attachments, and care-adjacent documents alongside structured clinical data.',
    detail: 'Typical path: archive inventory, metadata mapping, storage migration, and encounter-linked validation in the target system.',
  },
] as const;

const migrationStages = [
  {
    eyebrow: 'Stage 1',
    title: 'Discovery and source profiling',
    body: 'Inventory source systems, schema shape, export options, identifiers, terminology, attachments, and known data quality gaps.',
  },
  {
    eyebrow: 'Stage 2',
    title: 'Canonical mapping and transformation',
    body: 'Map legacy records into the Afiax canonical FHIR model with explicit handling for concepts, identifiers, billing artifacts, and migration exceptions.',
  },
  {
    eyebrow: 'Stage 3',
    title: 'Validation and reconciliation',
    body: 'Reconcile patient counts, appointments, encounters, claims, balances, and attachments before sign-off on the target environment.',
  },
  {
    eyebrow: 'Stage 4',
    title: 'Parallel run and cutover',
    body: 'Run limited or staged production alongside the source system, validate operations, then execute a managed cutover with rollback posture.',
  },
] as const;

const migrationControls = [
  {
    term: 'Identity resolution',
    description: 'Patient, practitioner, facility, and payer identifiers are mapped and reconciled before production cutover.',
  },
  {
    term: 'Terminology alignment',
    description: 'Local concepts, program codes, billing items, and clinical values are normalized into the Afiax canonical model and country-aware runtime.',
  },
  {
    term: 'Financial reconciliation',
    description: 'Balances, invoices, claims, and revenue-cycle artifacts are validated separately from clinical payloads before sign-off.',
  },
  {
    term: 'Audit and rollback',
    description: 'Each migration wave is logged, validated, and staged so organizations retain traceability and a rollback posture through go-live.',
  },
] as const;

export default function DataMigrationPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Data Migration"
        title="Migration paths from legacy healthcare systems into Afiax Enterprise."
        body="Afiax migration is designed as a governed path from legacy systems into a canonical FHIR operating model, with explicit treatment for identity, terminology, billing, attachments, and country-aware workflows."
        note={{
          eyebrow: 'Migration posture',
          title: 'Canonical first, controlled cutover second.',
          body: 'Every source system is mapped into the target clinical and operational model before production cutover is scheduled.',
          items: ['Legacy extraction and profiling', 'Canonical normalization into FHIR', 'Validation, reconciliation, and staged go-live'],
        }}
        actions={[
          { href: '/get-started', label: 'Begin onboarding' },
          { href: '/pricing', label: 'Review commercial model', variant: 'secondary' },
        ]}
        metrics={[
          { label: 'Supported paths', value: 'OpenMRS, KenyaMRS, Tiberbu, FHIR, SQL, CSV, and archives' },
          { label: 'Migration method', value: 'Profile, map, validate, and cut over in waves' },
          { label: 'Target posture', value: 'Canonical FHIR with country-aware execution' },
          { label: 'Risk control', value: 'Identity, terminology, finance, and audit reconciliation' },
        ]}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout two-column-layout-wide">
          <div>
            <SectionHeading
              eyebrow="Migration visual"
              title="Show the path from legacy extraction to governed target-state cutover."
              description="Migration becomes more understandable when the page visualizes profiling, canonical transformation, and controlled go-live as one continuous motion instead of separate project jargon."
            />
            <div className="pill-row">
              <span className="info-pill">Legacy extraction</span>
              <span className="info-pill">FHIR normalization</span>
              <span className="info-pill">Validation and cutover</span>
            </div>
          </div>
          <Panel className="corporate-panel artwork-panel" m={0} p="lg" radius="xl">
            <HeroArtwork variant="migration" title="Afiax migration from legacy healthcare systems into a governed target platform." compact />
          </Panel>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Migration paths"
            title="Support common African healthcare source systems and legacy data estates."
            description="Migration planning starts by identifying the extract path, canonical mapping strategy, validation burden, and cutover dependencies for each source environment."
          />
          <div className="highlight-grid">
            {migrationPaths.map((path) => (
              <Panel key={path.title} className="highlight-card pathway-card corporate-panel" m={0} p="xl" radius="xl">
                <h3>{path.title}</h3>
                <p>{path.summary}</p>
                <p className="muted-copy">{path.detail}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Migration method"
            title="Move from extraction to cutover through a controlled sequence."
            description="The migration motion is meant to de-risk operational change: know the source, map to the target, validate the result, then cut over with support."
          />
          <div className="highlight-grid">
            {migrationStages.map((stage) => (
              <Panel key={stage.title} className="highlight-card pathway-card corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">{stage.eyebrow}</p>
                <h3>{stage.title}</h3>
                <p>{stage.body}</p>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container two-column-layout">
          <div>
            <SectionHeading
              eyebrow="Risk controls"
              title="Protect clinical, financial, and operational integrity during migration."
              description="Migration is not complete when data loads. It is complete when identity, finance, workflows, and auditability are all proven in the target environment."
            />
            <Link href="/get-started" className="card-link inline-link">
              Return to the onboarding flow
            </Link>
          </div>
          <Panel className="detail-list-card corporate-panel" m={0} p="xl" radius="xl">
            <DescriptionList>
              {migrationControls.map((entry) => (
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
