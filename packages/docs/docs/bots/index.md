---
sidebar_position: 0
---

# Bots

Afiax bots are functions that execute when triggered. They are similar to serverless functions, and in Afiax we make them easy to write and deploy and trigger with [FHIR Subscriptions](/docs/subscriptions). For the purpose of the tutorials found in this section, it's important to understand that **Bots drive many of the major integrations that you see in Afiax**.

If you are new to Afiax Bots, we encourage you to read the intro material in the [**Bot Guide**](/docs/bots/bot-basics).

The following tutorials will walk through some of the use cases for Bots, to give you a sense of how they can work for you.

:::warning Enabling Bots

Bots are a [project level setting](/docs/access/projects#settings) that must be enabled by a Super Admin user.

For users on the [Afiax Hosted Service](/pricing), bots are a paid features. Contact info@afiax.africa to have Bots enabled on your project.

Super administrators can enable bots via the Afiax App:

- Navigate to https://app.your-medplum-domain.com/Project/:projectId
- Click on the "Edit" tab
- In the "Features" section, add an entry with the value "bots"

:::

## Getting Started
Learn the fundamentals of building and testing bots before deploying them to production.
- [Bot Basics](/docs/bots/bot-basics)
- [Unit Testing Bots](/docs/bots/unit-testing-bots)
- [Running Bots Locally](/docs/bots/running-bots-locally)

## Bot Triggers & Invocation
Configure how and when your bots execute, from scheduled tasks to real-time event responses.
- [Cron Jobs for Bots](/docs/bots/bot-cron-job)
- [Consuming Webhooks](/docs/bots/consuming-webhooks)
- [Bot for QuestionnaireResponse](/docs/bots/bot-for-questionnaire-response)
- [Custom FHIR Operations](/docs/bots/custom-fhir-operations)

## Common Use Cases & Patterns
Implement frequently-needed functionality like file handling, document generation, and data transformation.
- [Uploading Files](/docs/bots/file-uploads)
- [Create a PDF](/docs/bots/creating-a-pdf)
- [HL7 to FHIR](/docs/bots/hl7-into-fhir)

## Deployment
Bots run on [Afiax Cloud](/docs/afiax-cloud), next to your data, in Kenya. Oortcloud enables Bots per project; ask the [Afiax Helpdesk](/docs/afiax-cloud/support-and-sla) to switch them on. Develop and test in UAT before deploying to production (see [Environments and partner access](/docs/afiax-cloud/environments-and-access)).
- [Bots in Production](/docs/bots/bots-in-production)

## Security & Permissions
Manage sensitive credentials and control what actions your bots can perform.
- [Bot Secrets](/docs/bots/bot-secrets)
- [Run as User](/docs/bots/bot-run-as-user)

## Monitoring & Operations
Track bot performance and troubleshoot issues in production environments.
- [Monitoring Bots](/docs/bots/monitoring-bots)

## Reference

- [Demo Bots Repository](https://github.com/medplum/medplum-demo-bots) on Github
- [Bot Features and Fixes](https://github.com/oortcloudcomputing/afiax-fhir/pulls?q=is%3Apr+label%3Abots) on Github
