---
sidebar_position: 3
---

# Afiax AI

Afiax AI brings clinical intelligence into the Clinical Suite workflow. It is a separately governed product, because AI that assists diagnosis is regulated as a higher-risk medical device (Software as a Medical Device, Class C/D). It has its own registration, clinical evidence and post-market surveillance. It is licensed as an add-on to Afiax Clinical Suite and launches in a later wave, after that registration.

## The governing rule: a clinician always decides

Afiax AI supports decisions; it never makes them. Every recommendation is shown to a clinician, who must accept, change or reject it before anything reaches the patient record. That decision is recorded in the audit trail, and the record of acceptances and rejections feeds continuous monitoring of each model's performance.

## Capabilities

| Capability | What it does |
| --- | --- |
| Diagnostic assistance | Suggests differential diagnoses and flags critical findings |
| Imaging AI | Highlights possible abnormalities on X-ray, CT and ultrasound studies in Afiax DICOM, and drafts structured reports for the radiologist |
| Risk stratification | Predicts readmission, clinical deterioration and disease progression |
| Clinical documentation | Summarises notes and turns dictation into structured, ICD-11-coded records |
| Population health | Disease-burden and immunisation-gap analysis from de-identified data |
| Outbreak detection | Spots unusual patterns in attendance and diagnoses, alongside IDSR |

## Data and privacy

- Models run on Afiax Cloud in Kenya. Patient data is not sent to external AI services.
- Population analytics use de-identified data only.
- Results are written back as standard FHIR resources (for example `RiskAssessment` and `DiagnosticReport`), so they appear in the record like any other clinical data, with their source clearly marked.

For availability, email [info@afiax.africa](mailto:info@afiax.africa).
