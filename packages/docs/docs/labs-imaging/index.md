# Labs & Imaging

Lab orders and imaging results in FHIR follow a request-and-report pattern. A [`ServiceRequest`](/docs/api/fhir/resources/servicerequest) represents the order, and a [`DiagnosticReport`](/docs/api/fhir/resources/diagnosticreport) captures the results. Individual measurements are stored as [`Observation`](/docs/api/fhir/resources/observation) resources linked to the report.

```mermaid

flowchart RL
    patient[<table><thead><tr><th>Patient</th></tr></thead><tbody><tr><td>Lisa Simpson</td></tr></tbody></table>]
    order[<table><thead><tr><th>ServiceRequest</th></tr></thead><tbody><tr><td>Basic Metabolic Panel</td></tr></tbody></table>]
    specimen[<table><thead><tr><th>Specimen</th></tr></thead><tbody><tr><td>Whole Blood</td></tr><tr><td><em>Collected: 2020-01-01T14:12</em></td></tr></tbody></table>]
    obs1[<table><thead><tr><th>Observation</th></tr></thead><tbody><tr><td>Glucose in Blood</td></tr><tr><td>4.0 mmol/L</td></tr></tbody></table>]
    obs2[<table><thead><tr><th>Observation</th></tr></thead><tbody><tr><td>Urea nitrogen in Blood</td></tr></tbody></table>]
    report[<table><thead><tr><th>DiagnosticReport</th></tr></thead></table>]

    subgraph Order
    order -->|subject| patient
    order -->|specimen| specimen
    end

    subgraph Result
    report -->|result| obs1
    report -->|result| obs2
    report -->|basedOn| order
    obs1 -->|basedOn| order
    obs2 -->|basedOn| order
    end

```

## Key Resources

| **Resource**                                                    | **Description**                                                                                                               |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`ServiceRequest`](/docs/api/fhir/resources/servicerequest)     | A record of an order for services such as diagnostic investigations, treatments, or operations to be performed.               |
| [`DiagnosticReport`](/docs/api/fhir/resources/diagnosticreport) | The findings and interpretations of diagnostic tests performed on a patient.                                                  |
| [`Specimen`](/docs/api/fhir/resources/specimen)                 | A record of a sample to be used for analysis.                                                                                 |
| [`Observation`](/docs/api/fhir/resources/observation)           | A structured representation of measurements and simple assertions made about a [`Patient`](/docs/api/fhir/resources/patient). |

## Key Code Systems

All codes come from KNHTS. See [Commonly used terminologies](/docs/terminology/common-terminologies).

| **Code System** | **Used for** |
| --- | --- |
| Kenyan investigations list (`MOH-PPB/Investigations`) | The test ordered on the [`ServiceRequest`](/docs/api/fhir/resources/servicerequest) |
| [LOINC](/docs/careplans/loinc) (`Regenstrief/LOINC` in KNHTS) | Tests and results on [`Observation`](/docs/api/fhir/resources/observation) resources |
| ICD-11 MMS | The diagnosis or reason for the order |
| [UCUM](https://ucum.org/) | Units of measurement on results and specimens |

## Afiax products and integrations

- [Laboratory orders and results](/docs/integration/laboratory): in-house analysers and external labs
- [Afiax DICOM](/docs/integration/afiax-dicom): imaging studies and radiology reports
- [Afiax Facility Agent](/docs/agent): connecting on-site equipment
