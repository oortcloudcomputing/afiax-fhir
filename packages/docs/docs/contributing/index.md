---
sidebar_position: 1
---

# Contributing to Afiax

This section is for anyone who wants to change Afiax: fix a bug, add a feature, or improve these docs. You don't need to be an expert. Each page walks you through one task from start to finish.

If you want to *use* Afiax rather than change it, start with the [App](/docs/app) or [API](/docs/api) docs instead.

## Where to start

Follow these pages in order the first time:

1. **[Local development setup](/docs/contributing/local-dev-setup)**: get a copy of the code onto your computer.
2. **[Run the stack](/docs/contributing/run-the-stack)**: check your hardware, install the tools, then start the Afiax server and web app locally.
3. **[Testing](/docs/contributing/testing)**: run the automated tests before you open a pull request.

## How we work

| Topic | Rule |
| --- | --- |
| Repository | [oortcloudcomputing/afiax-fhir](https://github.com/oortcloudcomputing/afiax-fhir) |
| Active branch | `kenya`. Branch from it, and open pull requests back into it. |
| Commit messages | [Conventional Commits](https://www.conventionalcommits.org/), for example `feat(kenya): ...`, `fix(server): ...` or `docs(kenya): ...` |
| Patient data | **Never** commit, paste or screenshot real patient data. Use synthetic test data only. |
| Secrets | Never commit passwords, tokens or keys. They live in Vault (see the platform-engineering repo). |
| Regulated areas | If your change touches hosting, access control, audit, diagnosis coding, reporting or claims, read [Compliance](/docs/compliance) first, and say so in the pull request. |

## Reporting a bug or suggesting a feature

Open an issue in the [GitHub issue tracker](https://github.com/oortcloudcomputing/afiax-fhir/issues/new). Include:

- what you did (steps someone else can repeat)
- what you expected to happen
- what actually happened, with any error message.

For security problems, **do not** open a public issue. Email [security@afiax.africa](mailto:security@afiax.africa) instead (see [Security](/security)).

## Improving the documentation

These docs are built from Markdown files in [`packages/docs/docs`](https://github.com/oortcloudcomputing/afiax-fhir/tree/kenya/packages/docs/docs). Every page has an **Edit this page** link at the bottom.

When you write or change a page:

- **Write for a beginner.** Say what the reader will end up with, list the prerequisites, number the steps, give commands they can copy, show what success looks like, and add a short troubleshooting section.
- **Use Afiax in prose.** Keep `@medplum/*`, `MedplumClient`, `MEDPLUM_*` and other code identifiers exactly as they are. See [Platform foundation](/docs/architecture/platform-foundation) for the full naming rule.
- **Never copy Afiax Inc.'s company claims** (certifications, customers, usage figures) into Afiax pages.

## Fixing a bug or building a feature

1. For anything bigger than a small fix, open an issue first so the approach can be agreed.
2. Create a branch from `kenya`, make your change, and add or update tests.
3. Run the tests and the linter (see [Testing](/docs/contributing/testing)).
4. Open a pull request into `kenya` that describes what changed and why.

:::note Legal note

Afiax is built on the Medplum open-source project and is licensed under the Apache License 2.0. By contributing, you agree that your contribution is made under the same licence and that you have the right to submit it (see the [Developer Certificate of Origin](/docs/contributing/dco)).

:::
