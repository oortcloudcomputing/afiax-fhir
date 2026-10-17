# DHA / AfyaLink Outage Runbook

Use this when the AfyaLink HIE (DHA) is unavailable or returning errors, and Kenya
workflows are failing as a result.

---

## Symptoms

- `/admin/country-pack` → HIE Test Connection returns an error
- Facility lookup fails: `AfyaLink HIE returned an error`
- Practitioner lookup fails
- Eligibility / coverage check fails: `AfyaLink eligibility call failed`
- Patient identity lookup (`$resolve-patient-identity`) fails

---

## Confirm it is a DHA outage (not a local config problem)

Run through this before treating it as a DHA outage:

1. **Check DHA status page** (obtain URL from the AfyaLink portal or DHA technical contact).

2. **Check credentials are still valid.**
   Go to `/admin/country-pack` → Test HIE Connection.
   If it returns `401 Unauthorized`, credentials may have expired. Follow the
   [credential rotation runbook](01-credential-rotation.md) first.

3. **Check environment setting.**
   Confirm `kenyaHieEnvironment` is `production`. If it is still `uat`, the connection
   is going to the wrong endpoint.

4. **Check raw error from the Medplum server log.**
   Look for `AfyaLink HIE returned an error` log lines. The raw DHA response is included.
   A `503 Service Unavailable` or `502 Bad Gateway` from DHA confirms an outage.
   A `401` or `403` indicates a credential or permission problem, not an outage.

---

## Impact assessment

DHA outage affects these workflows:

| Workflow | Impact | Workaround |
|---|---|---|
| Facility lookup / verification | Blocked — cannot call DHA | Defer until DHA is restored |
| Practitioner lookup / verification | Blocked | Defer |
| Coverage eligibility check | Blocked | Defer; existing `Coverage` with persisted snapshot still shows last-known eligibility |
| Patient identity resolution (`$resolve-patient-identity`) | Blocked | Defer patient registration |
| SHR national record publication | Blocked | Defer |
| SHA claim submission | **Not affected** — uses SHA, not DHA | Claims can continue |
| SHA claim status refresh | **Not affected** | Continues |
| KHIS weekly export | **Not affected** | Continues on schedule |
| Break-glass access | **Not affected** — internal | Continues |

---

## During outage

**For facility, practitioner, eligibility, and patient identity workflows:**

1. Notify affected clinical staff that DHA lookup is temporarily unavailable.
2. Do not attempt to work around the DHA dependency by relaxing the security gate.
   `KenyaPatientWizard` DHA lookup is a hard gate per DHA requirements.
3. Claim workflows can continue — route clinical staff to claim submission and status refresh.
4. Existing `Coverage` eligibility snapshots remain visible on the `Coverage` page.
   Clinicians can reference the last-known eligibility without a new DHA call.

**Claims:**

Claims that need new eligibility data before submission must wait.
Claims with existing eligibility snapshots can be prepared and submitted to SHA.

---

## After DHA is restored

1. **Test the connection** in `/admin/country-pack` → Test HIE Connection.
   Confirm success before routing workflows back to DHA.

2. **Re-run deferred lookups.**
   For any facility or practitioner that could not be verified during the outage,
   run the lookup and verification now.

3. **Re-run deferred eligibility checks.**
   Open each `Coverage` where the eligibility snapshot is stale (check `Coverage.extension`
   → Kenya eligibility snapshot `eligibilityCheckedAt` timestamp).

4. **Re-run deferred patient registrations.**
   For patients who could not be registered because DHA was down, run
   `$resolve-patient-identity` now to complete their registration.

5. **Record the outage** in the DPO Register: start time, end time, workflows affected, resolution.

---

## Escalation

| Duration | Action |
|---|---|
| < 30 minutes | Monitor. Notify Engineering Lead. |
| 30 minutes – 2 hours | Notify DPO. Contact AfyaLink/DHA technical support. |
| > 2 hours | Notify CTO. Invoke incident process. |

DHA AfyaLink technical contact: obtain from the AfyaLink portal account settings.
