// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import type { HeroArtworkVariant } from '../lib/hero-artwork';
import type { Metric } from '../lib/site-content';
import { resolveHeroArtworkVariant } from '../lib/hero-artwork';
import { HeroArtwork } from './hero-artwork';
import { Container, Panel } from './medplum-ui';
import { MetricStrip } from './metric-strip';

export interface PageHeroAction {
  readonly href: string;
  readonly label: string;
  readonly variant?: 'primary' | 'secondary';
}

export interface PageHeroNote {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly items?: readonly string[];
}

export interface PageHeroProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly note?: PageHeroNote;
  readonly actions?: readonly PageHeroAction[];
  readonly metrics?: readonly Metric[];
  readonly artwork?: HeroArtworkVariant;
}

export function PageHero(props: PageHeroProps): JSX.Element {
  const { eyebrow, title, body, note, actions, metrics, artwork } = props;
  const artworkVariant = artwork ?? resolveHeroArtworkVariant(eyebrow);

  return (
    <section className="page-hero page-hero-structured">
      <Container size={1320} className="shell-container">
        <div className="page-hero-grid">
          <div className="page-hero-copy">
            <p className="eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="hero-body">{body}</p>
            {actions?.length ? (
              <div className="hero-actions">
                {actions.map((action) => (
                  <Link
                    key={`${action.href}-${action.label}`}
                    href={action.href}
                    className={action.variant === 'secondary' ? 'secondary-link' : 'primary-link'}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
          <div className="page-hero-aside">
            <HeroArtwork variant={artworkVariant} title={title} />
            {note ? (
              <Panel className="page-hero-note corporate-panel" m={0} p="xl" radius="xl">
                <p className="eyebrow">{note.eyebrow}</p>
                <h2>{note.title}</h2>
                <p>{note.body}</p>
                {note.items?.length ? (
                  <ul className="dense-list hero-note-list">
                    {note.items.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ) : null}
              </Panel>
            ) : null}
          </div>
        </div>
        {metrics?.length ? <MetricStrip items={metrics} /> : null}
      </Container>
    </section>
  );
}
