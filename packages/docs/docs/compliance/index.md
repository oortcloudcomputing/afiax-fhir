---
sidebar_position: 1
---

# Compliance

This page explains which Kenyan laws and national standards Afiax is built to meet, and where in the platform each one is handled. Read it if you are a developer who needs to know *why* a rule exists before changing code near it, or if you are preparing material for a regulator or a facility.

:::info Certification status

Afiax Clinical Suite has been submitted to the **Digital Health Agency (DHA)** for certification as a Health Management Information System under the Digital Health (Use of e-Health Applications and Technologies) Regulations, 2024. Certification is **in progress**. Do not describe Afiax as DHA-certified until the certificate is issued.

Oortcloud Computing Limited (trading as Afiax Connected Healthcare) is registered with the **Office of the Data Protection Commissioner (ODPC)** as both a data controller and a data processor.

:::

## Compliance is shared

Afiax provides the controls. Each health facility that uses Afiax is still responsible for how its own staff use the system: who gets an account, what they are allowed to see, and how consent is recorded. The facility is usually the *data controller* for its patients, and Afiax acts as its *data processor*.

## The rules and where they live

| Requirement | Law or standard | How Afiax meets it | Where to look |
| --- | --- | --- | --- |
| Health data stays in Kenya | Data Protection Act 2019 s.50; Data Protection (General) Regulations 2021 reg.26; Digital Health Act 2023 | Production runs only in two Liquid Intelligent Technologies data centres in Kenya (Nairobi primary, second Kenyan site for disaster recovery). Dev and UAT use **synthetic data only**. | Platform repo: `docs/architecture/adr/008-kenya-hosting-liquid.md` |
| Privacy, confidentiality and security of health data | Digital Health Act 2023 s.24 | Encryption in transit (TLS 1.2 minimum) and at rest; mutual TLS between services; role- and attribute-based access control; break-glass access with mandatory justification | [Access control](/docs/access), [Kenya country pack](/docs/country-packs/kenya) |
| Strong sign-in | DHA e-Health Regulations 2024 | Zitadel enforces multi-factor authentication, 12-character passwords, lockout after 5 failed attempts and 30-minute idle sign-out | [Authentication](/docs/auth) |
| Audit trail kept for 20 years | Digital Health (Health Information Management Procedures) Regulations 2025, Reg.12(c)(ii) | Every read, write, search, login and admin change creates an `AuditEvent`. Events stream through Kafka to OpenSearch and are kept in write-once (object-lock) storage for 20 years | Platform repo: `platform/opensearch` |
| National diagnosis coding | MoH / DHA adoption of ICD-11 | Every diagnosis must carry an ICD-11 MMS code, checked against the Kenya National Health Terminology Service (KNHTS) when it is saved | [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance) |
| National terminologies | KNHTS | SHA interventions, LOINC, ICHI and Kenyan value sets come from KNHTS. SNOMED CT, CVX and RxNorm are not used, because they are not published in KNHTS | [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance) |
| Disease notification and reporting | IDSR guidelines; Kenya Health Act 2017 | Notifiable diagnoses raise IDSR notifications automatically; weekly KHIS (DHIS2) reports contain counts only, never patient identifiers | [Kenya terminology and surveillance](/docs/country-packs/kenya-terminology-and-surveillance) |
| Insurance claims | Social Health Insurance Act 2023 | SHA eligibility, pre-authorisation, claim submission and status workflows | [Kenya billing and settlement](/docs/country-packs/kenya-billing-and-settlement) |
| Practitioner and facility verification | KMPDC, NCK and DHA registries | Facilities and practitioners are checked against the national registries through the DHA Health Information Exchange | [Kenya country pack](/docs/country-packs/kenya) |

## Regulator documents

The full set of documents submitted to DHA is maintained outside this site. It includes the System Architecture, Technical Specifications, Privacy Policy, DPIA, Audit Trail Specification, Encryption Specification, Backup and Disaster Recovery plans, Incident Response Plan and the KNHTS Compliance documentation. To request a copy, email [info@afiax.africa](mailto:info@afiax.africa).

## If you change code near these rules

1. Check the table above to see whether your change touches a regulated area: hosting location, access, audit, coding, reporting or claims.
2. If it does, describe the impact in your pull request. For example: "Changes audit retention", or "Adds a new diagnosis code path".
3. Never weaken a control (shorter retention, optional MFA, a non-ICD-11 diagnosis path, data leaving Kenya) without written sign-off. The DHA submission states these controls as implemented.
