---
sidebar_position: 5
---

# Kenya Terminology and Surveillance

This page covers how the Kenya pack codes clinical data against the Kenya National Health Terminology Service (KNHTS), and how that coding drives IDSR notifications and weekly KHIS reporting.

## KNHTS is the terminology authority

[KNHTS](https://nhts.dha.go.ke) is the Digital Health Agency's national terminology service. It runs on Open Concept Lab, and its public read API is `https://ilm-hie.dha.go.ke/ocl`.

The Kenya pack takes its coded values from KNHTS sources:

| Domain | KNHTS source | FHIR system URI | Status |
| --- | --- | --- | --- |
| Diagnoses | `WHO/ICD-11` (MMS 2025-01) | `http://id.who.int/icd/release/11/mms` | Required; validated at entry |
| Legacy diagnoses | `WHO/ICD-10-WHO` + ICD-10→ICD-11 mappings | `http://hl7.org/fhir/sid/icd-10` | Additional coding only |
| SHA benefits and interventions | `MOH-KENYA/BenefitsAndInterventions` | `https://ilm-hie.dha.go.ke/ocl/orgs/MOH-KENYA/sources/BenefitsAndInterventions` | Required on pre-authorisation items; validated before submission |
| Procedures | `WHO/ICHI` | `.../orgs/WHO/sources/ICHI` | Binding planned |
| Laboratory | `Regenstrief/LOINC` | `http://loinc.org` | Preferred |
| Medicines, vaccines, devices | `MOH-PPB/HPT` | `.../orgs/MOH-PPB/sources/HPT` | Binding planned |
| Allergies, identifier types, encounter types, document types | `MOH-KENYA/*` interface terminologies | `.../orgs/MOH-KENYA/sources/<id>` | Binding planned |

Kenyan sources that have no published canonical URL are identified by their KNHTS source URL. The constants live in `packages/core/src/kenya.ts`: `KenyaShaInterventionSystem`, `KenyaIchiSystem`, `KenyaHealthProductSystem`, `getKenyaKnhtsSystem()` and the others.

SNOMED CT, CVX, RxNorm and ICD-10-CM are not published in KNHTS, so Kenya workflows do not use them.

## ICD-11 diagnosis rule

In projects with `countryPack = kenya`, every `Condition.code` and `Claim.diagnosis[].diagnosisCodeableConcept` must contain an ICD-11 MMS coding. The repository enforces this on every create and update, in `packages/server/src/country-pack/kenya/icd11-diagnosis.ts`:

1. **Format.** The ICD-11 code must be well formed. A diagnosis coded only in ICD-10 is rejected.
2. **KNHTS lookup.** Each code is looked up in KNHTS. For a postcoordinated code such as `1A00&XN...`, every part is looked up. A code that KNHTS does not contain, or has retired, is rejected with an `OperationOutcome` naming the code.
3. **Outages.** If KNHTS cannot be reached, the diagnosis is accepted on the format check and a warning is logged. A national-service outage never blocks a clinical write.

The rule runs only when the diagnoses are new or changed, so legacy ICD-10-only records can still receive other updates. System writes are not checked.

### Settings

| Setting | Where | Values | Default |
| --- | --- | --- | --- |
| `kenyaIcd11DiagnosisEnforcement` | Project setting | `enforce`, `warn`, `off` | `enforce` |
| `knhtsValidation` | Server config (`MEDPLUM_KNHTS_VALIDATION`) | `true`, `false` | `true` (off in tests) |
| `knhtsBaseUrl` | Server config (`MEDPLUM_KNHTS_BASE_URL`) | URL | `https://ilm-hie.dha.go.ke/ocl` |

Lookups are cached in the server process: found codes for 24 hours, unknown codes for 1 hour. Production egress must allow `ilm-hie.dha.go.ke:443`.

## SHA intervention codes

SHA pre-authorisation items (`Claim.item.productOrService`) are coded with `KenyaShaInterventionSystem`. Before the request is built, each intervention code is looked up in the KNHTS `BenefitsAndInterventions` source. Unknown codes return an `error` result, and nothing is sent to SHA.

## IDSR immediate notification

When a Condition with an immediately notifiable ICD-11 code is created or updated, the server asynchronously creates a Task (`idsr-immediate-notification`) and an AuditEvent. A matching code is the listed code or any of its child codes; ICD-10 codes are recognised when present as an additional coding. The server also stamps the Condition, so later updates don't notify again.

The notifiable list is `KenyaIdsrImmediateNotifiableConditions` in `packages/core/src/kenya.ts`:

| Condition | ICD-11 code(s) |
| --- | --- |
| Cholera | 1A00 |
| Typhoid fever | 1A07 |
| Plague | 1B93 |
| Anthrax | 1B97 |
| Tetanus neonatorum | 1C15 |
| Diphtheria | 1C17 |
| Meningococcal disease | 1C1C |
| Acute poliomyelitis | 1C81 |
| Rabies | 1C82 |
| Yellow fever | 1D47 |
| Ebola disease | 1D60.0 |
| Marburg disease | 1D60.1 |
| Crimean-Congo haemorrhagic fever | 1D49 |
| Arenavirus disease | 1D61 |
| Viral haemorrhagic fever, not elsewhere classified | 1D86 |
| Smallpox | 1E70 |
| Mpox | 1E71 |
| Measles | 1F03 |
| Influenza due to identified zoonotic or pandemic influenza virus | 1E31 |
| COVID-19 | RA01 |

## KHIS weekly export (MOH 505)

`GET /fhir/R4/$khis-weekly-export` aggregates the facility's Conditions for an epidemiological week (Sunday–Saturday):

- **What is counted.** Conditions are counted as suspected or confirmed per weekly notifiable condition, using `KenyaKhisWeeklyNotifiableConditions`. That list is the immediate list plus endemic conditions such as tuberculosis, malaria, meningitis, acute respiratory infections and pneumonia.
- **Where it goes.** Counts are posted to the DHIS2 `dataValueSets` API.
- **Zero reporting.** Every weekly condition is submitted, with `0` when there were no cases.
- **Paging.** All Conditions in the week are read page by page. If the week exceeds the server's search offset limit, the export fails rather than submitting partial counts.
- **Evidence.** The submission and the DHIS2 import summary are stored as a DocumentReference.

Every ICD-11 code in both tables was verified against KNHTS on 2026-10-18.

## Re-verifying codes after a KNHTS release

Look up each table code in KNHTS and compare the display name:

```bash
curl -s https://ilm-hie.dha.go.ke/ocl/orgs/WHO/sources/ICD-11/concepts/1B91/ | jq -r .display_name
# Leptospirosis
```

A `404` means the code is not in KNHTS. Request missing national concepts through the KNHTS request service instead of defining them locally.
