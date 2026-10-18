---
sidebar_position: 3
---

# Afiax DICOM (Imaging)

**Afiax DICOM** is the medical imaging module of Afiax Clinical Suite. It stores and serves imaging studies (X-ray, CT, MRI, ultrasound) from your modalities, and gives radiologists a viewer and reporting workflow. It runs on [Afiax Cloud](/docs/afiax-cloud) at `dicom.afiax.africa`, in Kenya, like the rest of the platform.

## How imaging fits with the patient record

| Step | Where it happens |
| --- | --- |
| A clinician orders an imaging study | Afiax FHIR: a `ServiceRequest` with the KNHTS procedure or investigation code |
| The modality (X-ray machine, CT scanner) sends images | To Afiax DICOM, using the standard DICOM protocol, through the [Afiax Facility Agent](/docs/agent) at the facility |
| The study is stored and indexed | Afiax DICOM |
| The radiologist reads the study and writes the report | Afiax DICOM viewer; the report is saved in Afiax FHIR as a `DiagnosticReport` linked to the order (automatic write-back is planned; confirm availability with your implementation lead) |
| The clinician sees the result | Afiax Provider, from the patient's record |

Images stay in Afiax DICOM; the patient record holds the order, the report and links to the study. Images are not copied into the FHIR store.

## Connecting a modality

Oortcloud's implementation team connects your imaging equipment during onboarding:

1. We install the Afiax Facility Agent on a computer on the same network as your modalities.
2. We register each modality (its AE title, IP address and port) with the Agent.
3. The Agent forwards studies securely over the internet to Afiax DICOM, so your modalities never connect to the internet directly.
4. We send a test study and confirm it appears against a test patient.

To add or change a modality later, raise a request with the [Afiax Helpdesk](/docs/afiax-cloud/support-and-sla).

## Imaging AI

With the [Afiax AI](/docs/products/afiax-ai) add-on, studies in Afiax DICOM can be screened for possible abnormalities, and draft reports prepared for the radiologist. The radiologist always reviews and signs the report.

## Developer notes

- Use the FHIR `ServiceRequest` and `DiagnosticReport` resources in Afiax FHIR for orders and results. See [Ordering labs and imaging](/docs/charting/ordering-labs-imaging).
- Partners who need direct image access (for example, a teleradiology service) should ask Oortcloud. Access is granted per facility and audited like all other access.
