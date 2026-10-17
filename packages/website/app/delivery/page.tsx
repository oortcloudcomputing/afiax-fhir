// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

import { Container, Panel } from '../../components/medplum-ui';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';
import { StatusBadge } from '../../components/status-badge';
import { implementationStates, websiteVoiceRules } from '../../lib/site-content';

export default function DeliveryPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Platform capabilities"
        title="Platform, market, and enterprise capabilities operate as one portfolio."
        body="The Afiax enterprise story brings together platform infrastructure, country-aware interoperability, and managed enterprise services as one connected operating environment."
        note={{
          eyebrow: 'Capability model',
          title: 'One enterprise platform expressed through three operating layers.',
          body: 'Platform foundations, market services, and enterprise operations all reinforce the same Afiax contract across applications, interoperability, and managed delivery.',
          items: ['Platform core', 'Market execution', 'Enterprise operations'],
        }}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Capability model"
            title="Use capability layers to explain the Afiax portfolio."
            description="This keeps the public narrative enterprise-ready while showing how core platform services, country execution, and enterprise operations fit together."
          />
          <div className="state-grid">
            {Object.entries(implementationStates).map(([state, capabilities]) => (
              <Panel key={state} className="state-column corporate-panel" m={0} p="lg" radius="xl">
                <div className="state-header">
                  <StatusBadge state={state as keyof typeof implementationStates} />
                </div>
                <div className="state-stack">
                  {capabilities.map((capability) => (
                    <article key={capability.title} className="state-card">
                      <h3>{capability.title}</h3>
                      <p>{capability.summary}</p>
                      <p className="muted-copy">{capability.detail}</p>
                    </article>
                  ))}
                </div>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Voice guide"
            title="Adopt a disciplined enterprise product voice."
            description="The target is a calm, integrated, solution-led tone in the style of major health IT platforms, with the full Afiax portfolio presented as available and coordinated."
          />
          <Panel className="voice-rule-list corporate-panel" m={0} p="xl" radius="xl">
            {websiteVoiceRules.map((rule) => (
              <p key={rule}>{rule}</p>
            ))}
          </Panel>
        </Container>
      </section>
    </>
  );
}
