// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
export type DeliveryState = 'platform' | 'market' | 'enterprise';

export interface Highlight {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}

export interface Capability {
  readonly state: DeliveryState;
  readonly title: string;
  readonly summary: string;
  readonly detail: string;
}

export interface Layer {
  readonly name: string;
  readonly summary: string;
  readonly responsibility: string;
}

export interface Principle {
  readonly title: string;
  readonly body: string;
}

export interface Audience {
  readonly title: string;
  readonly summary: string;
}

export interface Metric {
  readonly label: string;
  readonly value: string;
}

export interface LinkCard {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
  readonly href: string;
  readonly cta: string;
}

export interface DetailEntry {
  readonly term: string;
  readonly description: string;
}

export interface DeveloperAsset {
  readonly state: DeliveryState;
  readonly title: string;
  readonly summary: string;
  readonly detail: string;
  readonly href: string;
  readonly cta: string;
}

export const heroHighlights: Highlight[] = [
  {
    eyebrow: 'Clinical applications',
    title: 'Support holistic patient care',
    body: 'Our clinical applications help practitioners deliver knowledge-driven care informed by data from EHRs and across the continuum to improve the quality of care, help drive revenue, and boost clinical and operational efficiency.',
  },
  {
    eyebrow: 'Revenue cycle management',
    title: 'Integrate your revenue cycle from registration through bill collection.',
    body: 'Leverage intelligent automation and generative AI to drive optimal financial performance.',
  },
  {
    eyebrow: 'Interoperability',
    title: 'Interoperability solutions for Open, connected ecosystems',
    body: 'Enable collaborative third-party relationships and seamless data exchange. Equip providers with comprehensive patient information while giving developers the tools and training to focus on advancing healthcare innovation.',
  },
];

export const audienceSegments: Audience[] = [
  {
    title: 'Provider networks',
    summary:
      'Coordinate clinical workflows, national interoperability, and reimbursement evidence without splitting operations across disconnected systems.',
  },
  {
    title: 'Public-sector programs',
    summary:
      'Support country-aware interoperability, registry workflows, and deployment choices that respect national operating constraints.',
  },
  {
    title: 'Payers and scheme operators',
    summary:
      'Connect eligibility, claims, and adjudication-facing workflows to the same canonical care and reimbursement record.',
  },
  {
    title: 'Digital health builders',
    summary:
      'Launch provider, patient, partner, and operational products on a reusable pan-African data and workflow foundation.',
  },
];

export const homepageMetrics: Metric[] = [
  {
    label: 'Trusted by hospitals',
    value: 'Hospitals around the world trust Afiax digital Health Solutions',
  },
  {
    label: 'Enterprise suite',
    value: 'Full suite of integrated solutions to manage all aspects of your Healthcare Enterprise.',
  },
  {
    label: 'AI across the platform',
    value: 'Embedded AI across infrastructure, data, and solutions helps organizations enhance care, alleviate administrative burden, and scale innovation—without added complexity.',
  },
  {
    label: 'Uptime guarantee',
    value: 'Uptime Guarantee for all products backed by a SLA',
  },
];

export const platformLayers: Layer[] = [
  {
    name: 'Afiax FHIR core',
    summary: 'Canonical resources, access control, workflow evidence, bots, and generic internal operations.',
    responsibility: 'Own the editable source of truth for clinical and reimbursement workflows.',
  },
  {
    name: 'Digital products',
    summary: 'Provider, patient, partner, and operational experiences built on the shared model.',
    responsibility: 'Present workflows clearly without bypassing the canonical platform.',
  },
  {
    name: 'Country packs',
    summary: 'National registries, payer connectivity, mappings, terminology, and compliance artifacts.',
    responsibility: 'Bind country requirements to generic platform semantics.',
  },
  {
    name: 'Adjacent enterprise services',
    summary: 'Billing, payments, analytics, AI, and gateway services that operate around the clinical core.',
    responsibility: 'Execute outside the core while writing normalized outcomes back into it.',
  },
];

