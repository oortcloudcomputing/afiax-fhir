// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import Link from 'next/link';
import type { JSX } from 'react';

import { HeroArtwork } from '../../components/hero-artwork';
import { Container, Panel } from '../../components/medplum-ui';
import { MetricStrip } from '../../components/metric-strip';
import { PageHero } from '../../components/page-hero';
import { SectionHeading } from '../../components/section-heading';
import { blogPosts, featuredBlogPosts } from '../../lib/blog-content';

const blogMetrics = [
  { label: 'Editorial scope', value: 'Platform, migration, managed services, devices, and market thinking' },
  { label: 'Voice', value: 'Enterprise digital health with operational and implementation depth' },
  { label: 'Content posture', value: 'Afiax-aligned thought leadership and delivery guidance' },
  { label: 'Audience', value: 'Health system leaders, builders, operators, and transformation teams' },
] as const;

export default function BlogPage(): JSX.Element {
  return (
    <>
      <PageHero
        eyebrow="Blog"
        title="Field notes, platform thinking, and digital health strategy from the Afiax operating model."
        body="The Afiax Journal brings the product, migration, interoperability, managed services, and device story into one editorial layer so buyers and builders can understand how the platform is intended to work in practice."
        note={{
          eyebrow: 'Editorial stance',
          title: 'Write like an operator, not a template.',
          body: 'The blog is part of the enterprise website, so it should reinforce product truth, implementation discipline, and digital health credibility rather than drifting into generic technology commentary.',
          items: ['Architecture and migration thinking', 'Managed delivery and device rollout', 'Country-aware interoperability and commercial clarity'],
        }}
        metrics={blogMetrics}
        artwork="blog"
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="Featured"
            title="Start with the strongest Afiax perspectives."
            description="These featured articles set the tone for how Afiax talks about digital health, enterprise delivery, interoperability, and the operating environment around the software."
          />
          <div className="blog-feature-grid">
            {featuredBlogPosts.map((post) => (
              <Panel key={post.slug} className="blog-feature-card corporate-panel" m={0} p="xl" radius="xl">
                <HeroArtwork variant={post.artwork} title={post.heroTitle} compact />
                <div className="blog-card-copy">
                  <p className="eyebrow">{post.category}</p>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt}</p>
                  <p className="muted-copy">
                    {post.date} · {post.readingTime}
                  </p>
                  <Link href={`/blog/${post.slug}`} className="card-link">
                    Read article
                  </Link>
                </div>
              </Panel>
            ))}
          </div>
        </Container>
      </section>

      <section className="content-section content-section-light section-alt">
        <Container size={1320} className="shell-container">
          <MetricStrip items={blogMetrics} />
        </Container>
      </section>

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container">
          <SectionHeading
            eyebrow="All posts"
            title="A growing editorial layer for the Afiax platform story."
            description="The journal is designed to hold full-length Afiax content rather than short placeholder updates, so each article carries enough depth to support buyers, builders, and delivery teams."
          />
          <div className="blog-grid">
            {blogPosts.map((post) => (
              <Panel key={post.slug} className="blog-card corporate-panel" m={0} p="xl" radius="xl">
                <HeroArtwork variant={post.artwork} title={post.heroTitle} compact />
                <div className="blog-card-copy">
                  <p className="eyebrow">{post.category}</p>
                  <h3>{post.title}</h3>
                  <p>{post.excerpt}</p>
                  <div className="pill-row">
                    {post.tags.map((tag) => (
                      <span key={tag} className="info-pill">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="muted-copy">
                    {post.date} · {post.author} · {post.readingTime}
                  </p>
                  <Link href={`/blog/${post.slug}`} className="card-link">
                    Open article
                  </Link>
                </div>
              </Panel>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
