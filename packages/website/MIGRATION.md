# WordPress Migration Playbook

This document guides the replacement of `www.afiax.africa` with the monorepo-managed Next.js website in this package.

## Objective

Create a public enterprise website that:

- preserves the richness and confidence of the current brand presentation
- reflects the real platform structure documented in this repo
- separates implemented capabilities from active delivery and planned direction
- gives future developers and content authors a stable operating model

## Recommended target structure

Initial public navigation:

- `Overview`
  - platform story
  - architecture at a glance
  - implementation-state framing
- `Platform`
  - Afiax FHIR core
  - country-pack model
  - deployment models
  - adjacent enterprise-service boundaries
- `Country Packs`
  - pack model
  - Kenya as first reference pack
- `Delivery`
  - live vs in-delivery vs planned
  - governance and product-direction language

Planned follow-on sections:

- `Solutions`
  - provider organizations
  - public-sector and national programs
  - payers and scheme operators
- `Company`
  - program vision
  - operating model
  - contact and partnership routes
- `Developers`
  - link through to the engineering docs and implementation references

## WordPress-to-Next migration rules

When porting pages from WordPress:

1. keep the visual ambition
2. rewrite the copy
3. remove template filler and duplicated claims
4. attach a delivery-state label to any capability-heavy section
5. route deep technical material to the docs experience instead of overloading the marketing site

## Content-state model

Use only these public labels:

- `Live`
  - implemented and supportable now
- `In Delivery`
  - actively being built or formalized
- `Planned`
  - architecture or product direction, not yet available for operational claims

## Tone guide

Target tone:

- enterprise-grade
- outcome-led
- restrained
- integrated
- credible

Reference style:

- similar to Oracle Health in structure and discipline
- not a copy of Oracle wording

Use copy that:

- starts with the operational problem or workflow burden
- explains how Afiax helps reduce fragmentation, manual work, delay, or coordination gaps
- frames the platform as integrated and scalable
- keeps architecture in service of outcomes

Avoid copy that:

- sounds speculative or inflated
- lists every future subsystem in one paragraph
- claims compliance or certification without deployment context
- mixes architecture notes with launch-ready product promises

## Suggested content review workflow

For each page before publish:

1. check whether every major capability statement is labeled `Live`, `In Delivery`, or `Planned`
2. confirm that the page matches the architecture boundaries in the repo docs
3. remove any wording that implies adjacent services are already delivered in this repo when they are not
4. verify that the page still sounds commercially strong after those corrections

## Engineering notes

- keep this site inside the monorepo so content and architecture can evolve together
- reuse neutral Medplum UI primitives before inventing new container and panel patterns
- prefer shared content structures over hard-coded page-specific status text
- reserve the docs package for deeper technical and developer-facing material
- keep the public website focused on platform meaning, delivery state, and commercial clarity
