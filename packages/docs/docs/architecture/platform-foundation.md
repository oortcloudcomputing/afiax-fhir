---
sidebar_position: 6
---

# Platform Foundation

Afiax FHIR is the product documented in this repo.

It is built on top of Medplum open-source software and extended for the Afiax Connected Healthcare program under
Oortcloud Computing.

This page exists to keep the naming, attribution, and engineering scope honest while still documenting the repo as a
real Afiax product rather than a generic fork.

## Naming model

Use these names consistently:

- `Afiax FHIR`: the FHIR-native clinical core in this repo, the backbone of **Afiax Clinical Suite**
- `Afiax Enterprise`: the broader commercial platform that connects Afiax FHIR to adjacent services
- `Afiax Connected Healthcare`: the trading name of Oortcloud Computing Limited and its market-facing programme
- `Medplum`: the upstream open-source project (Apache-2.0) that Afiax FHIR is built on

## Rebrand rule

**All prose is Afiax.** Headings, explanations, tutorials, UI copy, diagrams and contact details say Afiax, not Afiax. Hosted URLs point to Afiax (`app.afiax.africa`, `fhir.afiax.africa`), and contact addresses are `@afiax.africa`.

Some names stay as they are, because changing them would break code or misstate facts:

| Keep as is | Why | Examples |
| --- | --- | --- |
| Code identifiers | Renaming breaks builds and every existing integration | `@medplum/core`, `MedplumClient`, `MEDPLUM_BASE_URL`, `medplum.config.json`, `medplum` CLI |
| Canonical and system URLs | Stored in data and FHIR profiles; changing them breaks existing records | `https://medplum.com/fhir/StructureDefinition/...`, `https://www.medplum.com/bots` |
| Install paths and package names of upstream builds | They are the real names on disk | `C:\Program Files\Medplum Agent`, `medplum/medplum-server` image |
| Open-source attribution | Required by the Apache-2.0 licence | SPDX headers, `NOTICE`, "built on Medplum open-source software" |

**Afiax Inc.'s own claims must never be presented as Afiax's.** These include its SOC 2, HIPAA, ONC and other US certifications, its uptime and usage figures, customer logos, pricing, careers, terms and privacy policy. That material lives in `_upstream-medplum/` folders, which are not published. For Afiax's own position, see [Compliance](/docs/compliance) and [Security](/security).

When you write a new page, read it through once before committing and check for stray "Afiax" in prose.

## Current engineering scope of this repo

This repo currently documents and implements:

- Afiax FHIR core behavior
- pack-aware administration and workflow surfaces
- country-pack contracts
- extensions that stay compatible with upstream Medplum, needed for Afiax Enterprise
- documentation contracts for Afiax Billing, Afiax Pay, and partner integrations

This repo does not currently implement:

- Afiax Billing ERP execution
- Afiax Pay execution logic
- Lami partner transport
- mobile gateway implementation
- analytics or AI services

Adjacent services such as gateways, Knative executors, ERP integrations, and mobile applications remain part of the
broader Afiax Enterprise architecture, but not part of the core documented scope of this repo.

## Upstream alignment rule

Afiax FHIR is built on Medplum. It is not a rewrite, so this repo should preserve:

- upstream package compatibility where practical
- extension points that stay compatible with upstream Medplum
- open-source attribution
- a clean split between the upstream foundation and Afiax-specific adaptation (for example, country packs)

It should avoid:

- renaming code identifiers (`@medplum/*`, `MEDPLUM_*`) without a migration plan
- changing core behaviour only for branding reasons

## Practical documentation rule

When writing docs in this repo:

- product pages should sound like Afiax FHIR
- architecture pages should explain how Afiax FHIR fits into Afiax Enterprise
- country-specific behaviour should live in country-pack docs
- write for a beginner: say what the reader will end up with, list prerequisites, number the steps, show the expected result, and add a troubleshooting section

## Related docs

- [Architecture overview](./index.md)
- [Enterprise platform](./enterprise-platform)
- [Canonical FHIR model](./canonical-model)
- [Country packs](../country-packs)
