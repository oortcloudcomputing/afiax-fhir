# Commonly Used Terminologies

This page tells you which code system to use for each kind of clinical data in Afiax, and the FHIR `system` URL to put in each `Coding`.

In Kenya, every code comes from the **Kenya National Health Terminology Service (KNHTS)**, run by the Digital Health Agency. If a code is not in KNHTS, do not use it. Request it through the KNHTS request service instead of inventing a local code. SNOMED CT, CVX, RxNorm, NDC, CPT and ICD-10-CM are **not** published in KNHTS, so Afiax does not use them.

KNHTS sources without a published canonical URL are identified by their KNHTS source URL, `https://ilm-hie.dha.go.ke/ocl/orgs/<owner>/sources/<source>`. The constants for each one are in `@medplum/core` (`packages/core/src/kenya.ts`).

## Which code system for what

| Clinical data | Code system (KNHTS source) | FHIR `system` | Constant | Status |
| --- | --- | --- | --- | --- |
| Diagnoses and problems | ICD-11 MMS (`WHO/ICD-11`) | `http://id.who.int/icd/release/11/mms` | `KenyaIcd11System` | Required; checked when saved |
| Legacy diagnoses | ICD-10 (`WHO/ICD-10-WHO`) | `http://hl7.org/fhir/sid/icd-10` | `KenyaIcd10System` | Only as an extra coding next to ICD-11 |
| Laboratory tests and results, vital signs | LOINC (`Regenstrief/LOINC`) | `http://loinc.org` | | Preferred |
| Kenyan investigations list | `MOH-PPB/Investigations` | KNHTS source URL | `KenyaInvestigationSystem` | Available |
| Procedures | ICHI (`WHO/ICHI`) | KNHTS source URL | `KenyaIchiSystem` | Binding planned |
| Medicines, vaccines and medical devices | Health Products and Technologies (`MOH-PPB/HPT`) | KNHTS source URL | `KenyaHealthProductSystem` | Binding planned |
| SHA benefits and interventions | `MOH-KENYA/BenefitsAndInterventions` | KNHTS source URL | `KenyaShaInterventionSystem` | Required on SHA pre-authorisation; checked |
| Allergies | Kenyan allergy codes (`MOH-KENYA/ORG-00001-SRC-012`) | KNHTS source URL | `KenyaAllergyCodeSystem` | Binding planned |
| Encounter types | `MOH-KENYA/ORG-00001-SRC-027` | KNHTS source URL | `KenyaEncounterTypeSystem` | Binding planned |
| Patient identifier types | `MOH-KENYA/ORG-00001-SRC-016` | KNHTS source URL | `KenyaPatientIdentifierTypeSystem` | Binding planned |
| Document types | `MOH-KENYA/document-types` | KNHTS source URL | `KenyaDocumentTypeSystem` | Binding planned |
| Units of measure | UCUM | `http://unitsofmeasure.org` | | International standard |

"Binding planned" means the code system is defined, but Afiax does not yet enforce it. Enforcement is planned for Q4 2026 to Q1 2027. Use these systems now, so your data is ready when enforcement starts.

## Example: an ICD-11 diagnosis

```json
{
  "resourceType": "Condition",
  "code": {
    "coding": [
      {
        "system": "http://id.who.int/icd/release/11/mms",
        "code": "1F40.Z",
        "display": "Malaria due to Plasmodium falciparum, unspecified"
      }
    ]
  }
}
```

In a project using the Kenya country pack, saving a `Condition` without an ICD-11 coding is rejected. See [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance#icd-11-diagnosis-rule).

## Looking up a code

KNHTS has a public read API. To check a code:

```bash
curl -s https://ilm-hie.dha.go.ke/ocl/orgs/WHO/sources/ICD-11/concepts/1F40.Z/ | jq -r .display_name
# Malaria due to Plasmodium falciparum, unspecified
```

A `404` means the code is not in KNHTS. To search by name, use `.../concepts/?q=<term>`, then confirm the code you choose with a direct lookup, because search also matches synonyms.

## Related

- [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance)
- [Medication codes](/docs/medications/medication-codes)
- [Terminology services](/docs/terminology)
