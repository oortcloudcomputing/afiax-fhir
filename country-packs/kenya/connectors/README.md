# Connectors

This directory is the repo-level integration boundary for Kenya-specific remote systems.

In this fork, connector code is the narrow layer that turns canonical Afiax FHIR input into Kenya remote calls and
turns Kenya remote responses back into normalized workflow data. It is not UI code, and it is not the place to create
FHIR evidence resources such as `Task` or `AuditEvent`.

## Read this first

Start here before editing any Kenya connector:

- `packages/server/src/country-pack/kenya/afyalink.ts`
- `packages/server/src/country-pack/kenya/sha.ts`
- `packages/server/src/country-pack/kenya/verify-facility-authority.ts`
- `packages/server/src/country-pack/kenya/verify-practitioner-authority.ts`
- `packages/server/src/country-pack/kenya/check-coverage.ts`
- `packages/server/src/country-pack/kenya/submit-national-claim.ts`
- `packages/server/src/country-pack/kenya/check-national-claim-status.ts`

Then read the matching operation notes:

- `country-packs/kenya/operations/verify-facility-authority.md`
- `country-packs/kenya/operations/verify-practitioner-authority.md`
- `country-packs/kenya/operations/check-coverage.md`
- `country-packs/kenya/operations/submit-national-claim.md`
- `country-packs/kenya/operations/check-national-claim-status.md`

## What connector code owns

Connector code in this repo owns exactly these responsibilities:

1. resolve the correct Kenya environment from `Project.setting`
2. resolve the correct secret surface from `Project.secret` or `Project.systemSecret`
3. authenticate to the remote system
4. build the outbound request
5. execute the request
6. normalize the inbound response shape
7. return enough metadata for the pack handler to persist workflow evidence

Connector code does not own:

- browser-side forms
- resource-page button behavior
- `Task` creation
- `AuditEvent` creation
- extension writes onto `Organization`, `Practitioner`, `Coverage`, or `Claim`
- ERPNext, Afiax Billing, or Afiax Pay payload generation

Those responsibilities belong in the pack handlers, resource panels, or downstream bots.

## Current connector surfaces

### DHA HIE

Main file:

- `packages/server/src/country-pack/kenya/afyalink.ts`

The connector follows the current DHA HIE documentation at https://hie-docs.dha.go.ke (checked
2026-11-10; pages last modified 2026-09-28). It replaced the retired AfyaLink v1 API
(`GET /v1/hie-auth?key=…` with Basic auth), which DHA no longer accepts. Always check the live DHA
docs and their changelog before changing this connector.

Credentials:

- a **client ID** and **client secret** for an app in the DHA AfyaConnect developer portal
  (https://afyaconnect.dha.go.ke, reached from the certification portal's "Open AfyaConnect")
- project secrets `kenyaHieClientId` and `kenyaHieClientSecret`; the earlier names
  `kenyaAfyaLinkConsumerKey` and `kenyaAfyaLinkPassword` are still read as a fallback
- optional `kenyaHieBaseUrl` (default for UAT: `https://ilm-dev.dha.go.ke/uat-middleware/api/v1`;
  DHA issues the production URL with production credentials after certification)
- optional `kenyaHieFacilityId`: a Facility Registry code (`FID-…`), only for multi-facility
  credentials. A facility-scoped token already names its facility in the `facility_id` claim.

Current responsibilities:

- resolve Kenya HIE environment
- resolve tenant-managed or Afiax-managed HIE credentials
- get and cache an access token (OAuth2 client credentials)
- send `X-Facility-Id` / `X-Facility-Id-Type: fr-code` when `kenyaHieFacilityId` is set
- facility search by FR code or KMHFL code
- practitioner search by licence number and regulator, or by ID
- Client Registry patient search
- SHA eligibility check
- treat DHA's "no match" answers (400 with "zero results" or "no practitioner membership") as
  not found

Current workflows that depend on it:

- Kenya setup wizard facility lookup
- facility verification
- practitioner lookup
- practitioner verification
- coverage eligibility checks

### Kenya SHA

Main file:

- `packages/server/src/country-pack/kenya/sha.ts`

Current responsibilities:

- resolve Kenya SHA environment
- resolve tenant-managed or Afiax-managed SHA credentials
- generate short-lived JWTs for SHA calls
- submit national claim bundles
- refresh national claim status
- parse either bundle-style `ClaimResponse` payloads or root-level claim-state payloads
- return submission and status endpoint metadata for operator debugging

Current workflows that depend on it:

- claim submission
- claim-status refresh

## Current config split

### HIE connector config

Non-secret settings:

```text
kenyaHieEnvironment
kenyaHieCredentialMode
kenyaHieAgentId
```

Tenant-managed secrets:

```text
kenyaAfyaLinkConsumerKey
kenyaAfyaLinkUsername
kenyaAfyaLinkPassword
```

Optional override:

```text
kenyaAfyaLinkBaseUrl
```

Operational notes:

- `kenyaHieEnvironment` controls `uat` vs `production`
- `kenyaHieCredentialMode` controls whether credentials are read from `Project.secret` or `Project.systemSecret`
- `kenyaHieAgentId` exists for future Kenya HIE surfaces that require an explicit agent identifier
- `kenyaAfyaLinkBaseUrl` is an override only; prefer the environment-derived base URL unless DHA documentation changes

### SHA connector config

Non-secret settings:

```text
kenyaShaClaimsEnvironment
kenyaShaClaimsCredentialMode
```

Tenant-managed secrets:

```text
kenyaShaClaimsAccessKey
kenyaShaClaimsSecretKey
kenyaShaClaimsCallbackUrl
```

Optional override:

```text
kenyaShaClaimsBaseUrl
```

Operational notes:

- `kenyaShaClaimsEnvironment` controls `uat` vs `production`
- `kenyaShaClaimsCredentialMode` controls whether SHA credentials are tenant-managed or Afiax-managed
- `kenyaShaClaimsCallbackUrl` is captured now even though callback intake is not implemented yet
- `kenyaShaClaimsBaseUrl` is an override only; the built-in defaults follow the current Kenya SHA environment mapping

## Request patterns currently implemented

All HIE paths below are relative to the HIE base URL.

### HIE auth

- method: `POST`
- path: `/tenants/token`
- body: form fields `client_id`, `client_secret`
- response: `access_token` (Bearer), `expires_in` (about 3600 seconds)
- the token is cached until a minute before it expires; the "Test HIE Connection" buttons always
  authenticate again

### Facility lookup

- method: `GET`
- path: `/facilities/search?identifier=...&identifier-type=fr-code|mfl`
- auth mode: Bearer token
- canonical input:
  - FR code (`FID-…`) or KMHFL code from `Organization.identifier`
- normalization behavior:
  - the response is an array of facility records; the first one is used
  - `facilityLicenseStatus` LICENSED means approved; anything else is reported as not approved
  - `regulatoryOperationalStatus.operationalStatus` is the operational status

### Practitioner lookup

- method: `GET`
- path: `/professionals?identification_number=...&identification_type=...&regulator=...`
- auth mode: Bearer token
- canonical input:
  - KMPDC or COC licence number (sent as `registration_number` with the regulator)
  - PPB or NCK National ID (sent as `National ID` with the regulator)
  - National, Alien or Refugee ID

### Client Registry

- method: `GET`
- path: `/patients?identification_number=...&identification_type=...`
- auth mode: Bearer token
- output: the patient's Client Registry ID (CR ID) and demographics. No agent ID is needed.

### Eligibility

- method: `GET`
- path: `/patients/eligibility?identification_number=...&identification_type=...`
- auth mode: Bearer token
- canonical input:
  - identifier type (DHA prefers `ClientRegistry ID`) and number from `Coverage`
- normalization behavior:
  - eligible when a scheme in `schemes[]` has an active coverage status
  - never eligible when `isAlive` is false
  - passes through `whitelistedForOTP` and `facilityBiometricsEnforced`, which decide the consent
    method for a visit

### SHA visit consent and start visit

Main files: `packages/server/src/country-pack/kenya/hie-visit.ts` (DHA calls) and
`packages/server/src/fhir/operations/kenyashavisit.ts` (Encounter operations). Built from the DHA
Start Visit, Send OTP and Biometrics Consent pages (last modified 2026-09-28).

The patient must have a Client Registry ID (`Patient.identifier` with system
`https://afiax.africa/kenya/identifier/client-registry-id`). The eligibility check's
`facilityBiometricsEnforced` and `whitelistedForOTP` decide the consent path.

`POST Encounter/{id}/$kenya-visit-consent`, one `action` per call:

| action | DHA call | Inputs |
|---|---|---|
| `contacts` | `GET /patients/contacts` | none; returns masked numbers to choose from |
| `send-otp` | `POST /claims/otp` | `interventionCode` (one or more), optional `contactId` |
| `authorize-biometrics` | `POST /claims/authorize` | `serviceType`, `interventionCode`, `agentId` (agent National ID), `workStationId` (from HealthID `http://localhost:18065/status`), `deviceOs`; the facility FR code and name come from the encounter's `serviceProvider` (or `facilityFrCode`) |
| `authorization-status` | `GET /claims/authorizations` | `authorizationGuid` or `consentToken`. DHA documents a `patient_id` search but UAT rejects it |
| `cancel-authorization` | `POST /claims/authorizations/{token}/reject` | `consentToken`; clears a fingerprint capture stuck in PENDING |

The fingerprint authorization returns `captureUrl` (DHA's capture page, shown to the patient). It
becomes `AUTHORIZED` (or `AUTHORIZED_PENDING_VISIT` for elective cases). `REJECTED` with reason
`BIOMETRICS_NOT_FOUND_OTP_ALLOWED` means: switch to OTP, do not retry fingerprints.

`POST Encounter/{id}/$kenya-start-visit` calls `POST /claims/visit` with `serviceType`
(OUTPATIENT, INPATIENT, CAPITATION or EMERGENCY), `interventionCode`, and either `otp` or
`authorizationGuid`; the attending doctor is optional (`practitionerIdentificationNumber`,
`practitionerRegulator`, `practitionerIdentificationType`). It records the visit on the Encounter:
extension `https://afiax.africa/fhir/StructureDefinition/kenya-sha-visit` (claim ID, consent token,
authorization GUID, visit number, service type, consent method, intervention codes, workflow state,
scheme) and the identifier `https://afiax.africa/kenya/identifier/sha-visit-claim-id`. The consent
token is needed by every later claim call. A second start on the same encounter is refused.

Both operations are for staff (Practitioner) who may update the Encounter.

### Not yet migrated

These still use earlier DHA and SHA paths and need rework against the current HIE docs:

- Shared Health Record publication: now `POST /shr/bundles`, after patient consent
  (`POST /shr/consents`, verify the OTP) opens a visit. `publishToAfyaLinkShr` fails with a clear
  message until that flow exists.
- SHA claims: now the HIE eClaims API (`POST /claims/visit`, billing lines, `POST /claims/submit`
  and so on), not a FHIR claim bundle to `/v1/shr-med/bundle`.

### SHA claim submit

- method: `POST`
- path: `/v1/shr-med/bundle`
- auth mode: JWT signed with SHA access key and secret key
- payload: FHIR `Bundle`
- canonical input:
  - bundle prepared by the Kenya claim handler from a valid `Claim` graph

### SHA claim status

- method: `GET`
- path: `/v1/shr-med/claim-status?claim_id=...`
- auth mode: JWT signed with SHA access key and secret key
- canonical input:
  - claim id or bundle id persisted during the Kenya claim submit flow

## Execution path by workflow

### Facility lookup and verification

1. resource panel saves the Kenya facility code on `Organization.identifier`
2. the handler reads the canonical facility code from the resource
3. `afyalink.ts` resolves HIE environment and credentials
4. `afyalink.ts` authenticates and calls the DHA Facility Registry (`/facilities/search`)
5. `afyalink.ts` normalizes the raw DHA payload
6. the Kenya handler decides whether the result is usable, persists the registry snapshot, and writes workflow evidence

### Practitioner lookup and verification

1. resource panel saves the Kenya identifier on `Practitioner.identifier`
2. the handler derives identification type and number from the resource
3. `afyalink.ts` authenticates and calls DHA practitioner search
4. the handler maps the normalized lookup result into practitioner registry and verification state

### Coverage eligibility

1. resource panel saves the eligibility lookup identifier on `Coverage.identifier`
2. the handler derives request input from `Coverage`
3. `afyalink.ts` authenticates and calls the DHA eligibility surface
4. the handler persists the Kenya eligibility snapshot and creates the FHIR evidence resources

### Claim submit and claim status

1. the Kenya claim handler prepares the bundle from the `Claim` graph
2. `sha.ts` resolves SHA credentials and generates the JWT
3. `sha.ts` submits or refreshes the claim status
4. the handler persists the Kenya claim snapshot, task, audit evidence, and local `ClaimResponse` where applicable

## What connector helpers should return

Connector helpers in this pack should return:

- normalized workflow-relevant fields
- raw response text where possible
- parsed response when it is safe and useful
- endpoint metadata useful for debugging
- remote identifiers needed for retries, refresh, or reconciliation

Connector helpers should not return:

- screen-specific presentation strings
- direct UI state
- secrets or secret fragments
- ERPNext or Afiax Billing payloads

## Adding a new Kenya connector

Use this sequence instead of starting from the UI:

1. add or extend the transport/auth helper in `packages/server/src/country-pack/kenya/`
2. add a focused unit test for response normalization
3. add or update the pack handler that consumes the connector
4. add or update the FHIR operation contract
5. add or update the resource panel or admin surface
6. document the connector behavior in this directory and the matching operation note

If you need a new Kenya remote system, keep the same pattern:

- connector file for transport and normalization
- handler file for workflow semantics
- UI only after the backend contract is stable

## Debugging order

When a connector path fails, check these in order:

1. the project is actually on `countryPack=kenya`
2. the correct environment was selected for the flow you are testing
3. the correct credential mode is selected
4. the secrets exist in the expected secret surface
5. the resource carries the expected canonical identifier
6. the raw remote payload is what the connector claims it is
7. the normalization layer handled the response shape you actually received

Do not start by editing the UI if the raw Kenya connector response is already wrong.

## Boundary rule

If a change only affects how Kenya talks to DHA or SHA, it belongs in connector or handler code.

If a change affects invoice creation, payment posting, Afiax Pay, or ERPNext document mapping, it does not belong in
this directory or in this repo.
