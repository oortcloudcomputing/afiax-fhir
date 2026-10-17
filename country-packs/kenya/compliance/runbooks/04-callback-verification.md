# SHA Callback Verification and Replay Runbook

Use this when SHA async callbacks are not being received, are being rejected, or when
claim status from SHA is inconsistent with what the claim queue panel shows.

---

## How SHA callbacks work

When SHA adjudicates a claim, it pushes a webhook to:

```
POST https://<production-host>/kenya/sha-callback/<projectId>
```

The callback body contains:
- `bundleId` (or `claim_id` / `claimId`) — the SHA bundle ID from submission
- `claimState` (or `claim_state` / `status`) — SHA adjudication state

The server:
1. Optionally verifies an HS256 JWT using `kenyaShaClaimsSecretKey`
2. Finds the `Claim` by matching `bundleId` against submission snapshots
3. Upserts a `ClaimResponse` with the SHA state
4. Updates open `Task` records to the callback status

---

## Diagnosing missed callbacks

### Step 1: Confirm the callback URL is registered with SHA

The callback URL `kenyaShaClaimsCallbackUrl` must be registered in the SHA Claims portal.
Go to the SHA Claims portal → Webhook configuration. Confirm the URL matches exactly:
```
https://<production-host>/kenya/sha-callback/<projectId>
```

Mismatches (wrong project ID, trailing slash, HTTP vs HTTPS) will silently drop callbacks.

### Step 2: Check the server receives callbacks

Look in the Medplum server logs for:
```
POST /kenya/sha-callback/<projectId>
```

If there are no log entries, SHA is not reaching the server. Check:
- DNS resolves the production hostname
- TLS certificate is valid (SHA will reject self-signed certs)
- Ingress is passing the path through to the server
- Firewall rules allow inbound HTTPS from SHA's source IP range

### Step 3: Check the callback is being processed

A successful callback returns `{"ok": true}`.
A failed callback returns `{"ok": false, "error": "<reason>"}`.

If the server is receiving callbacks but returning `ok: false`, the likely causes are:
- `bundleId` in the callback doesn't match any Claim — check claim submission snapshots
- JWT verification failed — check `kenyaShaClaimsSecretKey` matches the key SHA is using

### Step 4: Verify the ClaimResponse was upserted

For a Claim that should have received a callback, search for a `ClaimResponse` with identifier:
```
system: https://afiax.africa/kenya/identifier/sha-claim-id
value: <bundleId>
```

If no `ClaimResponse` exists, the callback was not processed. Check step 3.

---

## Testing the callback endpoint manually

Send a test payload directly to the endpoint to verify it is reachable and processed:

```bash
curl -X POST https://<production-host>/kenya/sha-callback/<projectId> \
  -H "Content-Type: application/json" \
  -d '{
    "bundleId": "<known-bundle-id-from-a-submitted-claim>",
    "claimState": "approved",
    "claim_id": "<known-bundle-id-from-a-submitted-claim>"
  }'
```

Expected response: `{"ok": true, "updated": true}` or `{"ok": true, "updated": false}`.

`"updated": false` means the bundleId did not match any Claim — check the bundleId value.

---

## Replaying a missed callback

If SHA sent a callback that was not processed (dropped due to server downtime, config error,
or mismatched bundleId), replay it manually:

1. Get the SHA claim state by running `$check-national-claim-status` on the Claim.
   This polls SHA directly and upserts the `ClaimResponse` without needing a callback.

2. If `$check-national-claim-status` also fails (SHA unreachable), follow the
   [SHA outage runbook](03-sha-outage.md).

3. If the `ClaimResponse` state from `$check-national-claim-status` differs from what SHA
   told you verbally or via email, record the discrepancy and contact SHA Claims support.

---

## JWT verification failures

The callback handler verifies the `Authorization: Bearer <jwt>` header using HS256 with
`kenyaShaClaimsSecretKey`.

If SHA is not sending a JWT (plain JSON only), the callback body is **not trusted**. The handler
uses it only as a trigger: it looks up the Claim by `bundleId`, calls the SHA claim-status API
(`$check-national-claim-status` path) and applies that response instead of the callback body.
If the SHA API call fails, nothing is changed and the endpoint returns 400 — recover with
`$check-national-claim-status` once SHA is reachable.

A callback that presents a JWT is rejected if the JWT does not verify, or if no
`kenyaShaClaimsSecretKey` is configured.

M-Pesa (`/kenya/mpesa-callback/:projectId`) and Afiax Pay (`/kenya/afiax-pay-callback/:projectId`)
callbacks are handled the same way: the result is confirmed with the Daraja STK Push Query API or
the Afiax Pay payment-request API before any update, the amount is never taken from the callback
body, and callbacks for payments already confirmed or failed are ignored.

If SHA is sending a JWT but verification is failing:
1. Confirm `kenyaShaClaimsSecretKey` matches the secret SHA signed the JWT with.
2. Rotate the secret and register the new secret with SHA if needed.
   Follow [credential rotation](01-credential-rotation.md).

---

## Claim state inconsistency

If the claim queue panel shows a state that differs from what SHA reports verbally:

1. Run `$check-national-claim-status` on the Claim to pull the latest SHA state.
2. The local `ClaimResponse` will be updated from the SHA API response.
3. If the SHA API response also doesn't match SHA's verbal statement, escalate to SHA Claims support
   with the `bundleId` and the discrepancy.

The `bundleId` is in `Claim.extension` → Kenya claim submission snapshot → `bundleId`.
It is also shown in the claim queue panel (truncated).
