---
sidebar_position: 4
---

# Operations and Responsibilities

Afiax Cloud is a managed service: Oortcloud operates the platform, and you operate your facility. This page sets out who does what, and how the platform is kept running, updated and protected.

## Who does what

| Area | Oortcloud | Your organisation |
| --- | --- | --- |
| Servers, databases, storage, network in the data centres | ✓ | |
| Backups, disaster recovery and data residency in Kenya | ✓ | |
| Security monitoring, patching and audit logging | ✓ | |
| Upgrades and new releases, including Kenya country pack updates (SHA tariffs, KHIS and HIE changes) | ✓ | |
| Maintaining the connections to SHA, the HIE, KNHTS, KHIS, M-Pesa and the professional registries | ✓ | |
| Platform configuration (server settings, integrations, email delivery) | ✓ | |
| Deciding who gets an account and which role they have | | ✓ (Oortcloud creates the accounts on your request) |
| Recording patient consent and using the system correctly | | ✓ |
| Facility network, Wi-Fi, computers and browsers | | ✓ |
| First-line support through your Training Champions | | ✓ |

## Updates and releases

- Oortcloud releases updates through a controlled pipeline. Every change is reviewed, tested in UAT, and then promoted to production. Nobody changes production servers by hand.
- **Routine updates** happen in the weekly maintenance window (Sunday 02:00–06:00 EAT), with at least 72 hours' notice.
- **Major releases** are announced two weeks ahead, with release notes.
- **Critical security patches** (CVSS 9.0 or higher) are applied within 24 hours, with as much notice as possible.

Your integrations should handle releases without changes: the FHIR API is versioned (R4), and breaking changes are announced in the release notes well in advance.

## Backups and disaster recovery

- Databases are replicated within the Nairobi data centre, so the loss of one database server does not interrupt service.
- Encrypted backups are stored in Kenya.
- The second Kenyan data centre keeps a continuously updated standby copy. If the Nairobi site is lost, service moves there, with a target of **4 hours to restore service** (RTO) and **at most 5 minutes of data lost** (RPO).

## Data residency and security

All identifiable health data stays in Kenya. Audit records are kept for 20 years in write-once storage. For the controls in detail, see [Security](/security) and [Compliance](/docs/compliance).

## Changing settings

On Afiax Cloud, platform-level settings (email delivery, integrations, server configuration) are managed by Oortcloud. Project administrators can manage their own users, access policies and some project settings in the web app. For anything else, raise a request with the [Afiax Helpdesk](./support-and-sla).
