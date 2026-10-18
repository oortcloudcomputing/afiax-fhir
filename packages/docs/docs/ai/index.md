---
sidebar_position: 1
---

# AI

AI on Afiax is delivered by **[Afiax AI](/docs/products/afiax-ai)**, a separately governed product that adds clinical decision support, imaging AI, risk scoring and surveillance to Afiax Clinical Suite.

## Rules that apply to all AI on Afiax

- **Data stays in Kenya.** Afiax AI models run on Afiax Cloud in Kenya. Afiax does not send patient data to external AI services. Partners must not send data obtained from Afiax APIs to AI services outside Kenya.
- **A clinician always decides.** AI output is a suggestion. It is written to the record only after a clinician accepts or changes it, and that decision is audited.
- **Results are ordinary FHIR resources.** Risk scores, draft reports and suggested codes are stored as standard resources (for example `RiskAssessment`, `DiagnosticReport` or a draft `Condition`), marked with their source. Your applications can read them through the normal [FHIR API](/docs/api).
- **Codes come from KNHTS.** Suggested diagnoses use ICD-11, and other codes come from the national terminology service. See [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance).

## Building AI features as a partner

If you are building an AI product that works with Afiax data, contact [info@afiax.africa](mailto:info@afiax.africa) before you start. Integrations that process identifiable patient data must run in Kenya and pass Oortcloud's review, as described in [Environments and partner access](/docs/afiax-cloud/environments-and-access). AI that supports diagnosis may also need its own registration as Software as a Medical Device.
