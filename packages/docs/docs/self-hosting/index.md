---
sidebar_position: 1
---

# Self-hosting Afiax

Afiax is an open source healthcare development platform that you can deploy in your own environment. This guide provides detailed instructions for self-hosting Afiax across various infrastructure options.

These guides are designed for DevOps engineers and system administrators who have experience managing production healthcare systems.

:::info How Afiax production is deployed

**Afiax's own environments do not use the guides below.** Afiax production runs on bare-metal servers in two Kenyan data centres, deployed with Talos Linux, Kubernetes and ArgoCD from the [afiax-platform-engineering](https://github.com/oortcloudcomputing/afiax-platform-engineering) repository. Its *Environments and Server Requirements* page lists the hardware for local dev, dev, UAT and production.

The guides below install the **upstream open-source build** that Afiax is based on, so package and image names such as `medplum`, `apt.medplum.com` and `medplum/medplum-server` are upstream names. Those builds do **not** include Afiax additions such as the Kenya country pack. Use them for learning or for non-Afiax deployments only. Health data about Kenyan patients must stay in Kenya, so don't use the AWS, GCP or Azure guides for production.

:::

:::warning Considerations
Thinking about self-hosting? Take a look at our [self-hosting vs. cloud guide](./considerations.md) to help you decide if self-hosting is for you.
:::

## Installation Options

### [Install on AWS](/docs/self-hosting/install-on-aws) (Recommended)

Deploy Afiax on Amazon Web Services using the upstream AWS CDK and CloudFormation templates. This deployment option provides enterprise-grade scalability with automated setup of VPCs, ECS clusters, load balancers, and other critical infrastructure components.

### [Install on Ubuntu](/docs/self-hosting/install-on-ubuntu)

Deploy Afiax directly on Ubuntu servers using the upstream APT repository ([apt.medplum.com](https://apt.medplum.com/)). This production-ready configuration offers a streamlined installation process while maintaining full control over your infrastructure.

### [Install on GCP](/docs/self-hosting/install-on-gcp) (Beta)

Deploy Afiax on Google Cloud Platform using our Terraform configurations. Validated for production use, this deployment option provides a robust foundation, but offers a less-automated setup and requires additional operational expertise.

### [Install on Azure](/docs/self-hosting/install-on-azure) (Beta)

Deploy Afiax on Azure using our Terraform configurations. Validated for production use, this deployment option provides a robust foundation, but offers a less-automated setup and requires additional operational expertise.

### [Install from Scratch](/docs/self-hosting/install-from-scratch)

Learn how to build and deploy Afiax from source code on bare metal infrastructure. This option provides an in-depth understanding of Afiax's architecture and components, making it ideal for educational purposes or custom deployments.

## Additional Resources

- Explore [self-hosting articles](https://www.medplum.com/blog/tags/self-host) on the upstream Medplum blog
- Track [self-hosting features and improvements](https://github.com/oortcloudcomputing/afiax-fhir/pulls?q=is%3Apr+label%3Aself-host) on GitHub
