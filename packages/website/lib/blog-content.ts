// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { HeroArtworkVariant } from './hero-artwork';

export interface BlogSection {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
}

export interface BlogPost {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly category: string;
  readonly date: string;
  readonly readingTime: string;
  readonly author: string;
  readonly heroTitle: string;
  readonly artwork: HeroArtworkVariant;
  readonly tags: readonly string[];
  readonly sections: readonly BlogSection[];
}

export const blogPosts: readonly BlogPost[] = [
  {
    slug: 'why-afiax-builds-on-open-fhir',
    title: 'Why Afiax Builds on an Open FHIR Core for Pan-African Digital Health',
    excerpt:
      'Afiax is structured around a canonical FHIR foundation so products, country integrations, and managed services can scale without creating parallel truths.',
    category: 'Platform',
    date: '2026-03-18',
    readingTime: '8 min read',
    author: 'Afiax Editorial',
    heroTitle: 'Open architecture creates a stronger long-term health platform.',
    artwork: 'platform',
    tags: ['FHIR', 'Interoperability', 'Architecture'],
    sections: [
      {
        heading: 'Start with the record, not the interface',
        paragraphs: [
          'Many health systems inherit a software estate where each interface, form, and integration creates its own operational truth. Afiax is being shaped in the opposite direction. The platform starts with a canonical FHIR record and then lets applications, devices, and national integrations work around that core.',
          'That matters because a pan-African health platform cannot afford to rebuild its data model each time a new market, payer rail, or facility group comes on board. The core has to remain stable enough to hold clinical, operational, and reimbursement meaning across environments.',
        ],
      },
      {
        heading: 'Country adaptation belongs in explicit boundaries',
        paragraphs: [
          'Afiax uses country packs so registry workflows, terminology mappings, claims rails, and compliance-specific integrations can evolve without distorting the shared platform semantics.',
          'This keeps Kenya-specific execution practical while preserving a platform shape that supports additional countries through the same operating model.',
        ],
        bullets: [
          'Canonical clinical record remains shared',
          'Jurisdictional behavior is isolated into pack-aware services',
          'Write-back returns normalized outcomes into FHIR resources and evidence trails',
        ],
      },
      {
        heading: 'Open foundations strengthen managed delivery',
        paragraphs: [
          'An open platform is not only a technical preference. It improves migration, training, analytics, auditability, and long-term resilience. Customers can understand where their data lives, how workflows are represented, and how connected products stay coordinated.',
          'That is why Afiax positions openness and managed delivery together. The same discipline that makes the platform interoperable also makes rollout and support more credible.',
        ],
      },
    ],
  },
  {
    slug: 'from-openmrs-to-afiax-migration-playbook',
    title: 'From OpenMRS, KenyaEMR, and Tiberbu to Afiax: A Practical Migration Playbook',
    excerpt:
      'Migration is not a single import. It is an operating program covering extraction, mapping, validation, device readiness, training, and controlled cutover.',
    category: 'Migration',
    date: '2026-03-14',
    readingTime: '9 min read',
    author: 'Afiax Delivery',
    heroTitle: 'Migration succeeds when data, workflow, and rollout move together.',
    artwork: 'migration',
    tags: ['Migration', 'OpenMRS', 'KenyaEMR', 'Tiberbu'],
    sections: [
      {
        heading: 'Legacy migration is a business operation, not a script',
        paragraphs: [
          'Every legacy EHR estate carries its own assumptions about identifiers, visits, concepts, forms, and downstream reporting. Afiax treats migration as a full delivery track so data mapping, reconciliation, training, and device rollout stay synchronized.',
          'That approach matters especially in environments where OpenMRS variants, KenyaEMR-derived deployments, Tiberbu, and spreadsheet-driven side systems all coexist at the same time.',
        ],
      },
      {
        heading: 'Three migration layers should stay visible',
        paragraphs: [
          'The first layer is data extraction and profiling. The second is mapping into the Afiax canonical model. The third is operational cutover, where clinicians and administrators move from old working habits to the new system with controlled support.',
        ],
        bullets: [
          'Extract and profile identifiers, encounters, orders, claims, and attachments',
          'Map concepts and forms into the governed Afiax FHIR structure',
          'Validate clinically significant records before go-live',
          'Pair cutover with tablets, workstations, and role-based training',
        ],
      },
      {
        heading: 'The goal is confidence, not just completeness',
        paragraphs: [
          'A migration program should give leaders confidence that the new record is trustworthy, that staff can operate safely, and that reimbursement and interoperability do not break during transition.',
          'That is why Afiax connects migration planning to the get-started workflow, commercial packaging, device enablement, and managed post-go-live support.',
        ],
      },
    ],
  },
  {
    slug: 'managed-digital-health-services-that-actually-launch',
    title: 'Managed Digital Health Services That Actually Help Organizations Launch',
    excerpt:
      'Managed services should do more than monitor servers. They should help customers move from commercial intake to stable care operations with support, devices, and continuity controls.',
    category: 'Managed Services',
    date: '2026-03-10',
    readingTime: '7 min read',
    author: 'Afiax Operations',
    heroTitle: 'Managed digital health services should feel like part of the operating team.',
    artwork: 'company',
    tags: ['Managed Services', 'Support', 'Cloud Operations'],
    sections: [
      {
        heading: 'Support has to start before go-live',
        paragraphs: [
          'In healthcare, the most expensive support failures often begin before a platform is even live. Unclear ownership, weak rollout planning, poor device preparation, and incomplete migration controls all create downstream instability.',
          'Afiax frames managed digital health services as an execution layer that starts with onboarding and continues through launch, monitoring, and continuity support.',
        ],
      },
      {
        heading: 'Managed services should include the real environment',
        paragraphs: [
          'That means software, cloud, devices, field operations, training, and customer coordination should be treated as one service story. A tablet that is not configured, a display that never gets mounted, or a workflow that is not trained becomes an operations problem immediately.',
        ],
        bullets: [
          'Role-based device preparation and activation kits',
          'Monitoring, support windows, and continuity controls',
          'Operational dashboards for service review and exception handling',
        ],
      },
      {
        heading: 'Commercial clarity strengthens delivery',
        paragraphs: [
          'When pricing, ERPNext billing, and service packaging are aligned, the delivery team spends less time reinterpreting what was sold. That makes implementation cleaner and gives customers a more predictable onboarding experience.',
        ],
      },
    ],
  },
  {
    slug: 'devices-that-make-digital-health-visible',
    title: 'The Devices That Make Digital Health Visible Across the Care Environment',
    excerpt:
      'A digital health platform becomes real when it lands well on a phone, a consultation tablet, a nurse-station display, and a diagnostic console.',
    category: 'Devices',
    date: '2026-03-05',
    readingTime: '6 min read',
    author: 'Afiax Device Enablement',
    heroTitle: 'The device layer turns software into an operating environment.',
    artwork: 'devices',
    tags: ['Devices', 'Clinical UX', 'Rollout'],
    sections: [
      {
        heading: 'Healthcare software is always experienced through hardware',
        paragraphs: [
          'A care platform is never used in abstraction. It is experienced through the speed of a consultation tablet, the visibility of a nurse-station display, the portability of a clinician phone, and the clarity of a diagnostic workstation.',
          'That is why Afiax treats device enablement as part of the platform program rather than an optional accessory discussion.',
        ],
      },
      {
        heading: 'Different environments need different device patterns',
        paragraphs: [
          'A mobile care kit is not the same as an inpatient bedside setup, and neither is the same as a command center display. Each device family should reinforce the workflow it is serving.',
        ],
        bullets: [
          'Phone kits for community outreach, alerts, and tele-health coordination',
          'Tablet kits for consultation, intake, and ward documentation',
          'Display programs for operations visibility and executive review',
          'Diagnostic stations for imaging-heavy workflows',
        ],
      },
      {
        heading: 'Managed PaaS becomes more tangible with hardware included',
        paragraphs: [
          'Bundled tablets, displays, and launch accessories help customers move faster into live operations. They also give the Afiax public site a more credible commercial story because the platform is shown as a working environment rather than only a subscription plan.',
        ],
      },
    ],
  },
  {
    slug: 'country-packs-and-national-scale-interoperability',
    title: 'Country Packs and National-Scale Interoperability Without Core Drift',
    excerpt:
      'Country packs let Afiax adapt to registries, terminology, claims, and exchange boundaries without compromising the shared clinical and operational model.',
    category: 'Interoperability',
    date: '2026-02-28',
    readingTime: '8 min read',
    author: 'Afiax Interoperability',
    heroTitle: 'National adaptation works best when the platform boundary stays clear.',
    artwork: 'country-packs',
    tags: ['Country Packs', 'Registries', 'Claims', 'National Programs'],
    sections: [
      {
        heading: 'National scale requires discipline',
        paragraphs: [
          'As digital health platforms expand, the temptation is to let every regulator, payer, or facility requirement reshape the platform itself. That approach rarely scales well. Afiax uses country packs so the national layer stays visible and governable.',
        ],
      },
      {
        heading: 'The core still owns the clinical meaning',
        paragraphs: [
          'Even when a registry connector, payer workflow, or terminology mapping is country-specific, the canonical record should still own the clinical and operational meaning. That lets reporting, analytics, devices, and applications stay coherent across environments.',
        ],
        bullets: [
          'Registries and claims rails are mapped through explicit connectors',
          'Country terminology and code rules are handled as overlays',
          'Normalized outcomes are written back into the shared evidence model',
        ],
      },
      {
        heading: 'Pan-African design needs local execution credibility',
        paragraphs: [
          'Kenya is one operational reference market, but the wider architectural point is regional. Country-aware execution is strongest when one market runs deeply and then generalizes through disciplined contracts rather than through vague ambition.',
        ],
      },
    ],
  },
  {
    slug: 'why-a-better-healthcare-website-matters',
    title: 'Why a Better Healthcare Website Matters for Enterprise Trust',
    excerpt:
      'A public website should not read like a template. It should show product truth, operating scope, device reality, and commercial discipline clearly enough to earn trust.',
    category: 'Brand',
    date: '2026-02-21',
    readingTime: '5 min read',
    author: 'Afiax Editorial',
    heroTitle: 'The public web layer should feel as disciplined as the platform behind it.',
    artwork: 'blog',
    tags: ['Brand', 'Corporate Site', 'Enterprise UX'],
    sections: [
      {
        heading: 'Trust starts before a demo',
        paragraphs: [
          'Enterprise healthcare buyers judge the seriousness of a platform long before they see an implementation plan. They look at language, structure, pricing clarity, delivery posture, and whether the public site feels like a real operating company or a generic template.',
        ],
      },
      {
        heading: 'Digital health deserves a more physical visual language',
        paragraphs: [
          'A modern healthcare site should not only describe products. It should show how the platform appears across screens, devices, workstations, and clinical environments. That makes the commercial and operating story easier to trust.',
        ],
        bullets: [
          'Header imagery should reflect the page purpose',
          'Product and device pricing should stay easy to follow',
          'Editorial content should reinforce the platform story rather than distract from it',
        ],
      },
      {
        heading: 'Brand and architecture should tell the same story',
        paragraphs: [
          'When the website, onboarding flow, ERPNext handoff, pricing model, and product catalog all align, the customer sees a coherent company. That coherence is what the Afiax website is designed to deliver.',
        ],
      },
    ],
  },
];

export const featuredBlogPosts = blogPosts.slice(0, 3);

export function getBlogPostBySlug(slug: string): BlogPost | undefined {
  return blogPosts.find((post) => post.slug === slug);
}
