// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { JSX } from 'react';

export interface HeroCarouselSlide {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly media: string;
  readonly mediaAlt: string;
  readonly tone: 'blue' | 'green' | 'red';
  readonly highlights: readonly string[];
  readonly primaryAction: {
    readonly href: string;
    readonly label: string;
  };
  readonly secondaryAction?: {
    readonly href: string;
    readonly label: string;
  };
  readonly panelTitle: string;
  readonly panelBody: string;
  readonly panelItems: readonly string[];
}

export function HeroCarousel(props: { readonly slides: readonly HeroCarouselSlide[] }): JSX.Element {
  const { slides } = props;
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [slides.length]);

  function goToSlide(index: number): void {
    setActiveIndex(index);
  }

  function goToPrevious(): void {
    setActiveIndex((current) => (current - 1 + slides.length) % slides.length);
  }

  function goToNext(): void {
    setActiveIndex((current) => (current + 1) % slides.length);
  }

  return (
    <section className="hero-carousel" aria-roledescription="carousel">
      <div className="hero-carousel-stage">
        {slides.map((slide, index) => (
          <article
            key={slide.title}
            className={`hero-carousel-slide tone-${slide.tone}${index === activeIndex ? ' is-active' : ''}`}
            aria-hidden={index !== activeIndex}
            style={{
              backgroundImage: `linear-gradient(110deg, rgba(5, 14, 24, 0.86), rgba(5, 14, 24, 0.56) 48%, rgba(5, 14, 24, 0.84)), url(${slide.media})`,
            }}
          >
            <div className="hero-carousel-overlay">
              <div className="hero-carousel-copy">
                <p className="eyebrow">{slide.eyebrow}</p>
                <h1>{slide.title}</h1>
                <p className="hero-body">{slide.body}</p>
                <div className="pill-row">
                  {slide.highlights.map((item) => (
                    <span key={item} className="hero-carousel-pill">
                      {item}
                    </span>
                  ))}
                </div>
                <div className="hero-actions">
                  <Link href={slide.primaryAction.href} className="primary-link">
                    {slide.primaryAction.label}
                  </Link>
                  {slide.secondaryAction ? (
                    <Link href={slide.secondaryAction.href} className="secondary-link">
                      {slide.secondaryAction.label}
                    </Link>
                  ) : null}
                </div>
              </div>
              <div className="hero-carousel-brief">
                <p className="eyebrow">Portfolio brief</p>
                <h2>{slide.panelTitle}</h2>
                <p>{slide.panelBody}</p>
                <ul className="dense-list hero-carousel-brief-list">
                  {slide.panelItems.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
          </article>
        ))}
      </div>
      <div className="hero-carousel-controls">
        <div className="hero-carousel-dots" aria-label="Slide navigation">
          {slides.map((slide, index) => (
            <button
              key={slide.title}
              type="button"
              className={`hero-carousel-dot${index === activeIndex ? ' is-active' : ''}`}
              aria-label={`Show slide ${index + 1}: ${slide.mediaAlt}`}
              onClick={() => goToSlide(index)}
            />
          ))}
        </div>
        <div className="hero-carousel-arrows">
          <button type="button" className="hero-carousel-arrow" aria-label="Previous slide" onClick={goToPrevious}>
            Prev
          </button>
          <button type="button" className="hero-carousel-arrow" aria-label="Next slide" onClick={goToNext}>
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