export const implementationStates: Record<DeliveryState, Capability[]> = {
  platform: [
    {
      state: 'platform',
      title: 'Canonical FHIR platform core',
      summary: 'Afiax FHIR anchors clinical data, reimbursement evidence, access controls, workflow automation, and API-driven exchange.',
      detail: 'The platform model keeps the editable source of truth in a governed clinical core while exposing reusable enterprise interfaces around it.',
    },
    {
      state: 'platform',
      title: 'Pack-aware administration',
      summary: 'Organizations activate country packs, manage secrets, configure onboarding, and govern external rails through curated operational surfaces.',
      detail: 'That keeps national interoperability disciplined without pushing regulator-specific assumptions into the shared core.',
    },
    {
      state: 'platform',
      title: 'Workflow evidence model',
      summary: 'Operational outcomes write back into FHIR resources plus evidence resources such as Task, AuditEvent, CoverageEligibilityResponse, and ClaimResponse.',
      detail: 'The result is a reviewable operational ledger that connects care delivery, payer workflows, and enterprise reporting.',
    },
  ],
  market: [
    {
      state: 'market',
      title: 'Country-pack execution',
      summary: 'Country packs bind registries, claims rails, terminology, and compliance workflows to one consistent platform contract.',
      detail: 'Kenya operates as a reference market within a broader pan-African expansion model, with the same runtime pattern supporting additional jurisdictions.',
    },
    {
      state: 'market',
      title: 'National interoperability services',
      summary: 'Facility verification, practitioner verification, coverage checks, claim submission, shared-record exchange, and related workflows run through governed country-aware services.',
      detail: 'This gives each market a dedicated interoperability surface while preserving a common product and data model.',
    },
    {
      state: 'market',
      title: 'Multi-country operating model',
      summary: 'Afiax supports regional scale by introducing new country packs against the same canonical model, integration patterns, and deployment controls.',
      detail: 'The market strategy expands through repeatable platform adaptation rather than one-off national forks.',
    },
  ],
  enterprise: [
    {
      state: 'enterprise',
      title: 'Managed digital health operations',
      summary: 'Afiax combines onboarding, migration, service operations, security, training, and continuity support into one managed delivery layer.',
      detail: 'Enterprise customers move from commercial intake into implementation, device enablement, and steady-state operations through one coordinated operating model.',
    },
    {
      state: 'enterprise',
      title: 'Enterprise web, pricing, and onboarding surfaces',
      summary: 'The public website, pricing explorer, domain workflow, and ERPNext lead handoff now operate as one commercial front door for the portfolio.',
      detail: 'That gives Afiax a unified corporate, product, and commercial presentation aligned to the wider platform stack.',
    },
    {
      state: 'enterprise',
      title: 'Deployment and sovereignty options',
      summary: 'Afiax Public Cloud, Hybrid, Private Afiax Cloud, and sovereign models all run as managed enterprise delivery options.',
      detail: 'The infrastructure boundary can change without changing how products, country packs, or the clinical data contract behave.',
    },
  ],
};

export const governancePrinciples: Principle[] = [
  {
    title: 'Lead with platform confidence',
    body: 'Public pages should speak as an available enterprise portfolio with integrated applications, country-aware services, and managed operations.',
  },
  {
    title: 'Lead with outcomes, then architecture',
    body: 'The tone should stay enterprise and confident, but product descriptions should start with operational impact for providers, payers, governments, and care teams.',
  },
  {
    title: 'Keep the operating model coherent',
    body: 'Applications, interoperability, analytics, AI, devices, and cloud operations should read as one coordinated enterprise platform rather than adjacent experiments.',
  },
];

export const countryPackPrinciples: Principle[] = [
  {
    title: 'Canonical first',
    body: 'Clinical truth stays in shared FHIR resources. Country payloads are derived artifacts, not the primary record.',
  },
  {
    title: 'Generic operations',
    body: 'Public operation names describe platform meaning, while the active pack supplies regulator- or payer-specific behavior behind the scenes.',
  },
  {
    title: 'No browser-side national calls',
    body: 'Country integrations belong in handlers, connectors, and pack-aware services, not in direct UI calls.',
  },
];

export const deploymentModels = [
  'Afiax Public Cloud',
  'Hybrid',
  'Private Afiax Cloud',
  'Sovereign deployment',
] as const;

export const websiteVoiceRules = [
  'Use enterprise language that is outcome-led, calm, and specific.',
  'Emphasize integrated workflows, operational resilience, coordination, and security without using empty superlatives.',
  'Speak in an enterprise tone where the full Afiax portfolio is available across applications, platform services, and managed operations.',
  'Mirror major health-platform solution marketing in discipline and structure without copying anyone else\'s phrasing.',
] as const;

export const shellSignals: Metric[] = [
  {
    label: 'Enterprise products',
    value: 'Afiax EHR, portals, tele-health, imaging, and platform services',
  },
  {
    label: 'Commercial model',
    value: 'SaaS subscriptions plus managed PaaS and service operations',
  },
  {
    label: 'Operating model',
    value: 'Afiax Public Cloud, Hybrid, Private Afiax Cloud, and sovereign paths',
  },
];

