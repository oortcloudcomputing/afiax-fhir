# `Patient/$publish-national-record`

## Purpose

Publishes a patient's record to the Kenya National Shared Health Record (SHR) via the AfyaLink
HIE. Builds a FHIR R4 Bundle document containing the Patient resource, optionally extended with
active Conditions and/or recent Encounters, then submits it to AfyaLink.

## HTTP request

```
POST /fhir/R4/Patient/{id}/$publish-national-record
POST /fhir/R4/Patient/$publish-national-record
```

## Input parameters

| Name                     | Type      | Required | Description |
|--------------------------|-----------|----------|-------------|
| `patient`                | Reference | no       | Reference to the Patient (type-level calls only) |
| `includeActiveConditions`| boolean   | no       | Include active Conditions in the bundle. Default: `false` |
| `includeRecentEncounters`| boolean   | no       | Include the 20 most recent Encounters. Default: `false` |

## Output parameters

| Name               | Type      | Description |
|--------------------|-----------|-------------|
| `status`           | code      | `published` or `error` |
| `correlationId`    | string    | UUID for this publication |
| `patientId`        | string    | ID of the published Patient |
| `publicationId`    | string    | SHR record ID returned by AfyaLink (`message.record_id`) |
| `endpoint`         | string    | AfyaLink endpoint called |
| `publishedAt`      | dateTime  | ISO 8601 timestamp of publication attempt |
| `message`          | string    | Human-readable outcome |
| `bundleEntryCount` | integer   | Number of resources in the submitted bundle |
| `task`             | Reference | Reference to the created Task |

## AfyaLink API call

```
POST {afyaLinkBaseUrl}/v1/shr/patient-record
Authorization: Bearer <afyalink-token>
Content-Type: application/json

{FHIR Bundle document}
```

Response:
```json
{
  "message": {
    "record_id": "SHR-ABC123",
    "status": "received",
    "timestamp": "2026-06-04T10:00:00Z"
  }
}
```

`record_id` is the AfyaLink SHR publication ID — stored as `publicationId` in the output and
in the Patient extension.

## Bundle structure

```
Bundle (type: "document")
  identifier: { system: "https://afiax.africa/identifier/kenya-shr-publication-correlation-id", value: <correlationId> }
  entry[0]: Patient
  entry[1..N]: Condition (if includeActiveConditions = true)
  entry[N+1..M]: Encounter (if includeRecentEncounters = true, up to 20)
```

Condition and Encounter searches are non-fatal — if either search fails, publication proceeds
with whatever entries were successfully gathered.

## Persistence

On each call, the operation:

1. **Patient** (updated): extension at
   `https://afiax.africa/fhir/StructureDefinition/kenya-national-record-publication` with
   sub-extensions: `status`, `publishedAt`, `correlationId`, `message`, `publicationId`,
   `endpoint`. Previous publication extension is replaced.

2. **Task** (created, status `completed`):
   - `code.coding[0].code = "national-record-publication"`
   - `identifier[system='https://afiax.africa/identifier/kenya-shr-publication-correlation-id']`
   - `note[0].text` = outcome message

3. **AuditEvent**: type `rest`, subtype `operation`, action `E`.

## Reading the persisted snapshot

```typescript
import { getKenyaNationalRecordPublicationSnapshot } from '@medplum/core';

const snap = getKenyaNationalRecordPublicationSnapshot(patient);
// snap.status, snap.publicationId, snap.publishedAt, snap.correlationId, snap.message
```

## UI

The **Kenya SHR Publication** panel appears on every `/Patient/{id}` page when
`countryPack === "kenya"`. It shows the persisted snapshot and provides:

- **Include active Conditions** checkbox (default: on)
- **Include recent Encounters** checkbox (default: off)
- **Publish to SHR** button

The panel auto-hides when the project is not configured for Kenya.

## Error conditions

| Condition | status | Notes |
|-----------|--------|-------|
| AfyaLink credentials not configured | `error` | Check `kenyaAfyaLinkConsumerKey/Username/Password` secrets |
| AfyaLink returns non-2xx | `error` | AfyaLink error body in `message` |
| Patient not found | 404 | Standard FHIR not-found |
| Kenya country pack not active | 400 | `countryPack !== "kenya"` |
