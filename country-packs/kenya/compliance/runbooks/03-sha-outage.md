# SHA Claims Outage Runbook

Use this when the Kenya SHA Claims system is unavailable or returning errors, and claim
submission or status refresh workflows are failing.

---

## Symptoms

- `$submit-national-claim` returns `status: error` with a SHA error message
- `$check-national-claim-status` returns `status: error`
- SHA async callback is not arriving for submitted claims
- Claim queue panel shows large numbers of claims stuck in `submitted` state

---

## Confirm it is a SHA outage (not a local config problem)

1. **Check SHA Claims status.**
   Contact the SHA Claims technical team for status. There is no public status page.

2. **Verify credentials are valid.**
   Open a `Claim` and run **Submit Kenya SHA Claim**.
   If the raw response is `401 Unauthorized` or `403 Forbidden`, the SHA JWT may be
   using expired or invalid keys. Follow [credential rotation](01-credential-rotation.md).

3. **Check environment setting.**
   Confirm `kenyaShaClaimsEnvironment = production`. A `uat` setting in production means
   all submissions are going to the UAT SHA endpoint, not the live system.

4. **Inspect the raw SHA response.**
   The `rawResponse` field on `$submit-national-claim` output and in the Claim extension
   contains the SHA response body. A `503` or empty body confirms an outage.
   A `422 Unprocessable Entity` from SHA usually means a bundle validation error, not outage.

---

## Impact assessment

| Workflow | Impact |
|---|---|
| Claim submission | Blocked |
| Claim status refresh | Blocked (or stale) |
| SHA async callback | No new callbacks arriving |
| Pre-authorization requests | Blocked |
| Eligibility / DHA workflows | **Not affected** |
| KHIS export | **Not affected** |
| Break-glass access | **Not affected** |

---

## During outage

**Claims already submitted (status: submitted, awaiting SHA decision):**
- No action needed. SHA will process them when restored.
- Do not re-submit. Duplicate bundles will result in duplicate adjudication.
- The claim queue panel shows `submitted` claims. This is expected.

**New claims that need submission:**
1. Run `$submit-national-claim`. The operation will still succeed with `status: prepared`
   if credentials fail (because the bundle is prepared but transmission fails).
2. Record the `rawBundle` from the extension for manual re-submission if needed.
3. Do not prepare duplicate bundles — use the same `bundleId` for retry.

**Pre-authorization requests:**
- Defer until SHA is restored.

---

## After SHA is restored

1. **Test claim submission** with a non-critical test claim.
   Confirm `status: submitted` and `responseStatusCode: 200`.

2. **Refresh status on stale claims.**
   In `/admin/country-pack` → Kenya SHA Claim Queue, filter to `Queued / awaiting SHA`.
   Click **Refresh Status** on each claim that was submitted during the outage window.
   Alternatively use a Bot to bulk-refresh: call `$check-national-claim-status` on each
   Claim with `submissionStatus = submitted` and no recent status snapshot.

3. **Check for duplicate submissions.**
   If any claims were re-submitted during the outage, check for duplicate `bundleId`
   values in the claim queue. Contact SHA Claims support if duplicates exist.

4. **Record the outage** in the DPO Register.

---

## Manual claim re-submission

If a claim was prepared but the transmission failed and the `rawBundle` was not captured
in the Claim extension:

1. Open the `Claim`.
2. Inspect `Claim.extension` for the Kenya claim submission snapshot.
3. If `status: prepared`, the bundle was built but not sent. Click **Submit Kenya SHA Claim** again.
4. If `status: submitted` with a `bundleId`, the claim was received by SHA. Do not re-submit —
   run **Check Status** instead.

---

## Bulk status refresh (post-outage)

For large numbers of stuck claims, run this approach:

1. Open `/admin/country-pack` → Kenya SHA Claim Queue.
2. Set filter to **Queued / awaiting SHA**.
3. Refresh claims one at a time using the **Refresh** button, or:
4. Contact Engineering Lead to run a bulk Bot execution:
   ```
   GET /fhir/R4/Claim?_count=200 (filter by submission snapshot present, status = submitted)
   POST /fhir/R4/Claim/{id}/$check-national-claim-status for each
   ```

---

## Escalation

| Duration | Action |
|---|---|
| < 1 hour | Monitor. Notify Engineering Lead. |
| 1 – 4 hours | Notify DPO and CTO. Contact SHA Claims technical support. |
| > 4 hours | Full incident process. Claims cannot progress — notify affected clinicians. |

SHA Claims technical contact: obtain from the SHA Claims portal or SHA technical liaison.
