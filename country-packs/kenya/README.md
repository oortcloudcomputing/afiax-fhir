# Kenya Country Pack

This directory is the repo-level implementation surface for the Kenya country pack.

Use it for two things:

1. understand what Kenya-specific behavior exists in this fork today
2. add Kenya logic without leaking DHA, SHA, or AfyaLink assumptions into core Medplum behavior

This pack is the first real reference implementation of the Afiax country-pack model. It is not a generic architecture
folder. It is the Kenya boundary.

## What belongs here

Kenya-specific concerns that belong in this pack:

- DHA HIE authentication assumptions
- AfyaLink facility lookup and facility verification
- AfyaLink practitioner lookup and practitioner verification
- DHA eligibility lookup inputs and response mapping
- SHA claim bundle preparation
- SHA claim submission and status refresh
- Kenya-specific workflow bot handoff after submit or status refresh
- Kenya fixtures, mappings, and compliance notes

What does **not** belong here:

- generic FHIR modeling rules that apply to all countries
- ERPNext or Afiax Billing implementation code
- Afiax Pay implementation code
- non-Kenya pack settings
- direct browser-side integration logic

## Current implementation status

Implemented in this repo now:

- project-level `countryPack=kenya`
- Kenya setup wizard in `/admin/country-pack`
- tenant-managed Kenya HIE credentials in `/admin/secrets`
- Afiax-managed Kenya HIE credentials in `/admin/super`
- tenant-managed Kenya SHA credentials in `/admin/secrets`
- Afiax-managed Kenya SHA credentials in `/admin/super`
- `Organization` Kenya facility code capture, DHA lookup, and audited verification
- `Practitioner` Kenya identity capture, DHA lookup, and audited verification
- `Coverage` Kenya eligibility lookup and eligibility evidence persistence — includes AfyaLink v3
  extended fields (`means_testing_done`, `employment_type`, `employer_name`, `eligible_employee`,
  `policy_end_employer`)
- `Claim` Kenya SHA bundle preparation and submit
- `Claim` Kenya SHA status refresh and local `ClaimResponse` upsert
- `Claim/$request-preauthorization` — submits a SHA pre-authorization bundle with `Claim.use: preauthorization`
- Kenya SHR national record publication — `Patient/$publish-national-record` builds a FHIR Bundle document
  (Patient + optional active Conditions + optional recent Encounters) and publishes it to the AfyaLink
  SHR endpoint `/v1/shr/patient-record`; publication snapshot persisted on `Patient.extension`;
  UI panel on `/Patient/{id}` with Include Conditions / Include Encounters toggles
- optional post-submit Kenya workflow bot
- optional post-status-refresh Kenya workflow bot
- IHE ATNA `AuditEvent.action` correctly set to `E` (Execute) for all `operation`, `batch`,
  and `transaction` subtypes — satisfies HMPR 2025 Reg.12(c)(i)
- IDSR immediate notification — `Condition/$report-idsr-notification` creates a 24-hour deadline
  `Task` and `AuditEvent` when a Condition carries a Kenya IDSR ICD-10 code; satisfies Kenya
  Health Act 2017 s.57 and IDSR Technical Guidelines 3rd Edition (2024)
- KHIS/DHIS2 weekly aggregate export — `$khis-weekly-export` aggregates FHIR Conditions by
  ICD-10 code and pushes MOH 505 weekly counts to KHIS via DHIS2 `dataValueSets` API;
  satisfies Kenya Health Act 2017 s.57–63 and IDSR Technical Guidelines (weekly tier)
- IDSR automatic trigger — `maybeAutoTriggerIdsr()` fires in-process on every Condition create/update;
  if the Condition carries a Kenya IDSR immediately-notifiable ICD-10 code and has not already been
  notified, a 24-hour deadline `Task` and `AuditEvent` are created with `purposeOfEvent: PUBHLTH`;
  satisfies Kenya Health Act 2017 s.57(1) without requiring a FHIR Subscription or separate Bot
