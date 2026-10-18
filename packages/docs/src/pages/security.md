---
id: security
slug: /security
---

# Security

Afiax Clinical Suite holds patient health records, so security is designed into every layer, from the data centre to the browser. This page describes the controls in plain language. The detailed specifications (Encryption Implementation Specification, Audit Trail Specification, Incident Response Plan, Backup and Disaster Recovery plans) are available on request from [security@afiax.africa](mailto:security@afiax.africa).

## Where your data lives

- **In Kenya only.** Production runs on servers we control in two Liquid Intelligent Technologies data centres in Kenya: Nairobi, plus a second Kenyan site for disaster recovery. Identifiable health data is never processed outside Kenya.
- **No real data in test systems.** Development and testing environments use synthetic (made-up) data only.
- **Hardened servers.** Servers run Talos Linux, an operating system built only to run Kubernetes. It has no shell and no SSH, so nobody can log in to a server and change it by hand. Every change goes through code review and GitOps (ArgoCD).
- **Encrypted disks.** Disk encryption keys are sealed to each server's TPM 2.0 chip.

## Signing in

- Every user has a personal account. Shared logins are not allowed.
- Sign-in is handled by Zitadel (OpenID Connect) with **mandatory multi-factor authentication**.
- Password and session rules: passwords of at least 12 characters, a 90-day maximum password age, lockout after 5 failed attempts, and automatic sign-out after 30 minutes of inactivity.

## Who can see what

- Access is role-based: each user sees only what their job requires, enforced on every API request.
- Data is separated per facility and project, with row-level security in the database.
- **Break-glass access** for emergencies requires a written justification and is flagged for review.

## Encryption

- **In transit:** TLS 1.2 or newer for all traffic into the platform. Traffic between internal services is encrypted with mutual TLS (Istio ambient mesh).
- **At rest:** AES-256 for databases, object storage and backups. Particularly sensitive fields also get field-level encryption.
- **Secrets:** passwords, keys and tokens are kept in HashiCorp Vault and never stored in source code.

## Audit and monitoring

- Every read, change, search, sign-in and administrative action creates an audit record (a FHIR `AuditEvent`).
- Audit records stream through Kafka into OpenSearch and are kept for **20 years** in write-once storage, as required by the Digital Health Regulations 2025.
- Runtime threat detection (Falco) and security event management (Wazuh) watch for suspicious activity. Certificate-expiry and security alerts go to the on-call team.

## Backups and recovery

- Encrypted backups are stored in Kenya.
- The disaster-recovery site keeps a continuously updated standby copy of the databases, and takes over if the Nairobi site is lost.

## Reporting a security issue

If you think you have found a vulnerability in Afiax, email [security@afiax.africa](mailto:security@afiax.africa) with:

- the steps to reproduce it
- what you expected to happen, and what actually happened.

Please do not access or change other people's data while testing, and give us a reasonable time to fix the issue before you make it public. We will acknowledge your report and keep you updated until it is resolved.
