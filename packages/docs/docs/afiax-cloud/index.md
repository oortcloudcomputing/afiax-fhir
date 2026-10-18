---
sidebar_position: 1
---

# Afiax Cloud

**Afiax Cloud** is the managed platform that Oortcloud Computing Limited (trading as Afiax Connected Healthcare) runs for health facilities, county health departments and partners. You never install or operate Afiax yourself: Oortcloud runs the servers, databases, security, backups, national integrations and upgrades. You use the products, and your developers build on the APIs.

## What you get

| You get | Oortcloud runs it for you |
| --- | --- |
| **Afiax Clinical Suite**: the clinical record (Afiax FHIR), clinician app (Afiax Provider), revenue cycle with SHA claims, Afiax Billing, Afiax Pay, Afiax DICOM imaging | Servers, PostgreSQL databases, file storage, backups and disaster recovery |
| **Afiax AI** (add-on): clinical decision support, imaging AI, risk scoring | Sign-in and multi-factor authentication (Afiax IAM) |
| **Afiax Workspace**: learning and CPD, secure messaging, locums marketplace | Connections to SHA, the DHA Health Information Exchange, KNHTS and KHIS |
| APIs, SDKs and Bots for your own integrations | Security monitoring, patching and audit logging |

See [Products](/docs/products) for what each product does.

## Where it runs

- **In Kenya only.** Production runs on servers Oortcloud operates in two Liquid Intelligent Technologies data centres in Kenya: Nairobi is the primary site, and a second Kenyan site is a warm standby for disaster recovery. Identifiable health data is never processed outside Kenya, as the Data Protection Act 2019 and the Digital Health Act 2023 require.
- **One platform, separate tenants.** Each customer organisation is its own Afiax *project*. A project's data, users and settings are isolated from every other project. See [Projects](/docs/access/projects).
- **Kenya country pack built in.** Kenyan registries, SHA claims, ICD-11 coding through KNHTS, IDSR and KHIS reporting are part of the platform. See the [Kenya reference pack](/docs/country-packs/kenya).

## Environments

| Environment | Address | Data | Who uses it |
| --- | --- | --- | --- |
| **Production** | `https://app.afiax.africa` (web), `https://fhir.afiax.africa` (API) | Real patient data | Facilities after go-live, and approved partner integrations |
| **UAT (integration testing)** | `https://app.uat.afiax.africa`, `https://fhir.uat.afiax.africa` | Synthetic data only | Partners and facility teams testing integrations and new releases before production |

UAT talks to the SHA and national test systems, never to their production systems. See [Environments and partner access](/docs/afiax-cloud/environments-and-access) for how to get credentials.

## How to get started

1. **Talk to us.** Email [info@afiax.africa](mailto:info@afiax.africa) or call +254 738 000 145. We agree the products, plan and number of facilities with you.
2. **Sign the agreements.** These are the service agreement, the data processing agreement (you are the data controller for your patients, and Oortcloud is your processor) and the support SLA.
3. **Onboarding.** Oortcloud sets up your project, verifies your facility and practitioners against the national registries, creates your users, migrates existing records if needed, and trains your Training Champions. See [Plans and onboarding](/docs/afiax-cloud/plans-and-onboarding).
4. **Go live.** Your staff sign in at `app.afiax.africa`, and support runs through the [Afiax Helpdesk](/docs/afiax-cloud/support-and-sla).

## In this section

- [Plans and onboarding](/docs/afiax-cloud/plans-and-onboarding): Starter, Professional and Enterprise, and what onboarding involves
- [Environments and partner access](/docs/afiax-cloud/environments-and-access): production and UAT, credentials, and API base URLs
- [Operations and responsibilities](/docs/afiax-cloud/operations-and-updates): what Oortcloud does, what you do, updates, backups and data residency
- [Support and service levels](/docs/afiax-cloud/support-and-sla): how to get help, priorities, response times and maintenance windows