- KHIS weekly scheduler — `POST /admin/projects/:projectId/kenya/provision-khis-scheduler`
  creates a Bot with `cronString: "0 3 * * 1"` (Monday 06:00 EAT) that iterates all active
  Organizations and calls `$khis-weekly-export` for each; enables `cron` project feature
- Break-glass emergency access declaration — `Patient/$break-glass` creates a `Flag`, writes a
  snapshot extension on the `Patient`, emits an `AuditEvent` with `purposeOfEvent: ETREAT`, and
  sends a security alert email; satisfies Kenya DPA 2019 s.25 and Digital Health Act 2023 s.19
- FHIR security label enforcement — Confidentiality R/V labels block single-resource reads and
  are stripped from Bundle search results unless the requester holds an active break-glass `Flag`;
  satisfies Kenya DPA 2019 s.25 and Digital Health Act 2023 s.19
- DHA Client Registry patient lookup (AfyaLink v3) — `POST /admin/projects/:projectId/kenya/afyalink/patient-lookup`
  calls `/v3/client-registry/fetch-client` with `agent` param; `KenyaPatientWizard` uses DHA as
  the sole source of truth (patient must be found in DHA registry before registration is allowed)
- SHA async callback ingestion — public endpoint `POST /kenya/sha-callback/:projectId` receives
  SHA adjudication push notifications, optionally verifies HS256 JWT, finds the Claim by bundle ID,
  upserts `ClaimResponse`, and updates open `Task` records without requiring a full status-check cycle
- Kenya production runbooks (`compliance/runbooks/`) — DHA outage, SHA outage, credential
  rotation, SHA callback verification, monthly claim reconciliation, and production cutover
  checklist with sign-off table
- Cutover automation script (`scripts/kenya-preflight.sh`) — verifies project settings, HIE
  connectivity, facility/practitioner presence, callback endpoint, and audit trail tamper-protection
- Kenya claim queue + reconciliation panel in `/admin/country-pack` — lists Claims with SHA
  submission snapshots, supports status filtering, and allows per-claim `$check-national-claim-status`
  trigger

Not implemented yet:

- None. All planned Kenya pack features are implemented.

## Known bugs fixed

| Date | File | Bug | Fix |
|---|---|---|---|
| 2026-06-14 | `packages/core/src/kenya.ts:340` | `getKenyaFacilityRegistrySnapshot` used `&&` instead of `||` in null-guard, allowing snapshot creation when either `facilityCode` or `lookedUpAt` was missing | Changed to `\|\|` — returns `undefined` if either required field is absent |
| 2026-06-14 | `packages/server/src/util/auditevent.ts` | `AuditEventActionLookup` returned `undefined` for `operation`, `batch`, `transaction` subtypes — `AuditEvent.action` was absent on all Country Pack operations | Changed all three to `'E'` (FHIR R4 Execute action) |

## Directory layout

```text
country-packs/kenya/
  README.md
  bots/
  codesystems/
  compliance/
  connectors/
  fixtures/
  mappings/
  operations/
  profiles/
  valuesets/
```

Current practical use of these folders:

- `operations/`: developer-facing notes for generic operations implemented by the Kenya pack
- `fixtures/`: request and response samples used when shaping or testing Kenya integrations
- `bots/`: Kenya-specific orchestration notes and future bot-specific assets
- `connectors/`: reserved for Kenya connector documentation and artifacts
- `compliance/`: reserved for regulator-specific operational notes

## Runtime entry points

Kenya behavior is reached through generic Medplum operations and resource panels, not through Kenya-only routes in the
main app.

Current generic operations with Kenya handlers:

- `Organization/$verify-facility-authority`
- `Practitioner/$verify-practitioner-authority`
- `Coverage/$check-coverage`
- `Claim/$submit-national-claim`
- `Claim/$check-national-claim-status`
- `Claim/$request-preauthorization`
- `Patient/$publish-national-record`
- `Patient/$resolve-patient-identity`
- `Patient/$break-glass`
- `Condition/$report-idsr-notification`
- `$khis-weekly-export`

Current admin routes that support the Kenya UX:

- `POST /admin/projects/:projectId/kenya/afyalink/test`
- `POST /admin/projects/:projectId/kenya/afyalink/facility-lookup`
- `POST /admin/projects/:projectId/kenya/afyalink/practitioner-lookup`
- `POST /admin/projects/:projectId/kenya/afyalink/patient-lookup`
- `POST /admin/projects/:projectId/kenya/provision-khis-scheduler`

Current public routes (no Medplum auth — verified by SHA shared secret):

- `POST /kenya/sha-callback/:projectId`

These routes exist to support onboarding and resource-level Kenya UI. They are not the canonical clinical workflow
surface. The canonical clinical workflow surface remains the FHIR operations above.

## Kenya setup sequence

### 1. Activate the pack

Set the project to Kenya from project creation or from `/admin/settings`.

Required non-secret settings:

```text
countryPack=kenya
kenyaHieEnvironment=uat|production
kenyaHieCredentialMode=tenant-managed|afiax-managed
kenyaShaClaimsEnvironment=uat|production
kenyaShaClaimsCredentialMode=tenant-managed|afiax-managed
kenyaHieAgentId=<agent-id>              # required for v3 client-registry fetch-client
kenyaClaimSubmitWorkflowBotId=Bot/<id>  # optional
kenyaClaimStatusWorkflowBotId=Bot/<id>  # optional
kenyaKhisSchedulerBotId=Bot/<id>        # set automatically by provision-khis-scheduler
```

### 2. Configure credentials

For tenant-managed mode, use `/admin/secrets`.

Kenya HIE secrets:

```text
kenyaAfyaLinkConsumerKey
kenyaAfyaLinkUsername
kenyaAfyaLinkPassword
```

Kenya SHA secrets:

```text
kenyaShaClaimsAccessKey
kenyaShaClaimsSecretKey
kenyaShaClaimsCallbackUrl   # set this to https://<your-host>/kenya/sha-callback/<projectId>
```

For Afiax-managed mode, use `/admin/super`. The same names are stored in `Project.systemSecret`.

### 3. Verify connectivity

Use the HIE `Test Connection` action first. Do this before attempting facility, practitioner, or eligibility
workflows.

### 4. Create the first Kenya facility

Use `/admin/country-pack`:

1. enter the primary Kenya facility code / MFL code
2. run DHA lookup
3. inspect the raw response if lookup fails
4. create a new `Organization` or apply the registry result to an existing one

This is the preferred onboarding path for the first Kenya facility because it hides the underlying identifier model
from normal users while still persisting the correct canonical `Organization.identifier` values.

## Resource-level workflow sequence

### Facility

Page: `/Organization/{id}`

Minimum user path:

1. enter `Kenya Facility Code / MFL Code`
2. click `Save MFL Code`
3. click `Lookup Facility`
4. review the registry-derived values on the resource
5. click `Verify Facility`

What the system persists:

- Kenya facility authority identifier on `Organization.identifier`
- Kenya facility registry snapshot on `Organization.extension`
- Kenya facility verification snapshot on `Organization.extension`
- verification `Task`
- verification `AuditEvent`

### Practitioner

Page: `/Practitioner/{id}`

Minimum user path:

1. choose Kenya identification type
2. enter the identification number
3. save the lookup identity
4. run DHA practitioner lookup
5. click `Verify Practitioner`

What the system persists:

- Kenya practitioner lookup identifier on `Practitioner.identifier`
- Kenya authority registration number on `Practitioner.identifier`
- Kenya practitioner registry snapshot on `Practitioner.extension`
- Kenya practitioner verification snapshot on `Practitioner.extension`
- verification `Task`
- verification `AuditEvent`

### Coverage

Page: `/Coverage/{id}`

Minimum user path:

1. choose the eligibility lookup identifier type
2. enter the identifier number
3. save the identifier
4. run `Check Coverage`

What the system persists:

- Kenya eligibility lookup identifier on `Coverage.identifier`
- eligibility snapshot on `Coverage.extension`
- `CoverageEligibilityRequest`
- `CoverageEligibilityResponse`
- `Task`
- `AuditEvent`

### Claim

Page: `/Claim/{id}`

Minimum user path:

