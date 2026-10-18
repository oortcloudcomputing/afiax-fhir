---
sidebar_position: 1
---

# Products

Afiax is three products on one shared platform, all run for you by Oortcloud on [Afiax Cloud](/docs/afiax-cloud). Each product is licensed separately per facility, or together as the full platform bundle. They are separate products on purpose: each carries its own regulatory classification, so a clinic can start with the one it needs.

| Product | What it is for | Regulatory class |
| --- | --- | --- |
| [**Afiax Clinical Suite**](/docs/products/clinical-suite) | Running clinical care and its revenue: patient records, clinician workflows, SHA claims, billing, payments and imaging | Software as a Medical Device, Class B/C |
| [**Afiax AI**](/docs/products/afiax-ai) | Clinical intelligence: decision support, imaging AI, risk scoring and surveillance. An add-on to Clinical Suite | Software as a Medical Device, Class C/D |
| [**Afiax Workspace**](/docs/products/afiax-workspace) | The health workforce: learning and CPD, secure messaging, locums and credentialing | General software |

## The shared platform

All three products use the same foundation, which is deployed once and governed centrally:

- **Afiax FHIR**: the clinical data platform (HL7 FHIR R4) that every product reads from and writes to through governed APIs. These docs are mostly about Afiax FHIR.
- **Afiax IAM**: one sign-in for every product, with multi-factor authentication, roles and SMART on FHIR app access.
- **National integrations**: SHA, the DHA Health Information Exchange, KNHTS terminology, KHIS reporting and the professional registries, delivered through the [Kenya country pack](/docs/country-packs/kenya).
- **Audit and security**: every access is logged and kept for 20 years in Kenya. See [Security](/security).

No product reads another product's database directly. They exchange data through APIs and events, so each can evolve, and be certified, on its own.

## Availability

Afiax launches in Kenya in waves. Each wave starts only when the previous one meets its readiness criteria.

| Wave | Products and modules |
| --- | --- |
| **Wave 1 (launch)** | Clinical Suite: Afiax FHIR, Afiax Provider, SHA revenue cycle, Afiax Billing, Afiax Pay, Afiax DICOM. Workspace: Afiax Learn, Afiax Messaging, Afiax Marketplace |
| **Wave 2** | Afiax Patient Portal, remote patient monitoring |
| **Later waves** | Afiax AI (after its separate regulatory registration) |

Ask [info@afiax.africa](mailto:info@afiax.africa) for current availability in your county.
