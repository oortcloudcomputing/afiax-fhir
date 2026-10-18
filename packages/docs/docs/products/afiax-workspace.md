---
sidebar_position: 4
---

# Afiax Workspace

Afiax Workspace serves the people who deliver care. It helps them learn and keep their CPD up to date, communicate securely, find and fill shifts, and keep their credentials current. It is general software rather than a medical device, so facilities can adopt it before, or without, the clinical products.

## Modules

| Module | What it does | Where it lives |
| --- | --- | --- |
| **Afiax Learn** | Courses and assessments that work on mobile and on slow connections, with certificates. CPD points are tracked and reported to KMPDC and NCK | `learn.afiax.africa` |
| **Afiax Messaging** | Secure, end-to-end encrypted clinical messaging, team channels, file sharing and calls. Hosted in Kenya, with an audit trail: a governed replacement for WhatsApp groups | `matrix.afiax.africa` |
| **Afiax Marketplace** | A locums marketplace: shift posting, matching, credential checks and M-Pesa payment to locums | `shop.afiax.africa` |
| **Credentialing** | Licence verification against KMPDC, NCK and PPB registers, with expiry alerts | Part of Workspace |
| **Workforce scheduling** | Shift planning, rostering, leave and on-call | Part of Workspace |
| **Files and analytics** | Shared documents and operational dashboards | Part of Workspace |

## How it connects to the clinical products

- **One sign-in.** Workspace uses the same Afiax IAM accounts as Clinical Suite.
- **Practitioner records (planned).** Registrations verified in Workspace will feed the same practitioner records that Afiax FHIR uses to control who may treat patients.
- **Alerts to messaging (planned).** Clinical Suite will send alerts, such as critical results or device readings, to the right care-team channel in Afiax Messaging.

For availability, email [info@afiax.africa](mailto:info@afiax.africa).
