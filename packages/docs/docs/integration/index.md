# Integration

This page lists everything Afiax connects to, and how partners connect their own systems. Integrations are part of the managed service: Oortcloud builds, runs and maintains them on [Afiax Cloud](/docs/afiax-cloud), and keeps them up to date when national systems change.

## Kenyan national systems

Delivered by the [Kenya country pack](/docs/country-packs/kenya) and included in Afiax Clinical Suite.

| System | What Afiax does with it | Status | Docs |
| --- | --- | --- | --- |
| **SHA** (Social Health Authority) | Eligibility checks, pre-authorisation, claim submission and claim status, built from the encounter | Implemented | [Kenya billing and settlement](/docs/country-packs/kenya-billing-and-settlement) |
| **DHA Health Information Exchange** | Patient identity (Client Registry), facility and practitioner verification, publishing the Shared Health Record | Implemented | [Kenya reference pack](/docs/country-packs/kenya) |
| **KNHTS** (national terminology) | Every ICD-11 diagnosis and SHA intervention code checked when saved | Implemented | [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance) |
| **KHIS / DHIS2** | Weekly MOH 505 disease surveillance report, with zero reporting | Implemented | [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance#khis-weekly-export-moh-505) |
| **IDSR** | Immediate notification for notifiable diseases | Implemented | [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance#idsr-immediate-notification) |
| **M-Pesa** (Safaricom Daraja) | Patient payments by STK push or recorded M-Pesa code | Implemented | [Afiax Pay and patient payments](/docs/integration/afiax-pay) |
| **KMPDC, NCK, PPB** | Practitioner registration checks | Implemented, through the HIE | [Kenya reference pack](/docs/country-packs/kenya) |
| **MOH 705/711** monthly reports | Monthly facility reporting | Planned | |

## Afiax products

Afiax FHIR is the clinical record that the other Afiax products connect to.

| Product | Integration | Docs |
| --- | --- | --- |
| **Afiax Pay** | Patient payments, wallets and refunds, recorded against the visit's claim | [Afiax Pay and patient payments](/docs/integration/afiax-pay), [Afiax Pay boundary](/docs/architecture/afiax-pay-boundary) |
| **Afiax Billing** | Claims, payments and invoices posted to finance; pharmacy stock and dispensing | [Afiax Billing boundary](/docs/architecture/afiax-billing-boundary), [contract](/docs/architecture/afiax-billing-contract) |
| **Afiax DICOM** | Imaging orders, studies and reports | [Afiax DICOM](/docs/integration/afiax-dicom) |
| **Afiax AI** | Decision support, imaging AI and risk scores written back as FHIR resources for clinician review | [Afiax AI](/docs/products/afiax-ai) |
| **Afiax Workspace** | Single sign-on; secure messaging; practitioner credentials | [Afiax Workspace](/docs/products/afiax-workspace) |

## Inside your facility

| Integration | What it connects | Docs |
| --- | --- | --- |
| **Afiax Facility Agent** | Lab analysers, imaging modalities and other on-site systems that speak HL7 v2 or DICOM, connected securely to Afiax Cloud | [Afiax Facility Agent](/docs/agent) |
| **Laboratory** | In-house analysers and external reference labs | [Laboratory orders and results](/docs/integration/laboratory) |
| **HL7 v2** | Admissions (ADT), orders and results from existing hospital systems | [HL7 interfacing](/docs/integration/hl7-interfacing) |

## Connecting your own system (partners)

Partners such as laboratories, insurers, app developers and county systems connect through standard APIs, using credentials issued by Oortcloud:

- **FHIR R4 REST API** for reading and writing clinical data. See the [API reference](/docs/api).
- **SMART on FHIR** for apps that launch from Afiax Provider with the user's context. See [SMART App Launch](/docs/integration/smart-app-launch).
- **Subscriptions** to be notified when data changes, instead of polling. See [Subscriptions](/docs/subscriptions).
- **Bots** for custom logic that runs inside Afiax Cloud, next to the data. See [Bots](/docs/bots).
- **FHIRcast** for keeping several apps on the same patient. See [FHIRcast](/docs/fhircast).

Start with [Environments and partner access](/docs/afiax-cloud/environments-and-access): you build and test in UAT with synthetic data, and production access is granted after review.

## Need an integration that isn't listed?

Enterprise plans include an allowance for custom integrations; on other plans they are quoted as professional services. Email [info@afiax.africa](mailto:info@afiax.africa) with the system and what you need to exchange.
