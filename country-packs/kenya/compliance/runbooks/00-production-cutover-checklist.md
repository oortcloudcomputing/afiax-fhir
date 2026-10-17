# Kenya Production Cutover Checklist

Run this checklist in full before declaring a Kenya tenant production-ready.
Each section maps to a runbook in this directory.

The automated verification script `scripts/kenya-preflight.sh` checks the
machine-testable items. Human verification items are marked **[HUMAN]**.

---

## 1. Infrastructure prerequisites

- [ ] Kubernetes cluster is healthy (`kubectl get nodes`)
- [ ] Medplum server pods are running with the correct image tag
- [ ] PostgreSQL replication is healthy (primary + at least one replica)
- [ ] Redis (BullMQ) is reachable from the server pods
- [ ] Kafka `audit.events` topic exists, retention is `log.retention.ms=-1`
- [ ] OpenSearch WORM index policy is applied
- [ ] Vault is unsealed and all expected secrets are present
- [ ] Ingress TLS certificate is valid for the production domain
- [ ] DNS A/CNAME records point to the production ingress IP

---

## 2. Project setup

- [ ] Project exists in Medplum with the correct name and slug
- [ ] `countryPack = kenya` is set in `Project.setting`
- [ ] `kenyaHieEnvironment = production` (confirm — not `uat`)
- [ ] `kenyaHieCredentialMode` matches how credentials are stored
- [ ] `kenyaShaClaimsEnvironment = production` (confirm — not `uat`)
- [ ] `kenyaShaClaimsCredentialMode` matches how credentials are stored
- [ ] `kenyaHieAgentId` is set to the production AfyaLink agent ID
- [ ] `kenyaClaimSubmitWorkflowBotId` is set if enterprise workflow handoff is required
- [ ] `kenyaClaimStatusWorkflowBotId` is set if enterprise workflow handoff is required
- [ ] `features` array includes `cron` (required for KHIS scheduler)

---

## 3. Credentials

### AfyaLink HIE (DHA)

- [ ] `kenyaAfyaLinkConsumerKey` is set in the correct secret surface
- [ ] `kenyaAfyaLinkUsername` is set
- [ ] `kenyaAfyaLinkPassword` is set
- [ ] **[HUMAN]** Credentials have been rotated from UAT values
- [ ] HIE `Test Connection` in `/admin/country-pack` returns success

### Kenya SHA Claims

- [ ] `kenyaShaClaimsAccessKey` is set in the correct secret surface
- [ ] `kenyaShaClaimsSecretKey` is set
- [ ] `kenyaShaClaimsCallbackUrl` is set to `https://<production-host>/kenya/sha-callback/<projectId>`
- [ ] **[HUMAN]** SHA credentials are the production keys from SHA Claims portal
- [ ] **[HUMAN]** The callback URL has been registered in the SHA Claims portal

---

## 4. First facility onboarding

- [ ] At least one `Organization` exists with a Kenya MFL code
- [ ] Facility lookup returned a registry snapshot (DHA lookup ran successfully)
- [ ] Facility is verified (`$verify-facility-authority` status is `verified`)
- [ ] At least one `Practitioner` exists with a Kenya identifier
- [ ] Practitioner is verified (`$verify-practitioner-authority` status is `verified`)

---

## 5. KHIS weekly scheduler

- [ ] `provision-khis-scheduler` was called and succeeded
- [ ] `kenyaKhisSchedulerBotId` is set in project settings
- [ ] Bot resource exists at the stored ID
- [ ] Bot `cronString` is `0 3 * * 1` (Monday 03:00 UTC = 06:00 EAT)
- [ ] **[HUMAN]** DHIS2 credentials are set if KHIS export targets a live DHIS2 instance

---

## 6. SHA callback

- [ ] Public route `POST /kenya/sha-callback/<projectId>` returns 200 for a test payload
- [ ] `kenyaShaClaimsSecretKey` is present (used for JWT verification)
- [ ] **[HUMAN]** SHA has confirmed the callback URL is registered and test pings succeed

---

## 7. Security and access controls

- [ ] **[HUMAN]** At least one admin user account is active with MFA enabled
- [ ] **[HUMAN]** Clinical staff accounts have appropriate SMART scopes
- [ ] **[HUMAN]** AuditEvent Delete returns HTTP 405 (tamper-proof audit log confirmed)
- [ ] **[HUMAN]** Break-glass flow tested end-to-end: `$break-glass` → Flag created → access granted → AuditEvent with `ETREAT`
- [ ] Security label enforcement tested: `Confidentiality R` patient blocked from non-break-glass user

---

## 8. Claim workflow smoke test

Run against a test patient before declaring production-ready:

- [ ] Create a test `Patient` with a real national ID (can use UAT environment)
- [ ] Run `$resolve-patient-identity` — verify DHA returns the patient
- [ ] Create `Coverage` and run `$check-coverage` — verify eligibility returns
- [ ] Create `Claim` with Patient + Coverage + Organization + Practitioner
- [ ] Run `$submit-national-claim` — verify bundle is prepared (or submitted if production SHA creds are active)
- [ ] Run `$check-national-claim-status` — verify status snapshot is written
- [ ] Run `Patient/$publish-national-record` — verify SHR publication snapshot is written

---

## 9. Audit trail smoke test

- [ ] Read any FHIR resource and confirm an `AuditEvent` was created with `action = R`
- [ ] Run a FHIR operation and confirm an `AuditEvent` with `action = E` and `subtype.code = operation`
- [ ] Confirm `AuditEvent.source.observer` is set to the production base URL
- [ ] **[HUMAN]** DPO has read access to AuditEvents; clinical staff cannot read AuditEvents

---

## 10. Rollback

Before cutting over, confirm the rollback procedure is rehearsed:

- [ ] **[HUMAN]** Previous environment (UAT or pre-production) can be restored within 30 minutes
- [ ] **[HUMAN]** DNS TTL has been lowered to 60 seconds at least 24 hours before cutover
- [ ] **[HUMAN]** Database point-in-time recovery has been tested within the last 30 days
- [ ] **[HUMAN]** Rollback owner is identified and reachable during the cutover window

---

## Sign-off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Engineering Lead | | | |
| DPO | | | |
| CTO | | | |

**Cutover approved:** ☐ Yes ☐ No
