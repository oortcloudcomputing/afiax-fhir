# KHIS MOH 505 Weekly Aggregate Export

Operation: `$khis-weekly-export` (system-level)

This operation aggregates FHIR `Condition` resources for a given ISO week and facility,
then pushes the counts to the Kenya Health Information System (KHIS) via the DHIS2
`dataValueSets` API — fulfilling the MOH 505 weekly epidemiological bulletin requirement.

## Legislative basis

- Kenya Health Act 2017 s.57–63: mandatory disease notification by health facility managers
- Kenya IDSR Technical Guidelines 3rd Edition (2024): weekly reporting tier; MOH 505 form;
  aggregate counts of suspected cases, confirmed cases, and deaths per disease per facility
- Digital Health Act 2023 s.24: health data interoperability and national health information systems

## What KHIS is

KHIS (Kenya Health Information System) is Kenya's national HMIS, built on DHIS2.
The URL for the production instance is `https://hiskenya.org`.
The UAT/test instance is `https://hiskenya-uat.health.go.ke`.

MOH 505 is the weekly aggregate epidemiological bulletin. Data entry in KHIS covers:
- Suspected cases per disease per facility per epi-week
- Confirmed cases per disease per facility per epi-week
- Deaths per disease per facility per epi-week

## Weekly reportable conditions

The operation aggregates conditions from two tiers:

**Immediately notifiable (same 19 codes as IDSR immediate notification):**
Cholera, Typhoid, Plague, Anthrax, Neonatal tetanus, Diphtheria, Meningococcal disease,
AFP/Polio, Rabies, Yellow fever, Arenaviral HF, Ebola, Marburg, Unspecified VHF,
Smallpox, Mpox, Measles, Influenza A (novel), COVID-19.

**Weekly endemic surveillance:**
Tuberculosis (A15-A17), Amoebiasis (A06), Diarrhoeal diseases (A09), Leptospirosis (A27),
Leprosy (A30), Typhus (A75), Dengue (A90), Mosquito-borne viral fevers/RVF/Chikungunya (A92),
Malaria P. falciparum (B50), Malaria P. vivax (B51), Malaria unspecified (B54),
Leishmaniasis (B55), Filariasis (B74), Bacterial meningitis (G00, G03),
ARI/Pneumonia (J00, J06, J18), Acute gastroenteritis (K52).

## Configuration (required before first use)

### Project settings

| Setting | Description |
|---------|-------------|
| `kenyaKhisEnvironment` | `uat` (default) or `production` |
| `kenyaKhisCredentialMode` | `tenant-managed` (default) or `afiax-managed` |
| `kenyaKhisMoh505DataSetUid` | DHIS2 dataset UID for MOH 505 — obtain from your KHIS administrator |
| `kenyaKhisDataElementMapping` | JSON mapping from ICD-10 code → DHIS2 data element UIDs |

### Project secrets (tenant-managed mode)

| Secret | Description |
|--------|-------------|
| `kenyaKhisUsername` | KHIS DHIS2 username |
| `kenyaKhisPassword` | KHIS DHIS2 password |
| `kenyaKhisBaseUrl` | Override base URL (optional — defaults to environment selection) |

### Data element mapping format

The `kenyaKhisDataElementMapping` setting is a JSON string mapping each ICD-10 code
to the DHIS2 data element UIDs for that disease's suspected/confirmed/deaths counts.

Obtain the UIDs from your KHIS administrator or from the DHIS2 metadata API:

```
GET https://hiskenya.org/api/dataElements?fields=id,name,code&filter=dataSetElements.dataSet.id:eq:<MOH505_UID>
```

Example mapping (UIDs are illustrative — use actual values from your KHIS instance):

```json
{
  "A00": {
    "suspected": "xE7iSd2T1lH",
    "confirmed": "Ql6sE0Y2Y3m",
    "deaths":    "kZ9t1E3Bj4n"
  },
  "B05": {
    "suspected": "mP2kT8Ys1cQ",
    "confirmed": "uR5wV9Lq0aX"
  },
  "B50": {
    "suspected": "nJ4hF6Kv2bM",
    "confirmed": "pS7gD8Nm3cL",
    "deaths":    "qT0fG9Op4dK"
  }
}
```

