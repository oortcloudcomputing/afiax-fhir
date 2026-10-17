# Report IDSR Immediate Notification

Operation: `Condition/$report-idsr-notification`

This operation registers a `Condition` as an IDSR immediately notifiable disease event
under the Kenya Integrated Disease Surveillance and Response framework.

## Legislative basis

- Kenya Health Act 2017, s.57(1): health facility manager must notify the County Director
  of Health within 24 hours of suspecting or diagnosing a notifiable condition
- Kenya IDSR Technical Guidelines, 3rd Edition (2024): defines the list of immediately and
  weekly notifiable conditions; MoH/DHA have adopted ICD-11 MMS as the national coding standard
- IHR 2005 (International Health Regulations): governs international notification obligations
  for Public Health Emergencies of International Concern (PHEIC)

## When to call this operation

Call this operation when:

1. A clinician records a `Condition` whose `Condition.code` contains an ICD-11 MMS code on the
   Kenya IDSR immediately notifiable conditions list
2. This must happen on clinical suspicion — not after confirmed laboratory diagnosis

The operation can be triggered:

- **Manually**: from the `Condition` resource page in the Afiax Clinical Suite
- **Automatically**: via a FHIR Subscription that fires on Condition create/update and
  calls this operation through a bot

## Immediately notifiable conditions (Kenya IDSR 2024)

| ICD-11 MMS | ICD-10 (legacy) | Condition |
|------------|-----------------|-----------|
| 1A00 | A00 | Cholera |
| 1A07 | A01 | Typhoid fever |
| 1B93 | A20 | Plague |
| 1B97 | A22 | Anthrax |
| 1C15 | A33 | Neonatal tetanus |
| 1C17 | A36 | Diphtheria |
| 1C1C | A39 | Meningococcal disease |
| 1C81 | A80 | Acute poliomyelitis / AFP |
| 1C82 | A82 | Rabies |
| 1D47 | A95 | Yellow fever |
| 1D61 | A96 | Arenaviral haemorrhagic fever |
| 1D60.0 | A98.4 | Ebola virus disease |
| 1D60.1 | A98.5 | Marburg virus disease |
| 1D86 | A99 | Viral haemorrhagic fever, not elsewhere classified |
| 1E70 | B03 | Smallpox |
| 1E71 | B04 | Mpox (monkeypox) |
| 1F03 | B05 | Measles |
| 1E31 | J09 | Influenza A (novel/pandemic subtype) |
| RA01.0 | U07.1 | COVID-19 |

ICD-11 codes match hierarchically: a child code such as `1B93.2` (pneumonic plague) or a
postcoordinated code such as `1A00&XN6S0` triggers its listed parent.

## What the operation does

1. Reads the `Condition`.
2. Checks `Condition.code.coding[]` for a matching IDSR ICD-11 code (legacy ICD-10 codes are also matched).
3. Creates a `Task` (code: `idsr-immediate-notification`) with:
   - 24-hour `restriction.period` deadline (Kenya Health Act 2017 s.57)
   - `focus` pointing to the `Condition`
   - `identifier[system='https://afiax.africa/identifier/idsr-correlation-id']` for tracing
4. Persists an IDSR notification extension on the `Condition` via
   `https://afiax.africa/fhir/StructureDefinition/kenya-idsr-notification`.
5. Creates an `AuditEvent` (satisfies HMPR 2025 Reg.12).
6. Returns the operation result.

## Input

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `condition` | Reference | No | Reference to the `Condition`. Omit when calling on instance. |

## Output

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | code | `pending` or `error` |
| `correlationId` | string | UUID for end-to-end tracing |
| `conditionCode` | code | Matched code as recorded on the Condition (ICD-11, or ICD-10 for legacy records) |
| `conditionDisplay` | string | Human-readable condition name |
| `message` | string | Result description |
| `notifiedAt` | dateTime | ISO timestamp of notification creation |
| `task` | Reference | Reference to the created `Task` |

## What gets persisted

On success:

- `Condition.extension`
  - `https://afiax.africa/fhir/StructureDefinition/kenya-idsr-notification` with:
    - `status`, `conditionCode`, `conditionDisplay`, `notifiedAt`, `correlationId`, `task`
- `Task`
  - code: `idsr-immediate-notification`
  - 24-hour deadline in `restriction.period`
- `AuditEvent`
  - entity: the `Condition` and the created `Task`

## Subscription-based automatic triggering (recommended deployment)

For automatic notification on Condition create, configure a FHIR Subscription:

```json
{
  "resourceType": "Subscription",
  "status": "active",
  "reason": "Kenya IDSR immediate notification on notifiable Condition",
  "criteria": "Condition?code:in=https://afiax.africa/ValueSet/kenya-idsr-immediate-notification-conditions",
  "channel": {
    "type": "rest-hook",
    "endpoint": "Bot/<idsr-bot-id>",
    "header": ["Content-Type: application/fhir+json"]
  }
}
```

The bot reads the `Condition` reference from the subscription payload and calls
`POST /Condition/<id>/$report-idsr-notification`.

## FHIR ValueSet

The full set of immediately notifiable ICD-11 codes (with legacy ICD-10 equivalents) is defined at:

```
https://afiax.africa/ValueSet/kenya-idsr-immediate-notification-conditions
```

See `country-packs/kenya/valuesets/kenya-idsr-immediate-notification-conditions.json`.

## Troubleshooting

If the operation returns an error:

1. Confirm the `Condition.code.coding[]` contains an IDSR ICD-11 code (or a descendant of one)
2. Confirm the coding `system` is `http://id.who.int/icd/release/11/mms` (or `http://hl7.org/fhir/sid/icd-10` for legacy records)
3. Check the created `Task` and `AuditEvent` for the correlation ID

## Known issues

None. Introduced 2026-06-14; ICD-11 code table corrected and hierarchical matching added 2026-10-17.
