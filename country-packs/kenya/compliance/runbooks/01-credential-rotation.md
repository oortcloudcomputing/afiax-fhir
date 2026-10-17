# Credential Rotation Runbook — Kenya DHA / SHA

Run this when rotating AfyaLink HIE credentials or SHA Claims credentials.
Credential rotation must not cause downtime for in-flight clinical workflows.

---

## Rotation triggers

Rotate immediately if any of the following occur:

- a credential is suspected to have been exposed (leaked config, compromised engineer account)
- DHA or SHA requests rotation as part of their security policy
- scheduled quarterly rotation (HMPR 2025 Reg.12(c)(iii))
- an engineer leaves the organization with knowledge of production credentials

---

## AfyaLink HIE credential rotation

### Credentials to rotate

| Secret name | Where stored |
|---|---|
| `kenyaAfyaLinkConsumerKey` | `Project.secret` (tenant-managed) or `Project.systemSecret` (Afiax-managed) |
| `kenyaAfyaLinkUsername` | same |
| `kenyaAfyaLinkPassword` | same |

### Procedure

1. **Obtain new credentials from DHA AfyaLink portal.**
   Log into the AfyaLink developer portal with the organization account.
   Generate new consumer key and update the password. Do not revoke the old key yet.

2. **Stage the new credentials.**
   Go to `/admin/secrets` (tenant-managed) or `/admin/super` (Afiax-managed).
   Enter the new `kenyaAfyaLinkConsumerKey`, `kenyaAfyaLinkUsername`, `kenyaAfyaLinkPassword`.
   Save.

3. **Test connectivity.**
   In `/admin/country-pack`, click **Test HIE Connection**.
   Confirm the test returns success using the new credentials.

4. **Revoke the old credentials in the AfyaLink portal.**
   Only after step 3 confirms success.

5. **Verify one live workflow.**
   Open any `Organization` and run **Lookup Facility** to confirm the new credentials
   work end-to-end for a real DHA call.

6. **Record the rotation in the DPO Register.**
   Note: rotation date, reason, engineer who performed it.

### Rollback

If the new credentials fail in step 3, re-enter the old credentials and test again.
Do not revoke old credentials until step 3 passes.

---

## SHA Claims credential rotation

### Credentials to rotate

| Secret name | Where stored |
|---|---|
| `kenyaShaClaimsAccessKey` | `Project.secret` (tenant-managed) or `Project.systemSecret` (Afiax-managed) |
| `kenyaShaClaimsSecretKey` | same |

Note: `kenyaShaClaimsCallbackUrl` is not a secret — it is a setting and does not rotate
unless the production host changes.

### Procedure

1. **Obtain new keys from SHA Claims portal.**
   Log into the SHA Claims portal and generate a new access key + secret key pair.
   Record them in the secure handover document. Do not revoke old keys yet.

2. **Stage the new credentials.**
   In `/admin/secrets` or `/admin/super`, update `kenyaShaClaimsAccessKey` and
   `kenyaShaClaimsSecretKey`. Save.

3. **Submit a test claim bundle.**
   Open a test `Claim` and run **Submit Kenya SHA Claim** (UAT environment preferred for
   rotation testing). Confirm `status: submitted` and `responseStatusCode: 200`.

4. **Revoke old keys in the SHA Claims portal.**

5. **Check the KHIS scheduler bot.**
   The KHIS scheduler does not use SHA credentials directly. No KHIS action needed.

6. **Record the rotation in the DPO Register.**

### SHA JWT note

SHA credentials are not stored as long-lived bearer tokens. Every SHA API call signs a
short-lived JWT using the access key and secret key. There are no session tokens to
invalidate — rotating the access key and secret key is sufficient.

---

## Emergency rotation (credential exposure)

If credentials are exposed or suspected exposed:

1. **Immediately revoke** the exposed credentials in the DHA/SHA portal.
   Do this before notifying anyone else — revocation stops the exposure.

2. **Generate new credentials** immediately and update them in the secret surface
   (steps 2–3 from the procedures above).

3. **Notify the DPO** within 1 hour of confirmed or suspected exposure.

4. **Review AuditEvents** for activity using the exposed credentials.
   Query: `AuditEvent` where `recorded >= <exposure-start>` and `outcome != 0`.
   Look for unexpected access patterns.

5. **Notify DHA/SHA** if their systems may have been targeted using the exposed keys.

6. **File an incident report** in the DPO Register within 24 hours.

---

## Rotation schedule

| Credential set | Minimum rotation frequency |
|---|---|
| AfyaLink HIE | Quarterly or on trigger |
| SHA Claims | Quarterly or on trigger |

Store the rotation date and engineer name in the DPO Register after each rotation.
