---
keywords:
  - medication codes
  - hpt
  - knhts
  - drugs
  - medications
tags:
  - medications
---

# Medication Codes

Medicine codes remove ambiguity from prescriptions, dispensing, stock control and claims. In Kenya, medicines, vaccines and medical devices are coded with the **Kenya Health Products and Technologies (HPT)** list maintained by the Pharmacy and Poisons Board, and published in KNHTS as `MOH-PPB/HPT`.

Afiax uses HPT for all medicine coding. RxNorm and NDC are US code systems; they are not published in KNHTS, and Afiax does not use them.

## The code system

| | |
| --- | --- |
| KNHTS source | `MOH-PPB/HPT` (about 31,600 concepts) |
| FHIR `system` | `https://ilm-hie.dha.go.ke/ocl/orgs/MOH-PPB/sources/HPT` |
| Constant in `@medplum/core` | `KenyaHealthProductSystem` |
| Browse | [nhts.dha.go.ke](https://nhts.dha.go.ke) |

## Levels of code

HPT has codes at different levels of detail. For amoxicillin, for example:

| Prefix | Level | Example code | Example name |
| --- | --- | --- | --- |
| `AC` | Active ingredient | `AC10678` | Amoxicillin |
| `GE` | Generic product: ingredient, strength and dose form | `GE10160` | Amoxicillin 500 mg Oral Capsule |
| `PH` | Specific product | `PH12907` | Amoxicillin 500 mg Oral Capsule |

Vaccines are in the same list. For example, `AC11786` is BCG Vaccine.

**What we recommend:**

- **Prescribing** (`MedicationRequest`): use the generic product (`GE`) code. It states what the clinician means without tying the prescription to one manufacturer.
- **Dispensing** (`MedicationDispense`) and stock: record the specific product (`PH`) that was actually given, where it is known.
- **Allergies to a medicine** (`AllergyIntolerance`): use the active ingredient (`AC`) code.

## Example

```json
{
  "resourceType": "MedicationRequest",
  "status": "active",
  "intent": "order",
  "medicationCodeableConcept": {
    "coding": [
      {
        "system": "https://ilm-hie.dha.go.ke/ocl/orgs/MOH-PPB/sources/HPT",
        "code": "GE10160",
        "display": "Amoxicillin 500 mg Oral Capsule"
      }
    ]
  },
  "subject": { "reference": "Patient/example" },
  "reasonCode": [
    {
      "coding": [
        {
          "system": "http://id.who.int/icd/release/11/mms",
          "code": "CA40.Z",
          "display": "Pneumonia, organism unspecified"
        }
      ]
    }
  ]
}
```

## Finding and checking a code

Search KNHTS by name, then confirm the exact code with a direct lookup (search also matches synonyms):

```bash
# Search
curl -s "https://ilm-hie.dha.go.ke/ocl/orgs/MOH-PPB/sources/HPT/concepts/?q=amoxicillin%20500" | jq -r '.[] | "\(.id)  \(.display_name)"'

# Confirm
curl -s https://ilm-hie.dha.go.ke/ocl/orgs/MOH-PPB/sources/HPT/concepts/GE10160/ | jq -r .display_name
```

## Status

Afiax does not yet enforce HPT codes on medication resources. That binding is planned for Q4 2026 to Q1 2027. Code new data with HPT now, so it is valid when enforcement starts. Your facility's formulary in Afiax Billing should use the same codes; see [Formulary](./formulary).

## Related

- [Prescribing and dispensing](./e-prescibe)
- [Commonly used terminologies](/docs/terminology/common-terminologies)
- [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance)
