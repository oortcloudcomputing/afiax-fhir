---
sidebar_position: 2
---

# Afiax Clinical Suite

Afiax Clinical Suite is the clinical operating system for a health facility. It covers the whole encounter, from registration and triage through documentation, orders, results, prescribing and discharge, together with the money side: SHA claims, billing and payments. It is built on HL7 FHIR R4 and runs on [Afiax Cloud](/docs/afiax-cloud).

## Modules

| Module | What it does | Where it lives | Developer docs |
| --- | --- | --- | --- |
| **Afiax FHIR** | The patient record and clinical data platform: patients, encounters, diagnoses (ICD-11), orders, results, care plans, tasks, audit | `fhir.afiax.africa` | [FHIR API](/docs/api), [Charting](/docs/charting), [Care planning](/docs/careplans) |
| **Afiax Provider** | The clinician app: patient chart, visits, orders, results, prescribing | `app.afiax.africa` | [Afiax Provider](/docs/provider) |
| **SHA revenue cycle** | SHA eligibility checks, pre-authorisation, claim submission and claim status, built into the encounter | Part of Afiax FHIR | [Kenya billing and settlement](/docs/country-packs/kenya-billing-and-settlement) |
| **Afiax Billing** | Finance and operations: invoices and receivables, pharmacy stock and dispensing, procurement, HR and payroll | `erp.afiax.africa` | [Afiax Billing integration](/docs/architecture/afiax-billing-boundary) |
| **Afiax Pay** | Patient payments and wallets: M-Pesa collection, co-payments, insurer and SHA remittances, refunds | `pay.afiax.africa` | [Afiax Pay integration](/docs/integration/afiax-pay) |
| **Afiax DICOM** | Medical imaging: storing and viewing X-ray, CT, MRI and ultrasound studies, and radiology reporting | `dicom.afiax.africa` | [Afiax DICOM integration](/docs/integration/afiax-dicom) |
| **Afiax Patient Portal** (Wave 2) | Patients see their records and results, book appointments and pay | | |
| **Remote patient monitoring** (Wave 2) | Readings from connected devices, with alerts to the care team | `iot.afiax.africa` | |

## Built for Kenya

- **National identity and registries.** Patients are matched to the DHA Client Registry. Facilities and practitioners are verified against the national registries at set-up.
- **ICD-11 coding.** Every diagnosis is coded in ICD-11 and checked against KNHTS when it is saved. See [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance).
- **SHA claims from the encounter.** Claims are built from what was documented, rather than re-typed.
- **Disease surveillance.** Notifiable diseases raise IDSR notifications automatically, and weekly KHIS reports are generated from the record.
- **Shared Health Record.** Encounter summaries can be published to the Health Information Exchange for continuity of care.

## How the modules fit together

Afiax FHIR is the source of truth for clinical and reimbursement facts. Afiax Billing is the source of truth for finance execution, and Afiax Pay for money movement. They exchange data through APIs and events, and never edit each other's records. See [Financial architecture](/docs/architecture/financial-architecture).
