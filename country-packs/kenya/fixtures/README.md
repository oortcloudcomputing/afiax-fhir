# Fixtures

This directory holds Kenya pack fixture material used to shape workflows, validate normalization behavior, and give
engineers a stable reference when adding or changing pack logic.

Fixtures in this pack are not meant to replace automated tests. They are the human-readable payload and resource
examples that explain what a workflow expects and what a normalized result should look like.

## Current contents

| Workflow | Request | Response |
|---|---|---|
| `Organization/$verify-facility-authority` | `verify-facility-authority.request.json` | `verify-facility-authority.response.json` |
| `Coverage/$check-coverage` | `check-coverage.request.json` | `check-coverage.response.json` |
| `Claim/$submit-national-claim` | `submit-national-claim.request.json` | `submit-national-claim.response.json` |
| `Claim/$check-national-claim-status` | `check-national-claim-status.request.json` | `check-national-claim-status.response.json` |
| `Claim/$request-preauthorization` | `request-preauthorization.request.json` | `request-preauthorization.response.json` |
| `Patient/$publish-national-record` | `publish-national-record.request.json` | `publish-national-record.response.json` |
| `Patient/$resolve-patient-identity` | `resolve-patient-identity.request.json` | `resolve-patient-identity.response.json` |
| `Patient/$break-glass` | `break-glass.request.json` | `break-glass.response.json` |
| `Condition/$report-idsr-notification` | `report-idsr-notification.request.json` | `report-idsr-notification.response.json` |

Each pair documents:
- the request fixture: minimal operation input accepted by the Kenya handler
- the response fixture: normalized result shape returned to the caller

## How fixtures are used in this repo

Use fixtures in this pack for:

- documenting the expected operation input
- documenting the normalized operation result
- comparing UI behavior against a stable expected payload
- reviewing mapping changes before they become code
- creating realistic test resources or integration notes

Do not use fixtures in place of:

- package-level unit tests
- end-to-end assertions
- runtime secrets
- generated production payload archives

## Fixture naming rules

Use this naming pattern:

```text
<workflow-name>.<kind>.json
```

Current examples:

```text
verify-facility-authority.request.json
verify-facility-authority.response.json
```

Examples:

```text
verify-facility-authority.request.json
verify-facility-authority.response.json
check-coverage.request.json
check-coverage.response.json
submit-national-claim.request.json
submit-national-claim.response.json
```

## What a good Kenya fixture should show

A fixture in this directory should show one of these clearly:

- the minimal canonical FHIR input required by the workflow
- the remote Kenya payload after normalization
- the final Kenya operation result returned to the caller

Keep it focused. One fixture should explain one stage of one workflow.

## Relationship to code

The Kenya fixtures correspond to behavior implemented in:

| Fixture prefix | Server handler |
|---|---|
| `verify-facility-authority` | `packages/server/src/country-pack/kenya/verify-facility-authority.ts` |
| `check-coverage` | `packages/server/src/country-pack/kenya/check-coverage.ts` |
| `submit-national-claim` | `packages/server/src/country-pack/kenya/submit-national-claim.ts` |
| `check-national-claim-status` | `packages/server/src/country-pack/kenya/check-national-claim-status.ts` |
| `request-preauthorization` | `packages/server/src/country-pack/kenya/submit-national-claim.ts` |
| `publish-national-record` | `packages/server/src/country-pack/kenya/publish-national-record.ts` |
| `resolve-patient-identity` | `packages/server/src/country-pack/kenya/resolve-patient-identity.ts` |
| `break-glass` | `packages/server/src/country-pack/kenya/break-glass.ts` |
| `report-idsr-notification` | `packages/server/src/country-pack/kenya/idsr.ts` |

Shared types are in `packages/core/src/kenya.ts`.

## Adding a new fixture

Use this sequence:

1. identify which workflow stage needs a stable example
2. base the fixture on the canonical resource or normalized result actually used by code
3. remove secrets and environment-specific values
4. use realistic identifiers, correlation ids, and references
5. update the matching operation README so engineers know the fixture exists

## Guardrails

Do not put these in fixtures:

- real tenant credentials
- real personal data
- raw production payload dumps with sensitive content
- UI-only state

Keep fixtures implementation-focused and safe to commit.