Only ICD-10 codes present in the mapping generate DHIS2 data values. Codes without a
mapping entry are silently skipped — no error is raised.

## Input parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `facilityId` | string | Yes | Organization resource ID of the reporting facility |
| `period` | string | No | DHIS2 ISO week period (e.g. `2026W24`). Defaults to current week. |
| `dryRun` | boolean | No | If `true`, aggregates and validates without pushing to KHIS. Default: `false`. |

## Output parameters

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | code | `pending` (dry run), `exported`, or `error` |
| `correlationId` | string | UUID for end-to-end tracing |
| `period` | string | DHIS2 period used (e.g. `2026W24`) |
| `facilityId` | string | Organization ID supplied |
| `facilityOrgUnit` | string | MFL code used as DHIS2 org unit |
| `conditionCount` | integer | Total suspected + confirmed Condition records matched |
| `dataValueCount` | integer | Number of DHIS2 data values in the push payload |
| `dhis2ImportStatus` | string | DHIS2 import summary status (`SUCCESS`, `WARNING`, `ERROR`) |
| `dhis2ImportCount` | integer | Number of data values imported/updated by DHIS2 |
| `message` | string | Human-readable result |
| `exportedAt` | dateTime | ISO timestamp of export |
| `task` | Reference | Reference to the created `Task` |
| `documentReference` | Reference | Reference to the `DocumentReference` export artifact (contains the raw JSON payload sent to DHIS2) |

## What gets persisted

On each export run:

- `Task` — code: `khis-weekly-export`, completed or failed, with DHIS2 import status in output
- `DocumentReference` — contains the Base64-encoded DHIS2 `dataValueSet` JSON payload, linked to the facility
- `AuditEvent` — satisfies HMPR 2025 Reg.12 / Digital Health Act 2023 s.24

## How `Condition` resources are classified

| `Condition.verificationStatus` | Classification |
|-------------------------------|----------------|
| `confirmed` | confirmed case |
| `provisional`, `unconfirmed`, absent | suspected case |
| `refuted`, `entered-in-error` | excluded |

Deaths are not automatically detected from Condition resources. If your clinical workflow
records deaths separately (e.g. via an `Observation` of type `death`), configure a bot to
increment the deaths count in a linked resource before the weekly export runs.

## Scheduling (recommended)

Run this operation weekly, typically on Monday morning for the previous epidemiological week:

```bash
# Example: push last week's data for facility Organization/12345
POST /$khis-weekly-export
Content-Type: application/json

{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "facilityId", "valueString": "12345" },
    { "name": "period",     "valueString": "2026W24" }
  ]
}
```

For automated weekly execution, configure a FHIR Bot triggered by a `Schedule` resource,
or use the Afiax platform scheduler (Project setting `kenyaKhisExportScheduleBotId` — v1.1).

## Dry run

Always do a dry run first to verify the mapping and credential configuration:

```json
{
  "resourceType": "Parameters",
  "parameter": [
    { "name": "facilityId", "valueString": "12345" },
    { "name": "period",     "valueString": "2026W24" },
    { "name": "dryRun",     "valueBoolean": true }
  ]
}
```

A dry run creates a `Task` and `AuditEvent` but does not call the KHIS API.
The response includes `dataValueCount` showing how many values would be pushed.

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| `KHIS credentials not found` | `kenyaKhisUsername`/`kenyaKhisPassword` not set in Project.secret |
| `MOH 505 dataset UID not configured` | `kenyaKhisMoh505DataSetUid` project setting missing |
| `dataValueCount: 0` | No ICD-10 codes in the Condition results match the data element mapping |
| DHIS2 returns `status: ERROR` | Check `dhis2ImportStatus` in the Task output; inspect conflicts in the DHIS2 import summary |
| `HTTP 401` | KHIS credentials invalid or expired |
| `ECONNREFUSED` | Wrong `kenyaKhisEnvironment` (UAT vs production) or network issue |
