# Afiax FHIR

**FHIR-native clinical infrastructure for Africa.**

Afiax FHIR is the open-source clinical core of [Afiax Connected Healthcare](https://afiax.africa) — a pan-African digital health platform built by Oortcloud Computing Limited. It provides health facilities, insurers, and digital health teams with a standards-based foundation that works with Africa's national health systems out of the box: registries, payer rails, disease surveillance, and compliance, packaged as reusable country integrations on top of a single shared FHIR core.

The first production deployment targets Kenya and is built to [DHA (Digital Health Agency Kenya)](https://dha.go.ke) certification requirements.

**Documentation:** [www.fhirdocs.afiax.africa](https://www.fhirdocs.afiax.africa)  
**Issues:** [GitHub Issues](https://github.com/oortcloudcomputing/afiax-fhir/issues)  
**Base platform:** [Medplum](https://github.com/medplum/medplum) (Apache 2.0)

---

## What makes this different

Most FHIR platforms are built for one market and retrofitted for others. Afiax FHIR is designed the other way: a country-neutral clinical core with national integrations packaged as isolated, testable **country packs** — so Kenya's SHA claims logic never leaks into the platform core, and adding Nigeria later means writing a Nigeria pack, not forking the platform.

| Layer | What it is |
|---|---|
| **Country-neutral core** | Canonical FHIR R4 resources, access control, audit trail, Bots, subscriptions, and workflow operations |
| **Country packs** | Modular overlays that bind national terminology, registries, payer rails, and compliance requirements |
| **Tenant overlays** | Per-customer secrets, settings, and workflow toggles without mutating shared code |

---

## Kenya — first production country pack

Kenya is the first live reference implementation. The Kenya pack connects Afiax FHIR to the national health infrastructure:

| Capability | System | Status |
|---|---|---|
| Facility registry lookup and verification | [DHA AfyaLink HIE](https://dha.go.ke/afyalink) | Live |
| Practitioner registry lookup and verification | DHA AfyaLink HIE | Live |
| Coverage eligibility check | Social Health Authority (SHA) | Live |
| National claims submission | SHA Claims API | Live |
| Claims status tracking | SHA Claims API | Live |
| Private insurer pre-authorization | Coverage `$capture-preauthorization` | Live |
| Private insurer payment recording | Claim `$record-insurance-payment` | Live |
| Patient payment (cash/card/M-Pesa/Afiax Pay) | Claim `$post-patient-payment` | Live |
| ERPNext billing sync | Claim `$push-to-erpnext` | Live |
| IDSR immediate disease notification | Kenya Health Act 2017 s.57 | Live |
| MOH 505 weekly aggregate export | KHIS / DHIS2 | Live |
| Full audit trail | IHE ATNA / HMPR 2025 | Live |

The Kenya pack is being built toward DHA certification (application AFP-2016-KTA4, system category HMIS + Afiax Clinical Suite).

---

## Architecture

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

### Monorepo layout

The repo is a TypeScript monorepo using Turborepo and npm workspaces:

```
packages/
  server/          — FHIR R4 API server, country-pack registry, all operations
  app/             — Afiax Clinical Suite web application (React)
  core/            — shared library: FHIR helpers, Kenya extensions, country-pack contracts
  react/           — shared React component library
  agent/           — on-premise and edge connectivity
  cdk/             — infrastructure as code (AWS CDK)
  cli/             — command line interface
  fhirtypes/       — FHIR TypeScript type definitions
  fhir-router/     — FHIR URL router
  bots/            — Bot runtime examples
  docs/            — documentation site (Docusaurus → www.fhirdocs.afiax.africa)

country-packs/
  kenya/           — Kenya OperationDefinitions, ValueSets, CodeSystems, test fixtures
```

### Key directories in `packages/server/src/`

```
country-pack/kenya/        — Kenya operation handlers and external API clients
  afyalink.ts              — AfyaLink HIE client (facility/practitioner lookup)
  erpnext.ts               — ERPNext billing API client
  mpesa.ts                 — Safaricom M-Pesa Daraja API client
  sha.ts                   — SHA claims submission and status check
  idsr.ts                  — IDSR disease notification handler
  khis-export.ts           — MOH 505 / DHIS2 aggregate export
  capture-preauthorization.ts
  record-insurance-payment.ts
  post-patient-payment.ts
  push-to-erpnext.ts
  mpesa-callback-handler.ts
  afiax-pay-callback-handler.ts

fhir/operations/           — FHIR operation handlers (request parsing, auth, response shaping)
  verify-facility-authority.ts
  submit-national-claim.ts
  check-coverage.ts
  capture-preauthorization.ts
  record-insurance-payment.ts
  post-patient-payment.ts
  push-to-erpnext.ts

fhir/routes.ts             — FHIR operation route registration
app.ts                     — Express app, Kenya callback routes
```

---

## Getting started

### 1. Prerequisites

- Node.js 20+, npm 10+
- Docker Desktop (runs Postgres 14 + Redis 7 for local dev)
- An API client credential from the Afiax FHIR app (see below)

### 2. Get API credentials from the Afiax FHIR app

Before you can connect a local server or run integration tests against the live environment, you need a **ClientApplication** credential from the Afiax FHIR instance.

1. Sign in to [app.afiax.africa](https://app.afiax.africa/signin) with your `@afiax.africa` account.
2. Open the left menu → **Admin** → **Project**.
3. Click the **Clients** tab → **New client**.
4. Give it a name (e.g. `local-dev-yourname`) and click **Save**.
5. Copy the **Client ID** and **Client Secret** — you will need both below.

> If you do not yet have an Afiax app account, email [engineering@afiax.africa](mailto:engineering@afiax.africa) to be added to the dev project.

### 3. Clone and install

```bash
git clone https://github.com/oortcloudcomputing/afiax-fhir.git
cd afiax-fhir
npm install
```

### 4. Start backing services

```bash
# Starts Postgres 14 and Redis 7 in Docker
docker compose up -d
```

Verify they are running:

```bash
docker compose ps
# Both postgres and redis should show "running"
```

### 5. Configure the server

The repo includes `packages/server/medplum.config.json` pre-configured for local development (Postgres and Redis at localhost with default passwords). No edits are needed to get started — the defaults match the Docker Compose setup.

If you need to point your local server at a different database or storage, edit the file directly. Key fields:

```jsonc
{
  "port": 8103,
  "baseUrl": "http://localhost:8103/",
  "database": {
    "host": "localhost",        // change if using a remote Postgres
    "port": 5432,
    "dbname": "medplum",
    "username": "medplum",
    "password": "medplum"
  },
  "redis": {
    "host": "localhost",        // change if using a remote Redis
    "port": 6379,
    "password": "medplum"
  }
}
```

> **Note on the API credentials from step 2:** The ClientApplication credentials you created in `app.afiax.africa` are for connecting client code (your app, scripts, Postman) to the **production** Afiax FHIR server. They are not added to `medplum.config.json`. Instead, put them in a `.env` file or your HTTP client when making requests to `https://api.afiax.africa/fhir/R4/`.
>
> To authenticate against your local server, use the local admin credentials seeded by `npm run migrate`.

### 6. Run database migrations

```bash
cd packages/server
npm run migrate
```

### 7. Build the shared core library

The server imports types and helpers from `packages/core`. Build it once before starting:

```bash
cd packages/core
npm run build
cd ../..
```

> **Important:** Any time you change `packages/core/src/kenya.ts` (new extensions, constants, types), rebuild core before the server sees the changes:
> ```bash
> cd packages/core && npm run build
> ```
> The server's dev watcher excludes `../core/dist/**` on purpose — core changes do not hot-reload.

### 8. Start the server

```bash
# From the repo root
npm run dev
```

The FHIR API is now at `http://localhost:8103`. Test it:

```bash
curl http://localhost:8103/fhir/R4/metadata | python3 -m json.tool | head -10
```

### 9. Start the web app (optional)

In a second terminal:

```bash
cd packages/app
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Kenya pack FHIR operations

All operations are FHIR `$`-operations registered at the instance or type level. They are authenticated via Bearer token and run inside a project context.

### Facility / practitioner

| Operation | Route | Handler |
|---|---|---|
| `$verify-facility-authority` | `POST /Organization/:id/$verify-facility-authority` | Validates facility against AfyaLink HIE |

### Coverage / insurance

| Operation | Route | Description |
|---|---|---|
| `$check-coverage` | `POST /Coverage/:id/$check-coverage` | SHA eligibility check |
| `$capture-preauthorization` | `POST /Coverage/:id/$capture-preauthorization` | Records a private insurer pre-auth approval — creates `Claim` (use: preauthorization) + `ClaimResponse` |

### Claims

| Operation | Route | Description |
|---|---|---|
| `$submit-national-claim` | `POST /Claim/:id/$submit-national-claim` | Submits to SHA Claims API |
| `$record-insurance-payment` | `POST /Claim/:id/$record-insurance-payment` | Records insurer payment — creates `ClaimResponse`, syncs to ERPNext |
| `$post-patient-payment` | `POST /Claim/:id/$post-patient-payment` | Posts patient payment (cash / card / M-Pesa manual / M-Pesa STK / Afiax Pay) |
| `$push-to-erpnext` | `POST /Claim/:id/$push-to-erpnext` | Idempotent sync of all unpushed payments to ERPNext |

### Disease surveillance

| Operation | Route | Description |
|---|---|---|
| `$report-idsr-case` | `POST /Condition/:id/$report-idsr-case` | Sends immediate IDSR notification to KHIS |
| `$export-moh-505` | `POST /Group/:id/$export-moh-505` | Exports MOH 505 aggregate to DHIS2 |

### Webhook callbacks (unauthenticated, project-scoped)

| Route | Description |
|---|---|
| `POST /api/kenya/mpesa-callback/:projectId` | M-Pesa STK push result callback |
| `POST /api/kenya/afiax-pay-callback/:projectId` | Afiax Pay payment status callback |

---

## Patient payment flow

`$post-patient-payment` accepts five payment methods. Synchronous methods (cash, card, mpesa-manual) return immediately with `status: confirmed`. Asynchronous methods (mpesa-stk, afiax-pay) return `status: pending` and complete via callback.

```
POST /Claim/:id/$post-patient-payment
{
  "method": "mpesa-stk",    // cash | card | mpesa-manual | mpesa-stk | afiax-pay
  "amount": 2500,
  "currency": "KES",
  "phone": "0712345678"     // required for mpesa-stk and afiax-pay
}
```

**Async flow:**

1. `$post-patient-payment` creates a `PaymentNotice` with `status: pending` and stores the gateway reference (M-Pesa `CheckoutRequestID` or Afiax Pay `payment_request_id`) in `PaymentNotice.identifier`
2. The gateway calls the callback endpoint when payment completes
3. The callback handler searches for the `PaymentNotice` by gateway reference, updates it to `confirmed`/`failed`, and (if confirmed) creates an ERPNext payment entry

**Project secrets required for M-Pesa STK** (set in the Afiax app → Admin → Project → Secrets):

| Secret name | Description |
|---|---|
| `mpesaConsumerKey` | Daraja API consumer key |
| `mpesaConsumerSecret` | Daraja API consumer secret |
| `mpesaShortCode` | PayBill / Till number |
| `mpesaPasskey` | Lipa na M-Pesa passkey |

**Project secrets required for Afiax Pay:**

| Secret name | Description |
|---|---|
| `afiaxPayBaseUrl` | Afiax Pay API base URL |
| `afiaxPayApiKey` | API key |
| `afiaxPaySecretKey` | API secret |

---

## ERPNext billing integration

ERPNext integration is opt-in per project. Enable it by setting `erpnextEnabled: true` in project settings and adding these project secrets:

| Secret name | Description |
|---|---|
| `erpnextBaseUrl` | ERPNext instance URL (e.g. `https://erp.example.com`) |
| `erpnextApiKey` | ERPNext API key |
| `erpnextApiSecret` | ERPNext API secret |
| `erpnextCompany` | ERPNext company name (exact match) |

When ERPNext is configured, the Kenya pack maintains a billing snapshot on `Claim.extension` (via `KenyaErpNextSubmissionExtension`). The snapshot tracks the Sales Invoice name, total, per-payment entries, and remaining patient due. Use `$push-to-erpnext` to retry any payments that failed to sync.

---

## FHIR extensions defined in `@medplum/core`

All Kenya-specific FHIR extensions are defined in `packages/core/src/kenya.ts` and exported from `@medplum/core`. The key ones:

| Extension | Resource | Purpose |
|---|---|---|
| `KenyaErpNextSubmissionExtension` | `Claim` | ERPNext billing snapshot (invoice, payments, patient due) |
| `KenyaPrivateInsurancePreauthorizationExtension` | `Coverage` | Pre-auth code, validity window, approved procedures |
| `KenyaPatientPaymentExtension` | `PaymentNotice` | Payment method, gateway reference, transaction ref, status |
| `KenyaNationalClaimSubmissionExtension` | `Claim` | SHA submission reference, status, last checked |
| `KenyaFacilityAuthorityExtension` | `Organization` | AfyaLink verification status and MFL code |

Helper functions (`buildKenyaErpNextSubmissionExtension`, `getKenyaErpNextSubmissionSnapshot`, etc.) are co-located in `kenya.ts` and follow the build/get naming convention.

---

## Running tests

```bash
# Core library (shared types and helpers)
cd packages/core && npx jest --runInBand

# Server — all Kenya pack tests
cd packages/server && npx jest src/country-pack/kenya/ --runInBand

# Server — specific test file
cd packages/server && npx jest src/country-pack/kenya/post-patient-payment.test.ts --runInBand

# TypeScript typecheck (no emit)
cd packages/core && npx tsc --noEmit
cd packages/server && npx tsc --noEmit
cd packages/app && npx tsc --noEmit
```

Kenya handler tests (`*.test.ts` in `country-pack/kenya/`) are pure unit tests — no database, no real HTTP. External services (ERPNext, M-Pesa, AfyaLink) are mocked with `jest.mock('node-fetch')`. The `createAuditEvent` utility must also be mocked in any test that exercises a handler, because it calls `getConfig()`:

```typescript
jest.mock('../../util/auditevent', () => ({
  createAuditEvent: jest.fn(() => ({ resourceType: 'AuditEvent', entity: [] })),
  AuditEventOutcome: { Success: '0', MinorFailure: '4', MajorFailure: '8' },
  OperationInteraction: { code: 'operation' },
  RestfulOperationType: { code: 'rest' },
}));
```

---

## Adding a new country pack

1. Create `packages/server/src/country-pack/<country>/index.ts` — defines the pack and its operations
2. Register operations in `packages/server/src/fhir/routes.ts`
3. Define country-specific FHIR extensions and constants in `packages/core/src/<country>.ts`
4. Add OperationDefinition JSON files to `country-packs/<country>/`
5. Follow the Kenya pack as the reference: every handler takes a typed input object, returns a typed result, is fully testable in isolation, and writes a `Task` + `AuditEvent` on every invocation

See [www.fhirdocs.afiax.africa/docs/country-packs](https://www.fhirdocs.afiax.africa/docs/country-packs) for the full country pack contract.

---

## FHIR compliance

This server implements [FHIR R4](https://hl7.org/fhir/R4/) and targets the following implementation guides:

- [Da Vinci Prior Authorization (DAVINCI-PAS)](https://hl7.org/fhir/us/davinci-pas/) — pre-authorization workflow
- [SMART App Launch](https://hl7.org/fhir/smart-app-launch/) — OAuth 2.0 / PKCE authorization
- [IHE ATNA](https://profiles.ihe.net/ITI/TF/Volume1/ch-9.html) — audit trail and node authentication
- HMPR 2025 (Kenya Health Management and Patient Records standard) — audit event structure and retention

---

## Contributing

Afiax FHIR is open source under the Apache 2.0 license.

Pull requests go against `main`. For country-pack work, check whether the logic belongs in the country pack or whether it is general enough to live in core. New features should start with a brief design note in [GitHub Issues](https://github.com/oortcloudcomputing/afiax-fhir/issues) before implementation, especially for anything that touches core types or adds new extension URLs.

**Commit style:** conventional commits (`feat:`, `fix:`, `chore:`) — the CI changelog generator depends on this.

---

## Documentation site

The docs at [www.fhirdocs.afiax.africa](https://www.fhirdocs.afiax.africa) are built from `packages/docs/` using Docusaurus and deployed automatically to GitHub Pages when `main` changes. To preview locally:

```bash
# Build core first (docs copy-core-docs pulls from core/dist/)
cd packages/core && npm run build && cd ../..

# Start docs dev server
cd packages/docs && npm run start
# Opens http://localhost:3001
```

---

## Foundation

Afiax FHIR is built on [Medplum](https://github.com/medplum/medplum) open-source software (Apache 2.0) — the upstream reference implementation for FHIR R4. Internal package namespaces (`@medplum/*`) are intentionally preserved for upstream compatibility. Public product identity is Afiax FHIR.

See [Medplum documentation](https://www.medplum.com/docs) for the base platform architecture. Afiax-specific additions are described at [www.fhirdocs.afiax.africa](https://www.fhirdocs.afiax.africa).

---

## License

Apache 2.0 — see `LICENSE.txt`

Built by [Oortcloud Computing Limited](https://afiax.africa) · Nairobi, Kenya