1. prepare a valid `Claim` graph with linked `Patient`, `Coverage`, `Organization`, and `Practitioner`
2. click `Submit Kenya SHA Claim`
3. if credentials are present, observe live SHA submit metadata
4. click `Check Kenya SHA Claim Status`
5. inspect the updated payer state and local `ClaimResponse`

What the system persists:

- Kenya claim submission snapshot on `Claim.extension`
- Kenya claim status snapshot on `Claim.extension`
- submit `Task`
- status-refresh `Task`
- submit `AuditEvent`
- status-refresh `AuditEvent`
- local `ClaimResponse` representing the latest payer-side state

## Files engineers should read first

If you are extending the Kenya pack, start here:

- `packages/server/src/country-pack/kenya/index.ts`
- `packages/server/src/country-pack/kenya/afyalink.ts`
- `packages/server/src/country-pack/kenya/sha.ts`
- `packages/server/src/country-pack/kenya/verify-facility-authority.ts`
- `packages/server/src/country-pack/kenya/verify-practitioner-authority.ts`
- `packages/server/src/country-pack/kenya/check-coverage.ts`
- `packages/server/src/country-pack/kenya/submit-national-claim.ts`
- `packages/server/src/country-pack/kenya/check-national-claim-status.ts`
- `packages/server/src/country-pack/kenya/workflow-bot.ts`
- `packages/core/src/kenya.ts`

If you are extending the Kenya UI, start here:

- `packages/app/src/admin/CountryPackPage.tsx`
- `packages/app/src/admin/SettingsPage.tsx`
- `packages/app/src/admin/SecretsPage.tsx`
- `packages/app/src/admin/SuperAdminKenyaCredentialsForm.tsx`
- `packages/app/src/resource/OrganizationFacilityVerificationPanel.tsx`
- `packages/app/src/resource/PractitionerAuthorityVerificationPanel.tsx`
- `packages/app/src/resource/CoverageEligibilityPanel.tsx`
- `packages/app/src/resource/ClaimNationalSubmissionPanel.tsx`

## Operation notes in this folder

Use these repo-level documents when you need the Kenya implementation contract for one workflow:

- `operations/verify-facility-authority.md`
- `operations/verify-practitioner-authority.md`
- `operations/check-coverage.md`
- `operations/submit-national-claim.md`
- `operations/check-national-claim-status.md`
- `operations/report-idsr-notification.md`
- `operations/khis-weekly-export.md`
- `operations/break-glass.md`
- `operations/publish-national-record.md`
- `operations/resolve-patient-identity.md`
- `operations/request-preauthorization.md`

Use these repo-level guides when you need the execution model around those workflows:

- `connectors/README.md`
- `bots/README.md`
- `compliance/README.md`
- `fixtures/README.md`
- `mappings/README.md`
- `profiles/README.md`
- `valuesets/README.md`
- `codesystems/README.md`

## Test commands

Target the smallest package-level tests instead of broad repo runs:

```bash
cd packages/core && npx jest src/kenya.test.ts --runInBand
cd packages/server && npx jest src/country-pack/kenya/submit-national-claim.test.ts src/country-pack/kenya/check-national-claim-status.test.ts --runInBand
cd packages/app && npx jest src/resource/ResourcePage.test.tsx src/admin/CountryPackPage.test.tsx --runInBand
```

Typecheck the touched packages:

```bash
cd packages/core && npx tsc --noEmit
cd packages/server && npx tsc --noEmit
cd packages/app && npx tsc --noEmit
```

## Debugging guidance

When a Kenya flow fails, check these in order:

1. `Project.setting.countryPack` is actually `kenya`
2. HIE and SHA environments are correct for the workflow you are testing
3. credential mode matches where secrets were stored
4. the expected resource identifier is present on the resource
5. the raw DHA or SHA payload shown in the UI matches what the handler expected
6. the created `Task` and `AuditEvent` show the expected correlation ID and message

If the raw Kenya HIE or SHA response says the record is missing, treat that as an external dataset issue first, not
as a UI issue.

## Related docs

- `packages/docs/docs/country-packs/kenya.md`
- `country-packs/kenya/operations/README.md`
- `country-packs/kenya/operations/verify-facility-authority.md`
