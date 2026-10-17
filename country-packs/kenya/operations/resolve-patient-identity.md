# `Patient/$resolve-patient-identity`

## Purpose

Resolves a patient's identity against the DHA National Client Registry (AfyaLink v3). This is
the programmatic equivalent of the `KenyaPatientWizard` first step — it can be called from
bots, integrations, or any context where a direct HTTP call is preferred over the guided UI.

## DHA as sole source of truth

Kenya DHA requirements mandate that a patient record cannot be created in the local CDR unless
the patient is first found in the National Client Registry. This operation enforces that rule.
If DHA returns `found: 0` or an empty `result[]`, the call fails with a descriptive
`OperationOutcome`.

## HTTP request

```
POST /fhir/R4/Patient/$resolve-patient-identity
POST /fhir/R4/Patient/{id}/$resolve-patient-identity
```

Both type-level and instance-level calls are accepted. The instance form is used to re-verify
an existing Patient resource against DHA.

## Input parameters

| Name                   | Type   | Required | Description |
|------------------------|--------|----------|-------------|
| `identificationType`   | string | yes      | One of the Kenya identification types: `National ID`, `Alien ID`, `Passport`, `Birth Certificate`, `Refugee ID` |
| `identificationNumber` | string | yes      | The government-issued ID number |

## Output parameters

| Name                | Type    | Description |
|---------------------|---------|-------------|
| `status`            | code    | `verified` or `not-found` or `error` |
| `correlationId`     | string  | UUID for this lookup |
| `message`           | string  | Human-readable outcome |
| `nextState`         | string  | Suggested next action |
| `countryPack`       | string  | `kenya` |
| `found`             | boolean | Whether DHA returned a match |
| `clientRegistryId`  | string  | DHA client registry ID |
| `fullName`          | string  | Full name from DHA |
| `firstName`         | string  | Given name from DHA |
| `lastName`          | string  | Family name from DHA |
| `dateOfBirth`       | string  | Date of birth from DHA (`YYYY-MM-DD`) |
| `gender`            | string  | Gender from DHA |

## AfyaLink API call

The operation calls:

```
GET {afyaLinkBaseUrl}/v3/client-registry/fetch-client
  ?identification_type={identificationType}
  &identification_number={identificationNumber}
  &agent={kenyaHieAgentId}
```

`kenyaHieAgentId` must be set in project settings before this operation will work correctly.

## Response format (v3)

AfyaLink v3 returns a FHIR R4 Patient resource inside `message.result[]`:

```json
{
  "message": {
    "result": [
      {
        "resourceType": "Patient",
        "id": "<client-registry-id>",
        "name": [{ "family": "Kamau", "given": ["Jane"] }],
        "birthDate": "1988-05-12",
        "gender": "female",
        "identifier": [...]
      }
    ]
  }
}
```

An empty `result[]` means the patient is not in the registry.

## Admin shortcut

For onboarding and testing, the admin endpoint `POST /admin/projects/:projectId/kenya/afyalink/patient-lookup`
accepts the same parameters and returns the raw DHA response without creating any FHIR resources.

## Persistence

On success, the operation:

- Creates or updates a `Patient` resource with the DHA identifier
- Stores `client_registry_id` as an extension on `Patient.identifier`
- Creates a `Task` with the correlation ID
- Creates an `AuditEvent`

## Error conditions

| Condition | HTTP | OperationOutcome |
|-----------|------|-----------------|
| Patient not found in DHA | 422 | `not-found` |
| Missing identification parameters | 400 | `bad-request` |
| AfyaLink auth failure | 422 | `bad-request` with AfyaLink error |
| Kenya country pack not active | 400 | `bad-request` |
