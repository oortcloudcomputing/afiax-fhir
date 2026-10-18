---
sidebar_position: 5
---

# Support and Service Levels

This page summarises how to get help on Afiax Cloud and what service levels Oortcloud commits to. The binding terms, including service credits, are in the support SLA that is part of your service agreement.

## How to get help

Start at the top of this list, and move down when you need to:

1. **Help yourself.** Use this documentation, the in-app help, and the status page at [status.afiax.africa](https://status.afiax.africa) for outages and planned maintenance.
2. **Ask your Training Champion or facility IT officer.** They handle logins, password resets, devices and how-to questions.
3. **Contact the Afiax Helpdesk.** Raise anything they cannot solve, such as errors, integration problems (SHA, HIE) or slow performance.

| Channel | Use it for | Hours |
| --- | --- | --- |
| Helpdesk portal: [helpdesk.afiax.africa](https://helpdesk.afiax.africa) | Raising and tracking any issue | Portal 24/7; staffed Mon–Fri 08:00–18:00 EAT |
| Email: [support@afiax.africa](mailto:support@afiax.africa) | P2, P3 and P4 issues | Mon–Fri 08:00–18:00 EAT |
| Phone: +254 738 000 145, option 1 | **P1 critical incidents only** | 24/7/365 |
| Phone: +254 738 000 145, option 2 | P2 incidents affecting patient care, out of hours | Evenings, weekends and public holidays |
| Email: [security@afiax.africa](mailto:security@afiax.africa) | Suspected security incidents or data breaches | 24/7 |

## Priorities and response times

| Priority | What it means | Example | First response | Target resolution |
| --- | --- | --- | --- | --- |
| **P1 Critical** | Afiax unavailable for one or more facilities, or a suspected data breach | No one can sign in; patient records cannot be opened | 15 minutes, 24/7 | 4 hours (8 for complex software defects) |
| **P2 High** | A major function is down or very slow, affecting care | Lab results not appearing; SHA claims failing | 1 hour (2 out of hours) | 8 business hours |
| **P3 Medium** | Partial problem, care not directly affected | A report fails; one user cannot sign in | 4 business hours | 3 business days |
| **P4 Low** | Cosmetic issue, question or feature request | A label is misaligned | 1 business day | 10 business days, or the next release |

Business hours are Monday to Friday, 08:00–18:00 EAT, excluding Kenyan public holidays. P1 and P2 issues are covered around the clock.

## Availability targets

| Service | Monthly availability target |
| --- | --- |
| Afiax FHIR API and the web app | 99.5% |
| Afiax IAM (sign-in) | 99.9% |
| SHA and HIE connections | 99.0% (excludes outages of the government systems themselves) |
| KHIS reporting connection | 98.0% |

Planned maintenance is not counted as downtime. You receive a monthly service report with the achieved availability, incidents and changes.

## Maintenance windows

| Type | When | Notice |
| --- | --- | --- |
| Routine maintenance | Sundays 02:00–06:00 EAT | 72 hours |
| Major release | An agreed weekend night | 2 weeks |
| Critical security patch | Any time, only for CVSS 9.0+ or active exploitation | At least 1 hour |

## What support does not cover

- Your facility's network, Wi-Fi, computers and other on-site equipment.
- Outages of government systems (SHA, HIE, KHIS). Afiax keeps working where it can, and we tell you about known outages.
- New features or custom development beyond your contract. These are quoted separately.
