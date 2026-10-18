# Medications

Medications in Afiax Clinical Suite cover prescribing, dispensing, administration and allergies, all recorded in Afiax FHIR, with pharmacy stock managed in Afiax Billing.

| Step | FHIR resource | Where it happens |
| --- | --- | --- |
| Prescribe | [`MedicationRequest`](/docs/api/fhir/resources/medicationrequest) | Afiax Provider |
| Dispense | [`MedicationDispense`](/docs/api/fhir/resources/medicationdispense) | Pharmacy; stock in Afiax Billing |
| Administer (wards) | [`MedicationAdministration`](/docs/api/fhir/resources/medicationadministration) | Afiax Provider |
| Record what a patient already takes | [`MedicationStatement`](/docs/api/fhir/resources/medicationstatement) | Afiax Provider |
| Record an allergy | [`AllergyIntolerance`](/docs/api/fhir/resources/allergyintolerance) | Afiax Provider |

Medicines are coded with the Kenya Health Products and Technologies list (`MOH-PPB/HPT`) from KNHTS. See [Medication codes](/docs/medications/medication-codes).

You can react to new prescriptions with [Subscriptions](/docs/subscriptions/index.md) and [Bots](/docs/bots/). For example, you can notify the pharmacy queue, or check a prescription against your facility's [formulary](/docs/medications/formulary).

- [Prescribing and dispensing](/docs/medications/e-prescibe)
- [Medication codes](/docs/medications/medication-codes)
- [Formulary](/docs/medications/formulary)
