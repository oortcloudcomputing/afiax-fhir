---
sidebar_position: 3
---

# Order Labs and Imaging

Clinicians order laboratory tests and imaging electronically in Afiax Provider (computerised order entry). Orders are stored in Afiax FHIR, and are sent on to the lab or to [Afiax DICOM](/docs/integration/afiax-dicom).

This guide describes how lab and imaging ordering works. The guide for meds will be covered in the [Medications](/docs/medications) section.

## Order Form

Building a custom computerized order form that represents an organization's [Diagnostic Catalog](/docs/careplans/diagnostic-catalog) and enabling the appropriate provider integrations are the first steps to a CPOE workflow. The form itself needs to support capturing the basics of a diagnostic workflow namely:

- Choosing **which tests** to order (e.g. HbA1c) and which provider (e.g. ACME Clinical Lab) to order from
- **Ask on Entry (AOE) questions** - specific to the diagnostic test itself. For example, a common Renal Panel AOE question is to ask whether the patient is fasted or not.
- **Specimen details** - support data capture for specimen collected time as well as details on the specimen itself.
- **Billing and insurance questions** - indicating which account or payor should pay for the test.

This [questionnaire](https://storybook.medplum.com/?path=/story/medplum-questionnaireform--lab-ordering) demonstrates a sample CPOE order form and can be added to your Afiax app or provider facing application to enable an ordering workflow.

## Where orders go

| Order | Fulfilled by | Docs |
| --- | --- | --- |
| Lab test, in-house lab | The facility's lab; analysers connected through the Afiax Facility Agent | [Laboratory orders and results](/docs/integration/laboratory) |
| Lab test, external lab | An approved partner laboratory connected to Afiax | [Laboratory orders and results](/docs/integration/laboratory) |
| Imaging | The facility's radiology department, with studies stored in Afiax DICOM | [Afiax DICOM](/docs/integration/afiax-dicom) |

:::caution
Connecting a lab, analyser or imaging modality is done by Oortcloud during onboarding. To add one, raise a request with the [Afiax Helpdesk](/docs/afiax-cloud/support-and-sla).
:::

## Logistics

CPOE should be aware of the logistics workflow a provider wants to enable. Below are **common logistics considerations** and how they effect the CPOE experience.

| Scenario                     | Implications                                                                                                             |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Specimen collected on site   | CPOE must collect specimen collected time and details as well as support printing of requisitions to attach to specimens |
| Specimen collected elsewhere | No specimen collection details on the form - patients informed of geographic location of diagnostics provider            |

## Related Material

- [Laboratory orders and results](/docs/integration/laboratory)
- [Afiax DICOM](/docs/integration/afiax-dicom)
- [Diagnostic catalog](/docs/careplans/diagnostic-catalog)
