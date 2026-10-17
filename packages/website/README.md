# Afiax Enterprise Website

This package replaces the current WordPress marketing site with a monorepo-managed Next.js application.

## Run locally

From the monorepo root:

- `npm run dev:website`
- `npm run build:website`

For LAN access during development, set `WEBSITE_ALLOWED_DEV_ORIGINS` before starting the app.
The website normalizes each entry to the hostname format Next expects, so both full URLs and bare
hostnames are accepted.

Example:

- `WEBSITE_ALLOWED_DEV_ORIGINS=http://192.168.1.129:3000,afiax.local npm run dev:website`
- `WEBSITE_ALLOWED_DEV_ORIGINS=*.afiax.internal npm run dev:website`

## External onboarding integrations

The `Get started` wizard now supports a reseller-style domain and onboarding flow.

Domain lookup and transfer:

- `RESELLERCLUB_AUTH_USER_ID`
- `RESELLERCLUB_API_KEY`
- `RESELLERCLUB_DOMAINCHECK_BASE_URL` optional, defaults to `https://domaincheck.httpapi.com`
- `RESELLERCLUB_API_BASE_URL` optional, defaults to `https://httpapi.com`
- `RESELLERCLUB_DEFAULT_CUSTOMER_ID`
- `RESELLERCLUB_DEFAULT_REG_CONTACT_ID`
- `RESELLERCLUB_DEFAULT_ADMIN_CONTACT_ID`
- `RESELLERCLUB_DEFAULT_TECH_CONTACT_ID`
- `RESELLERCLUB_DEFAULT_BILLING_CONTACT_ID`
- `RESELLERCLUB_DEFAULT_INVOICE_OPTION` optional

ERPNext handoff:

- `ERPNEXT_SIGNUP_URL`
- `NEXT_PUBLIC_ERPNEXT_SIGNUP_URL`
- `ERPNEXT_API_BASE_URL`
- `ERPNEXT_AUTHORIZATION_HEADER` or `ERPNEXT_API_KEY` + `ERPNEXT_API_SECRET`
- `ERPNEXT_LEAD_SOURCE` optional, defaults to `Website`
- `ERPNEXT_LEAD_STATUS` optional direct-lead status override

If the ResellerClub credentials are not set, the domain wizard falls back to demo lookup results so the website flow
still works during build-out. If the ERPNext URL is not set, the wizard still transitions into the internal
`/erpnext-signup` handoff page so the commercial packet can be reviewed locally.

ERPNext submission model:

- the website creates a `Lead` and attaches the full onboarding packet as a `Comment` using standard Frappe REST endpoints
- when ERPNext returns the document name, the website can open the concrete lead record at `/app/lead/<lead-name>`

## Why it belongs here

The public site should reflect the actual platform architecture and delivery model documented in this repo:

- Afiax FHIR as the canonical clinical core
- country packs as national adaptation layers
- adjacent enterprise systems around the core
- explicit distinction between live capabilities, active delivery, and planned direction

Keeping the website in the monorepo makes that alignment easier to maintain.

## Shared UI reuse

The website should reuse neutral Medplum UI primitives where they strengthen consistency without making the public site
look like the admin app.

Current reuse targets:

- `@medplum/react` `Container`
- `@medplum/react` `Panel`
- `@medplum/react` `InfoBar`
- `@medplum/react` `StatusBadge`
- Mantine theme primitives already shared across Medplum UI packages

The public site should not inherit product-admin interaction patterns, resource tooling, or healthcare-record UI that
belongs in the application surface.

## Voice and messaging rules

Use an enterprise product tone inspired by major health IT platforms such as Oracle Health:

- lead with operational outcomes, not internal implementation jargon
- sound calm, integrated, and credible
- describe productivity, coordination, resilience, interoperability, and security in concrete terms
- keep planned capabilities clearly labeled as direction rather than implied availability

Do not:

- present roadmap architecture as if it were already in production
- use generic placeholder copy
- make broad compliance claims without the corresponding deployment context
- flatten Afiax FHIR, country packs, billing, payments, analytics, and AI into one undifferentiated product surface

## Information architecture

Initial sections in this package:

- `/`
  - platform overview
  - implementation-state framing
  - high-level architecture
- `/platform`
  - enterprise platform model
  - deployment models
  - governance rules
- `/country-packs`
  - country-pack model
  - Kenya reference-pack framing
- `/delivery`
  - live vs in-delivery vs planned state model
  - public voice guidance

## WordPress migration approach

Use the current WordPress site as a visual and structural reference, not as a content source of truth.

Migration phases:

1. establish the monorepo website and content-state model
2. port the highest-value pages with rewritten copy
3. add approved imagery, case studies, and contact flows
4. switch DNS after content review and governance sign-off

## Content governance

Every roadmap-adjacent section should be reviewed against these categories:

- `Live`
- `In Delivery`
- `Planned`

If a page cannot state which category a capability belongs to, the copy is not ready.
