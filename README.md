# Afiax FHIR

**FHIR-native clinical infrastructure for Africa.**

Afiax FHIR is the open-source clinical core of Afiax Connected Healthcare — a pan-African digital health platform built by Oortcloud Computing Limited. It gives health facilities, insurers, and digital health teams a standards-based foundation that works with Africa's national health systems out of the box: registries, payer rails, disease surveillance, and compliance, packaged as reusable country integrations on top of a single shared FHIR core.

The first production deployment targets Kenya and is built to DHA (Digital Health Agency Kenya) certification requirements.

---

## What makes this different

Most FHIR platforms are built for one market and retrofitted for others. Afiax FHIR is designed the other way: a country-neutral clinical core with national integrations packaged as isolated, testable **country packs** — so Kenya's SHA claims logic never leaks into the platform core, and adding Nigeria later means writing a Nigeria pack, not forking the platform.

**Country-neutral core** — canonical FHIR resources, access control, audit trail, Bots, subscriptions, and workflow operations that work the same in every country.

**Country packs** — modular overlays that bind national terminology, registries, payer rails, claims, disease surveillance, and health information exchange without touching the shared core.

**Tenant overlays** — per-customer configuration, secrets, and workflow toggles that let operators customize without mutating the shared platform.

---

## Kenya — first production country pack

Kenya is the first live reference implementation. The Kenya pack connects Afiax FHIR to the national health infrastructure:

| Capability | System | Status |
|---|---|---|
| Facility registry lookup and verification | DHA AfyaLink HIE | Live |
| Practitioner registry lookup and verification | DHA AfyaLink HIE | Live |
| Coverage eligibility | Social Health Authority (SHA) | Live |
| National claims submission | SHA Claims API | Live |
| Claims status tracking | SHA Claims API | Live |
| IDSR immediate disease notification | Kenya Health Act 2017 s.57 | Live |
| MOH 505 weekly aggregate export | KHIS / DHIS2 | Live |
| Full audit trail | IHE ATNA / HMPR 2025 | Live |

The Kenya pack is being built toward DHA certification (application AFP-2016-KTA4, system category HMIS + Afiax Clinical Suite).

---

## Architecture in brief

```
┌─────────────────────────────────────────────────────┐
│                  Afiax Enterprise                   │
│  (Billing · Pay · Analytics · Mobile · Telehealth)  │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│                   Afiax FHIR                        │  ← this repo
│  FHIR CDR · Auth · Bots · Ops · Subscriptions       │
│  ┌──────────────┐  ┌──────────┐  ┌───────────────┐  │
│  │ Kenya pack   │  │  (NG)    │  │   (ZA) ...    │  │
│  │ AfyaLink·SHA │  │ future   │  │   future      │  │
│  └──────────────┘  └──────────┘  └───────────────┘  │
└─────────────────────────────────────────────────────┘
```

The repo is a TypeScript monorepo using Turborepo and npm workspaces:

```
packages/
  server/       — FHIR R4 API server, country-pack registry, all operations
  app/          — Afiax Clinical Suite web application (React)
  core/         — shared library: FHIR helpers, Kenya extensions, country-pack contracts
  react/        — shared React component library
  agent/        — on-premise and edge connectivity
  cdk/          — infrastructure as code (AWS CDK)
  cli/          — command line interface
  fhirtypes/    — FHIR TypeScript type definitions
  fhir-router/  — FHIR URL router
  bots/         — Bot runtime examples
  docs/         — documentation site (Docusaurus)

country-packs/
  kenya/        — Kenya operation docs, ValueSets, CodeSystems, fixtures
```

---

## Getting started (local development)

**Prerequisites:** Node.js 18+, npm 10+, PostgreSQL 14+, Redis 7+

```bash
# Clone and install
git clone https://github.com/mattwamoto/afiax-fhir.git
cd afiax-fhir
npm install

# Build the shared core first
cd packages/core && npm run build && cd ../..

# Start the server (requires a local Postgres + Redis — see packages/server/README.md)
cd packages/server && npm run dev

# Start the web app
cd packages/app && npm run dev
```

For a full local environment including Postgres and Redis, use the Docker Compose setup in `docker-compose.yml`.

---

## Country pack development

If you are building a new country integration, start in `country-packs/` and `packages/server/src/country-pack/`.

The Kenya pack is the reference implementation. Read it in this order:

1. `country-packs/kenya/README.md` — what the Kenya pack does and how it is structured
2. `packages/server/src/country-pack/kenya/index.ts` — pack definition and operation registry
3. `packages/server/src/country-pack/kenya/afyalink.ts` — AfyaLink HIE client pattern
4. `packages/server/src/country-pack/kenya/idsr.ts` — IDSR notification handler pattern
5. `packages/server/src/country-pack/kenya/khis-export.ts` — DHIS2 export handler pattern

All Kenya operations follow the same structure: input validation → external API call → Task creation → AuditEvent. New country packs follow the same pattern.

---

## Running tests

```bash
# Core library
cd packages/core && npx jest --runInBand

# Server (Kenya pack)
cd packages/server && npx jest src/country-pack/kenya/ --runInBand

# Typecheck
cd packages/core && npx tsc --noEmit
cd packages/server && npx tsc --noEmit
cd packages/app && npx tsc --noEmit
```

---

## Documentation

The full developer documentation lives in `packages/docs/`. The architecture docs are the right starting point:

- `packages/docs/docs/architecture/` — platform architecture, enterprise model, canonical FHIR model
- `packages/docs/docs/country-packs/` — country pack contracts and Kenya implementation guide
- `packages/docs/docs/self-hosting/` — sovereign deployment guide

---

## Contributing

Afiax FHIR is open source under the Apache 2.0 license.

Contributions follow the same pull request model as the upstream Medplum project. New features should go through a brief design note before implementation, especially for country-pack additions — the goal is to keep country-specific assumptions out of the shared core.

The development branch is `main`. Open a pull request against `main`. For country-specific work, consider whether the logic genuinely belongs in a country pack or whether it is general enough to live in core.

---

## Foundation

Afiax FHIR is built on [Medplum](https://github.com/medplum/medplum) open-source software (Apache 2.0). Internal package namespaces (`@medplum/*`) are intentionally preserved for upstream compatibility. Public product identity is Afiax FHIR.

See `packages/docs/docs/architecture/platform-foundation.md` for the naming and attribution model.

---

## License

Apache 2.0 — see `LICENSE.txt`

Built by [Oortcloud Computing Limited](https://afiax.africa) · Nairobi, Kenya
