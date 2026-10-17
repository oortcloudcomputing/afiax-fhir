# Kenya Claim Reconciliation Runbook

Use this for routine monthly reconciliation of SHA claim submissions against SHA settlement
statements, and for investigating individual claims that have stalled or been rejected.

---

## Reconciliation triggers

Run full reconciliation:
- Monthly, before accounts payable closes
- After any SHA outage lasting more than 4 hours
- After credential rotation, to confirm no claims were lost during the rotation window
- Whenever SHA settlement figures don't match expected amounts

Run single-claim investigation:
- Claim stuck in `submitted` for more than 5 business days without a callback
- Claim rejected by SHA
- Claim shows `adjudicated` locally but payment has not arrived

---

## Monthly reconciliation procedure

### 1. Export local claim list

Open `/admin/country-pack` → Kenya SHA Claim Queue.
Set filter to **All submitted**.
Note the count and date range.

For programmatic export (Engineering Lead):
```
GET /fhir/R4/Claim?_count=500&_sort=-_lastUpdated
```
Filter to Claims with a Kenya claim submission snapshot (extension URL:
`https://afiax.africa/fhir/StructureDefinition/kenya-sha-claim-submission`).

Key fields per Claim:
- `bundleId` — SHA's tracking ID
- `submissionStatus` — local normalized status
- `claimState` — SHA's adjudication state
- `submittedAt` — when the claim was submitted

### 2. Obtain SHA settlement statement

Download the settlement statement from the SHA Claims portal for the same period.
The settlement statement lists `bundle_id` and adjudication state for each claim.

### 3. Compare

| Match scenario | Action |
|---|---|
| Local `claimState = approved` and SHA settlement shows approved | No action |
| Local `claimState = submitted` but SHA settlement shows approved | Run `$check-national-claim-status` to pull latest state |
| Local `claimState = submitted` and SHA settlement has no record | Contact SHA Claims support with the `bundleId` |
| Local `claimState = rejected` and SHA settlement shows rejected | Review rejection reason in `ClaimResponse.disposition` |
| SHA settlement shows approved but payment not received | Escalate to finance team with the `bundleId` and SHA statement reference |

### 4. Refresh stale claims

For Claims where local state lags SHA's settlement statement:
- Open the Claim in the Afiax FHIR UI
- Click **Check Kenya SHA Claim Status**
- Confirm the `ClaimResponse` is updated

Or in bulk via the claim queue panel:
- Filter to **Queued / awaiting SHA**
- Use **Refresh Status** on each claim

### 5. Record reconciliation outcome

Record in the DPO Register:
- Reconciliation period
- Claims reviewed
- Discrepancies found
- Resolution for each discrepancy
- Engineer who performed the reconciliation

---

## Single claim investigation

### Claim stuck in `submitted`

1. Open the `Claim` page.
2. Inspect the Kenya claim submission snapshot: confirm `bundleId` is present.
3. Click **Check Kenya SHA Claim Status**.
   - If status updates: SHA has processed it. Reconciliation complete.
   - If `status: error`: SHA is unreachable. Follow [SHA outage runbook](03-sha-outage.md).
   - If status stays `submitted` after 5 business days: Contact SHA Claims support
     with the `bundleId`.

### Claim rejected

1. Open the `Claim` page. Inspect `ClaimResponse.disposition` for the rejection reason.
2. Common rejection reasons and fixes:

| SHA rejection reason | Likely cause | Fix |
|---|---|---|
| `invalid-bundle` | Bundle fails SHA FHIR validation | Inspect `rawBundle` in submission snapshot; fix missing required fields |
| `patient-not-found` | Patient not in SHA registry | Confirm patient's national ID was verified via DHA first |
| `facility-not-registered` | Facility not in SHA network | Confirm `Organization` is DHA-verified with a valid MFL code |
| `practitioner-not-registered` | Practitioner not in SHA network | Confirm `Practitioner` is DHA-verified with a valid authority number |
| `duplicate-claim` | Same `bundleId` submitted twice | Do not re-submit; contact SHA Claims to cancel the duplicate |
| `coverage-not-active` | Patient not eligible at time of service | Check eligibility snapshot; confirm `covered: true` at service date |

3. After fixing the underlying data, re-submit: open the `Claim` and click **Submit Kenya SHA Claim**.
   This generates a new `bundleId` for the corrected submission.

### ClaimResponse shows wrong amount

If SHA has approved a claim but the amount in `ClaimResponse.payment.amount` differs from
what was billed:

1. Note the `bundleId`.
2. Download the SHA adjudication details from the SHA Claims portal for that `bundleId`.
3. Compare with the original `Claim.total`.
4. Escalate to the finance team and SHA Claims support with both figures.

---

## Useful FHIR queries for reconciliation

```
# All submitted claims with no status update in 7 days
GET /fhir/R4/Claim?_lastUpdated=lt<7-days-ago>

# All ClaimResponses for a known bundleId
GET /fhir/R4/ClaimResponse?identifier=https://afiax.africa/kenya/identifier/sha-claim-id|<bundleId>

# All Tasks for a Claim
GET /fhir/R4/Task?focus=Claim/<id>

# AuditEvents for a Claim
GET /fhir/R4/AuditEvent?entity=Claim/<id>
```
