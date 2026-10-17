// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX, ReactNode } from 'react';

import { shellSignals } from '../lib/site-content';
import { Container, InfoBar, InfoBarEntry, InfoBarKey, InfoBarValue } from './medplum-ui';
import { PageTransition } from './page-transition';
import { SiteShellControls } from './site-controls';

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/solutions', label: 'Solutions' },
  { href: '/devices', label: 'Devices' },
  { href: '/platform', label: 'Platform' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/blog', label: 'Blog' },
  { href: '/about', label: 'About' },
  { href: '/team', label: 'Team' },
  { href: '/developers', label: 'Developers' },
] as const;

export function SiteShell(props: { readonly children: ReactNode }): JSX.Element {
  const { children } = props;

  return (
    <div className="site-shell">
      <div className="utility-ribbon">
        <Container size={1320} className="shell-container">
          <InfoBar>
            {shellSignals.map((signal) => (
              <InfoBarEntry key={signal.label}>
                <InfoBarKey>{signal.label}</InfoBarKey>
                <InfoBarValue>{signal.value}</InfoBarValue>
              </InfoBarEntry>
            ))}
          </InfoBar>
        </Container>
      </div>
      <header className="site-header">
        <Container size={1320} className="shell-container header-inner">
          <Link href="/" className="brand-lockup">
            <span className="brand-kicker">Afiax Connected Healthcare</span>
            <span className="brand-name">Afiax Enterprise</span>
          </Link>
          <div className="header-actions">
            <nav className="site-nav" aria-label="Primary">
              {navItems.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
            </nav>
            <SiteShellControls />
            <Link href="/get-started" className="header-cta">
              Get started
            </Link>
          </div>
        </Container>
      </header>
      <main className="site-main">
        <PageTransition>{children}</PageTransition>
      </main>
      <footer className="site-footer">
        <Container size={1320} className="shell-container footer-grid">
          <div className="footer-summary">
            <p className="eyebrow">Afiax Enterprise</p>
            <p>
              Pan-African digital health infrastructure built on a canonical FHIR core, explicit country adaptation,
              and governed enterprise delivery.
            </p>
          </div>
          <div className="footer-card">
            <p className="eyebrow">About</p>
            <p>Understand the company posture, platform scope, device strategy, and pan-African delivery stance.</p>
            <Link href="/about" className="footer-link">
              View about page
            </Link>
          </div>
          <div className="footer-card">
            <p className="eyebrow">Team</p>
            <p>See the clinical, platform, interoperability, migration, and service teams behind rollout and support.</p>
            <Link href="/team" className="footer-link">
              Meet the team model
            </Link>
          </div>
          <div className="footer-card">
            <p className="eyebrow">Devices</p>
            <p>Review Afiax-enabled phones, tablets, displays, and managed launch kits for facility and field deployment.</p>
            <Link href="/devices" className="footer-link">
              Explore devices
            </Link>
          </div>
          <div className="footer-card">
            <p className="eyebrow">Blog</p>
            <p>Read Afiax platform thinking, migration guidance, device rollout content, and digital health editorial pieces.</p>
            <Link href="/blog" className="footer-link">
              Visit the journal
            </Link>
          </div>
          <div className="footer-card">
            <p className="eyebrow">Pricing</p>
            <p>Review enterprise SaaS and platform pricing for applications, infrastructure, country packs, and managed services.</p>
            <Link href="/pricing" className="footer-link">
              View pricing
            </Link>
          </div>
          <div className="footer-card">
            <p className="eyebrow">Get started</p>
            <p>Launch with domain setup, platform onboarding, migration planning, and country-aware rollout support.</p>
            <Link href="/get-started" className="footer-link">
              Start onboarding
            </Link>
          </div>
          <div className="footer-card">
            <p className="eyebrow">Migration</p>
            <p>Follow migration paths for OpenMRS, KenyaEMR-derived deployments, Tiberbu, FHIR-native estates, and archives.</p>
            <Link href="/data-migration" className="footer-link">
              Review migration path
            </Link>
          </div>
        </Container>
      </footer>
    </div>
  );
}
