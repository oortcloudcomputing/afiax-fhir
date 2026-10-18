---
sidebar_position: 1
---

# Self-Hosting vs Cloud

Self-hosting Afiax can be the right choice for certain use cases, but it comes with significant operational considerations that organizations may overlook. This guide helps you evaluate whether self-hosting aligns with your goals and resources.

## When Self-hosting Makes Sense

Self-hosting may be compelling for the following reasons:

**Compliance Requirements**
Your implementation includes data sovereignty or contractual obligations that require on-premises deployment, such as EU regulations or US federal government work. 

**Low connectivity environments**
Your project has limited data storage / bandwidth requirements and operates in a low-connectivity environment. You might need to run a FHIR server on a medical device you are developing, or on a small machine for a rural clinic, and a lightweight Afiax instance with minimal interactions is sufficient. 

**Personal Education**
You want to gain experience with self-hosting infrastructure, and your Afiax instance will only be used for personal projects without production requirements.

## Operational Considerations for Self-Hosting

Before choosing self-hosting, it's important to thoroughly assess the ongoing operational responsibilities and resource commitments involved:

**Ongoing Maintenance**
Maintaining any self-hosted system requires dedicated attention to ensure stability and keep up with updates. For Afiax, we recommend designating internal resources to manage ongoing operations and version upgrades, as this proactive approach helps prevent common challenges and ensures you can fully leverage new features.

We estimate that organizations need approximately 0.5 FTE (full-time equivalent) dedicated to maintaining your Afiax instance during normal quarters. During *large-scale maintenance projects* like PostgreSQL version upgrades or major Afiax version upgrades, resource requirements may increase. 

**Operational Responsibilities**
Your team will take on 24/7 on-call responsibility for outages and need to build incident response protocols, implement observability systems, and maintain all the supporting infrastructure that comes with production systems.

## What Afiax Hosting Provides

**Managed Operations**
Afiax handles all system maintenance, security updates, and infrastructure scaling so your team can focus on building your healthcare application.

**Data kept in Kenya**
Afiax-hosted facilities run on Afiax's production environment in two Kenyan data centres, which meets the Kenyan data-residency requirements without you running servers yourself.

## Already Self-hosting at Scale?

If you're a current self-hosting user that would like to transition to cloud hosting, we're here to help!

**Need assistance?** Contact the Afiax team ([support@afiax.africa](mailto:support@afiax.africa)) with any questions.