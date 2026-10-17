// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/* eslint-disable react-refresh/only-export-components */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { JSX } from 'react';

import { Container, Panel } from '../../../components/medplum-ui';
import { PageHero } from '../../../components/page-hero';
import { SectionHeading } from '../../../components/section-heading';
import { blogPosts, getBlogPostBySlug } from '../../../lib/blog-content';

export function generateStaticParams(): { slug: string }[] {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export default async function BlogPostPage(props: {
  readonly params: Promise<{ slug: string }>;
}): Promise<JSX.Element> {
  const { slug } = await props.params;
  const post = getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return (
    <>
      <PageHero
        eyebrow={post.category}
        title={post.title}
        body={post.excerpt}
        artwork={post.artwork}
        note={{
          eyebrow: 'Article details',
          title: post.heroTitle,
          body: `${post.date} · ${post.author} · ${post.readingTime}`,
          items: post.tags,
        }}
        actions={[
          { href: '/blog', label: 'Back to blog' },
          { href: '/get-started', label: 'Start with Afiax', variant: 'secondary' },
        ]}
      />

      <section className="content-section content-section-light">
        <Container size={1320} className="shell-container blog-article-layout">
          <aside className="blog-article-sidebar">
            <Panel className="corporate-panel" m={0} p="xl" radius="xl">
              <p className="eyebrow">Article topics</p>
              <div className="pill-row">
                {post.tags.map((tag) => (
                  <span key={tag} className="info-pill">
                    {tag}
                  </span>
                ))}
              </div>
            </Panel>
            <Panel className="corporate-panel" m={0} p="xl" radius="xl">
              <p className="eyebrow">Continue exploring</p>
              <Link href="/solutions" className="card-link">
                Explore solutions
              </Link>
              <Link href="/devices" className="card-link">
                Review devices
              </Link>
              <Link href="/pricing" className="card-link">
                View pricing
              </Link>
            </Panel>
          </aside>
          <div className="blog-article-content">
            {post.sections.map((section) => (
              <section key={section.heading} className="blog-article-section">
                <SectionHeading eyebrow={post.category} title={section.heading} description={section.paragraphs[0]} />
                <div className="blog-paragraph-stack">
                  {section.paragraphs.slice(1).map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                  {section.bullets?.length ? (
                    <ul className="dense-list">
                      {section.bullets.map((bullet) => (
                        <li key={bullet}>{bullet}</li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </Container>
      </section>
    </>
  );
}
