# Patient/$break-glass

**Emergency access declaration for Kenya DPA 2019 s.25 / Digital Health Act 2023 s.19**

Declares that a clinician is accessing a patient record under an emergency that does not allow time
for normal consent or access-control procedures. The operation creates a `Flag` marking the access
window, writes a break-glass extension onto the `Patient`, emits an `AuditEvent` with IHE ATNA
`purposeOfEvent: ETREAT`, and sends a security alert email to the configured privacy officer
address.

**Emergency access must never be blocked by alert failure.** If the email cannot be sent, the
declaration still succeeds and the failure is logged at WARN level.

---

## HTTP

```
POST /fhir/R4/Patient/{id}/$break-glass
POST /fhir/R4/Patient/$break-glass
```

---

## Input parameters

| Parameter | Type | Required | Notes |
|---|---|---|---|
| `reason` | string | Yes | Clinical reason — recorded verbatim in the audit trail |
| `durationHours` | integer | No | 1–24. Default 4 |
| `patient` | Reference | No | Required when calling on the type endpoint (no `{id}`) |

---

## Output parameters

| Parameter | Type | Notes |
|---|---|---|
| `status` | code | `active` or `error` |
| `correlationId` | string | UUID linking Flag, AuditEvent, and alert email |
| `patientId` | string | Patient resource ID |
| `declaredAt` | dateTime | ISO-8601 timestamp of declaration |
| `expiresAt` | dateTime | ISO-8601 timestamp of expiry |
| `durationHours` | integer | Effective duration (clamped) |
| `message` | string | Human-readable summary |
| `flag` | Reference | Reference to the created `Flag` resource |
| `alertSent` | boolean | Whether the security alert email was sent successfully |

---

## What gets created

### Flag

```json
{
  "resourceType": "Flag",
  "status": "active",
  "category": [{
    "coding": [{"system": "http://terminology.hl7.org/CodeSystem/flag-category", "code": "security"}]
  }],
  "code": {
    "coding": [{
      "system": "https://afiax.africa/fhir/CodeSystem/kenya-break-glass",
      "code": "break-glass-access",
      "display": "Break-glass emergency access declared"
    }],
    "text": "Break-glass: <reason>"
  },
  "subject": {"reference": "Patient/<id>"},
  "period": {"start": "<declaredAt>", "end": "<expiresAt>"},
  "author": {"reference": "Practitioner/<id>"},
  "identifier": [{
    "system": "https://afiax.africa/identifier/kenya-break-glass-correlation-id",
    "value": "<correlationId>"
  }]
}
```

### AuditEvent

- `type`: `{code: "rest"}` (Restful Operation)
- `subtype`: `[{code: "operation"}]`
- `purposeOfEvent`: `[{coding: [{system: "http://terminology.hl7.org/CodeSystem/v3-ActReason", code: "ETREAT"}]}]`
- `entity`: Patient reference + Flag reference
- `outcome`: `0` (success) or `12` (major failure)

### Extension on Patient

The break-glass snapshot is written as a complex extension on the `Patient`:

```
url: https://afiax.africa/fhir/StructureDefinition/kenya-break-glass
sub-extensions: status, reason, declaredAt, expiresAt, correlationId, declaredBy, flag
```

---

## Configuration

| Project setting | Description |
|---|---|
| `kenyaSecurityAlertEmail` | Email address for security alerts. Default: `security@afiax.africa` |

---

## Regulatory basis

| Obligation | Reference |
|---|---|
| Emergency access provision | Kenya DPA 2019, Section 25 |
| Emergency access provision | Digital Health Act 2023, Section 19 |
| Audit trail requirement | HMPR 2025, Regulation 12(c) |
| IHE ATNA emergency purpose-of-use | IHE IT Infrastructure Technical Framework, Vol. 2 |

---

## Post-hoc review requirements

The security alert email directs the reviewing officer to:

1. Confirm the clinical emergency that required this access
2. Verify the declared reason matches the clinical record
3. Revoke the `Flag` resource if access was not justified
4. Document the outcome in the patient record

Review must occur within 24 hours of the declaration.
