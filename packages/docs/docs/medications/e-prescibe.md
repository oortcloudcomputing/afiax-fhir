---
sidebar_position: 3
---

# Prescribing and Dispensing

This page explains how medicines are prescribed and dispensed in Afiax Clinical Suite.

## The flow

1. **Prescribe.** The clinician prescribes in Afiax Provider. Afiax FHIR stores a `MedicationRequest` that includes:
   - the medicine, coded from the Kenyan health products list in KNHTS (`MOH-PPB/HPT`)
   - the dose, route, frequency and duration
   - the reason, as an ICD-11 diagnosis.
2. **Check.** The clinician reviews the patient's recorded allergies and current medicines in the chart. Automatic drug-interaction and drug-allergy alerts are planned.
3. **Dispense.** The pharmacy sees the prescription. Stock, batches and expiry are managed in **Afiax Billing** (the pharmacy and inventory part of Clinical Suite). The dispense is recorded in Afiax FHIR as a `MedicationDispense`, linked to the prescription.
4. **Bill.** Dispensed items are added to the visit's claim for SHA, an insurer or the patient, and paid through [Afiax Pay](/docs/integration/afiax-pay) where the patient pays.

Prescriptions are issued only by practitioners whose professional registration (KMPDC, NCK or PPB) has been verified at onboarding.

## Codes

| What | Code system |
| --- | --- |
| Medicine | KNHTS `MOH-PPB/HPT` (Kenyan health products and technologies), constant `KenyaHealthProductSystem` |
| Reason for the prescription | ICD-11 MMS (KNHTS) |

The binding of medication codes to the KNHTS health products list is planned for Q4 2026 to Q1 2027. Until then, check the codes your project uses with your Oortcloud implementation lead. See [Medication codes](./medication-codes).

## Related

- [Medications overview](./index.md)
- [Formulary](./formulary)
- [Afiax Billing integration](/docs/architecture/afiax-billing-boundary)