export const homePathways: LinkCard[] = [
  {
    eyebrow: 'Solutions',
    title: 'Explore connected care, interoperability, and revenue operations.',
    body: 'Review the application portfolio for providers, payers, public-sector programs, and partner networks.',
    href: '/solutions',
    cta: 'View solutions',
  },
  {
    eyebrow: 'Platform',
    title: 'See how the health-platform core is structured.',
    body: 'Understand the canonical FHIR foundation, country-pack runtime, and governed enterprise extension model.',
    href: '/platform',
    cta: 'Review platform',
  },
  {
    eyebrow: 'Pricing',
    title: 'Review pricing for SaaS, PaaS, and managed services.',
    body: 'Find starting commercial models for enterprise applications, health-platform infrastructure, and sovereign delivery.',
    href: '/pricing',
    cta: 'View pricing',
  },
];

export const solutionMetrics: Metric[] = [
  {
    label: 'Solution domains',
    value: 'Provider, public-sector, payer, and partner products',
  },
  {
    label: 'Data posture',
    value: 'Canonical FHIR with normalized write-back',
  },
  {
    label: 'Market posture',
    value: 'Pan-African platform with explicit country packs',
  },
  {
    label: 'Deployment choice',
    value: 'Shared to sovereign',
  },
];

export const solutionAreas: Capability[] = [
  {
    state: 'platform',
    title: 'Provider operations',
    summary: 'Bring clinical workflows, national interoperability, and reimbursement evidence onto one operating foundation.',
    detail: 'The platform is positioned for provider groups that need coordination across facilities, clinicians, payers, and regulators.',
  },
  {
    state: 'market',
    title: 'Public-sector interoperability programs',
    summary: 'Support registry workflows, shared-health-record exchange, and country-aware deployment models for national programs across participating markets.',
    detail: 'The country-pack model gives each market a full interoperability surface while preserving one enterprise platform contract.',
  },
  {
    state: 'enterprise',
    title: 'Payer and scheme operations',
    summary: 'Connect eligibility, claims, and status refresh to the same operational record as care delivery.',
    detail: 'That gives payer-facing workflows a stronger evidence trail than a detached clearinghouse pattern.',
  },
  {
    state: 'enterprise',
    title: 'Connected digital products',
    summary: 'Launch patient, partner, and operational experiences on the same platform contract instead of building product silos.',
    detail: 'Digital channels stay aligned to the clinical core while writing normalized outcomes back into the shared model.',
  },
];

export const solutionExecutionHighlights: Highlight[] = [
  {
    eyebrow: 'Care coordination',
    title: 'Clinical workflows stay close to the source of truth.',
    body: 'Operational products should read from and write back to a governed FHIR core rather than turning integrations into a parallel database strategy.',
  },
  {
    eyebrow: 'National exchange',
    title: 'Country-specific flows stay behind explicit pack boundaries.',
    body: 'Registry checks, terminology mappings, and claims rails belong in country-aware services, not in generic platform drift.',
  },
  {
    eyebrow: 'Reimbursement integrity',
    title: 'Claims activity becomes part of the evidence trail.',
    body: 'Coverage checks, submissions, and status changes can be tied back to the same auditable operational record as the encounter.',
  },
  {
    eyebrow: 'Deployment control',
    title: 'Operating model choice stays separate from the data contract.',
    body: 'Shared, dedicated, managed, and sovereign delivery options should not force a new platform meaning or a new clinical model.',
  },
];

export const solutionOutcomeEntries: DetailEntry[] = [
  {
    term: 'Clinical coordination',
    description: 'Present care delivery, task execution, and operational evidence as one managed workflow instead of a chain of disconnected handoffs.',
  },
  {
    term: 'National interoperability',
    description: 'Handle regulator and registry interactions through governed country-pack services that preserve the canonical record.',
  },
  {
    term: 'Revenue integrity',
    description: 'Tie reimbursement activity to the same operational ledger as care delivery, eligibility, and authorization-facing work.',
  },
  {
    term: 'Deployment flexibility',
    description: 'Support shared and sovereign patterns without changing how developers model data, workflows, and pack-aware integrations.',
  },
];

export const developerMetrics: Metric[] = [
  {
    label: 'Repo shape',
    value: 'TypeScript monorepo with npm workspaces and Turborepo',
  },
  {
    label: 'Core contract',
    value: 'Generic operations plus country-pack dispatch',
  },
  {
    label: 'Evidence model',
    value: 'FHIR write-back with Task, AuditEvent, and response resources',
  },
  {
    label: 'Reference context',
    value: 'Country-pack model operating across enterprise and market workflows',
  },
];

