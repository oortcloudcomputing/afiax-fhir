---
sidebar_position: 1
---

# Patient Demographics

Registering a patient correctly is the first step of every visit. In Kenya, it also links the patient to their national identity, so their record can follow them between facilities and their SHA cover can be checked. This page explains what to capture on the `Patient` resource and how Afiax verifies it.

## What to capture

| Data | FHIR element | Notes |
| --- | --- | --- |
| Name | `Patient.name` | Record names as the patient's ID document shows them. Use `use: "official"`, and add previous names with `use: "old"` (see below) |
| Sex | `Patient.gender` | [Administrative gender](https://hl7.org/fhir/R4/valueset-administrative-gender.html) |
| Date of birth | `Patient.birthDate` | |
| Phone | `Patient.telecom` | Used for M-Pesa payment prompts and reminders, so record the number in `2547XXXXXXXX` format |
| Residence | `Patient.address` | County, sub-county and ward |
| Next of kin | `Patient.contact` | Name, relationship and phone |
| Identity document | `Patient.identifier` | National ID, Alien ID, passport, birth certificate or refugee ID (see below) |
| Client Registry ID | `Patient.identifier` | Added by Afiax when identity is verified |

## Identity and the Client Registry

Afiax verifies the patient against the DHA **Client Registry** through the Health Information Exchange:

1. The registration clerk records the patient's identification type and number. The accepted types are `National ID`, `Alien ID`, `Passport`, `Birth Certificate` and `Refugee ID`.
2. Afiax calls the Client Registry (`Patient/<id>/$resolve-patient-identity`).
3. If the patient is found, Afiax adds their **Client Registry ID** to `Patient.identifier`, with the system `https://afiax.africa/kenya/identifier/client-registry-id` (constant `KenyaClientRegistryIdSystem`). This ID links the record to the patient's national Shared Health Record.
4. If the patient is not found, the record is kept, marked as unverified, and can be checked again later. A national-system outage never stops a patient being registered.

The patient's SHA cover is checked separately, on their `Coverage` (`Coverage/<id>/$check-coverage`). See [Kenya billing and settlement](/docs/country-packs/kenya-billing-and-settlement).

## Previous names

```json
"name": [
  {
    "given": ["Achieng", "Mary"],
    "family": "Otieno",
    "period": { "start": "2015-06-01" },
    "use": "official"
  },
  {
    "given": ["Achieng", "Mary"],
    "family": "Odhiambo",
    "period": { "end": "2015-06-01" },
    "use": "old"
  }
]
```

## Duplicates and deaths

- **Duplicates.** Verifying against the Client Registry prevents most duplicate records. For the rest, see [Patient deduplication](/docs/fhir-datastore/patient-deduplication).
- **Deaths.** Record the death on `Patient.deceasedDateTime`. Record the cause of death as an `Observation` or `Condition`, coded in ICD-11.

## Privacy

Demographics are personal data under the Data Protection Act 2019. Capture only what care and the national systems need, and limit who can see identity documents with [access policies](/docs/access/access-policies). See [Compliance](/docs/compliance).
