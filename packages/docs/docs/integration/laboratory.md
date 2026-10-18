---
sidebar_position: 4
---

# Laboratory Orders and Results

This page explains how lab tests are ordered and resulted in Afiax Clinical Suite, for both a facility's own laboratory and an external reference laboratory.

## The flow

1. **Order.** A clinician orders tests in Afiax Provider. Afiax FHIR stores a `ServiceRequest` coded with the test's code from KNHTS: either the Kenyan investigations list (`MOH-PPB/Investigations`) or LOINC (`Regenstrief/LOINC`).
2. **Collect.** The specimen is collected and labelled. It is recorded as a `Specimen` linked to the order.
3. **Analyse.**
   - **In-house lab analysers** send results through the [Afiax Facility Agent](/docs/agent), using HL7 v2 (`ORU` messages). The Agent forwards them securely to Afiax.
   - **External laboratories** connect through the Afiax FHIR API as an approved partner (see [Environments and partner access](/docs/afiax-cloud/environments-and-access)), or by HL7 v2 through an Agent at their site.
4. **Result.** Each result is stored as an `Observation`, with a `DiagnosticReport` grouping them and linking back to the order. Abnormal and critical results are flagged.
5. **Review.** The ordering clinician sees the results in Afiax Provider. Alerts for critical results to the care team in Afiax Messaging ([Afiax Workspace](/docs/products/afiax-workspace)) are planned.
6. **Bill.** The investigations are added to the visit's claim for SHA, an insurer or the patient. See [Kenya billing and settlement](/docs/country-packs/kenya-billing-and-settlement).

## Codes

| What | Code system | Notes |
| --- | --- | --- |
| Test ordered | KNHTS `MOH-PPB/Investigations` or LOINC | LOINC is published in KNHTS (`Regenstrief/LOINC`) |
| Result value | LOINC (KNHTS) | Units in UCUM |
| Diagnosis on the order | ICD-11 MMS (KNHTS) | Required for SHA claims |

Use only codes published in KNHTS. See [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance).

## Setting up an analyser

Oortcloud's implementation team connects analysers during onboarding. Each analyser needs an HL7 v2 or ASTM interface; we map its test codes to the KNHTS codes above. To connect a new analyser, raise a request with the [Afiax Helpdesk](/docs/afiax-cloud/support-and-sla).

## Developer reference

- [Ordering labs and imaging](/docs/charting/ordering-labs-imaging): modelling orders and results in FHIR
- [HL7 interfacing](/docs/integration/hl7-interfacing): how HL7 v2 messages are handled
- [Afiax Facility Agent](/docs/agent)