export const developerAssets: DeveloperAsset[] = [
  {
    state: 'platform',
    title: 'Canonical FHIR platform core',
    summary: 'Build workflows against a stable clinical and reimbursement record rather than against market-specific payloads.',
    detail: 'The platform keeps pack-aware behavior outside the core data model and writes normalized outcomes back into FHIR resources.',
    href: '/platform',
    cta: 'Review platform model',
  },
  {
    state: 'market',
    title: 'Country-pack contract',
    summary: 'Country adaptation is handled through explicit pack boundaries for onboarding, secrets, mappings, and external dispatch.',
    detail: 'This lets the shared platform stay pan-African while supporting market-specific execution through reusable national overlays.',
    href: '/country-packs',
    cta: 'Review country-pack model',
  },
  {
    state: 'market',
    title: 'Formal conformance assets',
    summary: 'Country-specific profiles, value sets, code systems, and capability narratives reinforce the platform with full implementation-guide discipline.',
    detail: 'This aligns operational behavior, market workflows, and exchange documentation across the portfolio.',
    href: '/delivery',
    cta: 'Review platform capabilities',
  },
  {
    state: 'enterprise',
    title: 'Public enterprise web layer',
    summary: 'The corporate website, pricing model, onboarding wizard, and ERPNext lead handoff now operate as one integrated commercial layer.',
    detail: 'The public experience mirrors the wider platform scope across products, managed services, and enterprise operations.',
    href: '/company',
    cta: 'View company narrative',
  },
  {
    state: 'market',
    title: 'Multi-country pack expansion',
    summary: 'Additional markets should arrive by implementing new packs against the same canonical model and operational contract.',
    detail: 'The same platform contract scales through new country packs, new exchange rails, and new national operating surfaces.',
    href: '/country-packs',
    cta: 'See expansion model',
  },
  {
    state: 'enterprise',
    title: 'Adjacent enterprise services',
    summary: 'Billing, payments, analytics, and AI stay adjacent to the core platform rather than redefining it.',
    detail: 'They should integrate around the canonical FHIR foundation and publish normalized results back into it.',
    href: '/solutions',
    cta: 'See solution framing',
  },
];

export const developerModelEntries: DetailEntry[] = [
  {
    term: 'Data contract',
    description: 'The editable source of truth lives in the canonical FHIR layer, not in transport payloads and not in browser-side integration state.',
  },
  {
    term: 'Integration boundary',
    description: 'Country-specific integrations belong in handlers, connectors, and pack-aware services that can be swapped per market.',
  },
  {
    term: 'Write-back pattern',
    description: 'External outcomes should return to FHIR resources plus evidence resources so operational history stays reviewable.',
  },
  {
    term: 'Cloud posture',
    description: 'Shared, dedicated, managed, and sovereign delivery should be deployment choices around one platform model, not separate products.',
  },
];

export const companyMetrics: Metric[] = [
  {
    label: 'Company stance',
    value: 'Pan-African platform with country-aware enterprise execution',
  },
  {
    label: 'Market coverage',
    value: 'Country-pack operations, national interoperability, and enterprise deployment choices',
  },
  {
    label: 'Execution model',
    value: 'Integrated platform, applications, devices, onboarding, and managed operations',
  },
  {
    label: 'Corporate voice',
    value: 'Calm, executive, solution-led, and enterprise-ready',
  },
];

export const companyCommitments: Highlight[] = [
  {
    eyebrow: 'Platform discipline',
    title: 'Operate from a strong platform foundation.',
    body: 'The corporate story stays anchored in the canonical FHIR platform, country-pack contract, and operational evidence model across the full portfolio.',
  },
  {
    eyebrow: 'Country awareness',
    title: 'Expand through repeatable market architecture.',
    body: 'The architecture is intentionally structured so new markets arrive as country packs on one consistent platform contract.',
  },
  {
    eyebrow: 'Enterprise coherence',
    title: 'Present one connected enterprise platform.',
    body: 'Applications, interoperability, cloud operations, analytics, AI, and managed services should read as one coordinated company offering.',
  },
  {
    eyebrow: 'Operating flexibility',
    title: 'Support shared and sovereign models without platform fragmentation.',
    body: 'The company can speak to multiple deployment modes while preserving one core clinical and operational contract.',
  },
];

export const companyModelEntries: DetailEntry[] = [
  {
    term: 'Geography',
    description: 'Pan-African by platform design, with country-aware execution delivered through repeatable market packs and enterprise deployment models.',
  },
  {
    term: 'Platform boundary',
    description: 'Afiax FHIR and country packs form the core, while adjacent services extend around that core without redefining it.',
  },
  {
    term: 'Delivery method',
    description: 'Deliver applications, market services, onboarding, devices, and managed operations as one enterprise operating model.',
  },
  {
    term: 'Public communications',
    description: 'Corporate messaging should stay outcome-led, executive, and confident across the full Afiax portfolio.',
  },
];
