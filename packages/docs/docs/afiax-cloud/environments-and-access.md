---
sidebar_position: 3
---

# Environments and Partner Access

This page is for developers at partner organisations and facilities who connect their own software to Afiax: a laboratory system, a mobile app, a reporting tool or an insurer. Oortcloud issues and controls every credential. There is no self-service sign-up.

## The two environments

| | UAT (integration testing) | Production |
| --- | --- | --- |
| **FHIR API base URL** | `https://fhir.uat.afiax.africa/fhir/R4/` | `https://fhir.afiax.africa/fhir/R4/` |
| **OAuth2 token endpoint** | `https://fhir.uat.afiax.africa/oauth2/token` | `https://fhir.afiax.africa/oauth2/token` |
| **Web app** | `https://app.uat.afiax.africa` | `https://app.afiax.africa` |
| **Data** | Synthetic only. Never load real patient data. | Real patient data |
| **National systems** | SHA, HIE and KHIS test systems | SHA, HIE and KHIS production systems |
| **Access** | Granted for integration development | Granted only after your integration passes testing in UAT |

## How to get access

1. **Request a UAT client.** Email [support@afiax.africa](mailto:support@afiax.africa) with:
   - your organisation
   - what you are building
   - the resources you need to read or write (for example, "read Patient and Observation, write DiagnosticReport")
   - the contact person.
2. **Receive your credentials.** Oortcloud creates a *client application* in a UAT project and sends you its **client ID**, and its **client secret** through a secure channel. Its [access policy](/docs/access/access-policies) allows only what you asked for.
3. **Get a token and call the API.** Use the OAuth2 client-credentials flow:

   ```bash
   curl -s -X POST https://fhir.uat.afiax.africa/oauth2/token \
     -d grant_type=client_credentials \
     -d client_id=$CLIENT_ID \
     -d client_secret=$CLIENT_SECRET
   ```

   Then send the returned `access_token` as `Authorization: Bearer <token>` on each request. See [Client credentials](/docs/auth/client-credentials).
4. **Test.** Build and test against UAT with synthetic data. The [TypeScript SDK](/docs/sdk/core), [Bots](/docs/bots) and [CLI](/docs/cli) all work against UAT.
5. **Go to production.** When your integration works in UAT, ask for production access. Oortcloud reviews the integration, the data it touches and its access policy, then issues production credentials scoped to the facilities that have agreed to use it.

## Rules for partners

- **Least privilege.** Ask only for the resources you need. Access policies are enforced on every request.
- **Every call is audited.** All reads and writes create an audit record, kept for 20 years.
- **No real data outside production.** Never copy production data into UAT or your own test systems.
- **Data stays in Kenya.** If your system stores identifiable patient data it receives from Afiax, it must also keep that data in Kenya.
- **Keep secrets safe.** Store client secrets in a secrets manager, never in code. If one leaks, email [security@afiax.africa](mailto:security@afiax.africa) at once and we will rotate it.

## Rate limits

API requests are rate limited per client. See [Rate limits](/docs/rate-limits). If you need higher limits for a bulk job, ask support before you run it.
