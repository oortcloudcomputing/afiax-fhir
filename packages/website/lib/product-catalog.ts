// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { DetailEntry, Metric } from './site-content';

export interface PricedOffering {
  readonly category: 'SaaS' | 'PaaS' | 'Managed';
  readonly title: string;
  readonly summary: string;
  readonly description: string;
  readonly price: string;
  readonly unit: string;
  readonly commitment: string;
  readonly includes: readonly string[];
}

export interface PricingBundle {
  readonly badge: string;
  readonly title: string;
  readonly summary: string;
  readonly audience: string;
  readonly price: string;
  readonly unit: string;
  readonly includes: readonly string[];
}

export interface ProductProfile {
  readonly audience: string;
  readonly deploymentFit: string;
  readonly outcomes: readonly string[];
  readonly related: readonly string[];
}

export interface CatalogProduct extends PricedOffering, ProductProfile {
  readonly slug: string;
}

export type OfferingTrack = 'saas' | 'paas';

export type PlanTier = 'basic' | 'pro' | 'platinum';

export type BillingView = 'hour' | 'month';

export type PaaSDeploymentModel = 'public' | 'hybrid' | 'private';

export interface PricingPlanOffer {
  readonly track: OfferingTrack;
  readonly tier: PlanTier;
  readonly deployment?: PaaSDeploymentModel;
  readonly badge: string;
  readonly title: string;
  readonly summary: string;
  readonly monthlyPrice: number;
  readonly pricePrefix?: string;
  readonly audience: string;
  readonly commitment: string;
  readonly managedModel?: string;
  readonly activationKit?: readonly string[];
  readonly includes: readonly string[];
  readonly featuredProductSlugs: readonly string[];
  readonly erpnext: ErpnextPlanMap;
}

export interface ErpnextPlanMap {
  readonly itemCode: string;
  readonly itemGroup: string;
  readonly subscriptionPlan: string;
  readonly invoiceCadence: string;
  readonly usageItems: readonly string[];
}

export interface PaaSDeploymentProfile {
  readonly model: PaaSDeploymentModel;
  readonly badge: string;
  readonly title: string;
  readonly summary: string;
  readonly audience: string;
  readonly includes: readonly string[];
}

export const paasDeploymentLabels: Record<PaaSDeploymentModel, string> = {
  public: 'Afiax Public Cloud',
  hybrid: 'Hybrid',
  private: 'Private Afiax Cloud',
};

export const productMetrics: Metric[] = [
  {
    label: 'Enterprise products',
    value: 'Applications, interoperability, imaging, AI, and managed cloud',
  },
  {
    label: 'Commercial model',
    value: 'Seat subscriptions plus usage-based platform pricing',
  },
  {
    label: 'Deployment options',
    value: 'Afiax Public Cloud, Hybrid, Private Afiax Cloud, and sovereign',
  },
  {
    label: 'Onboarding posture',
    value: 'Readiness assessment, training, implementation, and support',
  },
];

export const pricingMetrics: Metric[] = [
  {
    label: 'Pricing structure',
    value: 'SaaS subscriptions, platform fees, and usage overages',
  },
  {
    label: 'Commercial stance',
    value: 'Starting prices for annual enterprise agreements',
  },
  {
    label: 'Included service',
    value: 'Managed operations, onboarding, launch support, and activation hardware',
  },
  {
    label: 'Scale path',
    value: 'Volume discounts across users, patients, countries, and APIs',
  },
];

export const pricingBundles: PricingBundle[] = [
  {
    badge: 'Application suite',
    title: 'Care Delivery Cloud',
    summary:
      'A full suite of integrated solutions to manage patient administration, documentation, portals, and virtual care for growing provider groups.',
    audience: 'Best for ambulatory groups, specialty practices, and emerging provider networks.',
    price: '$2,900',
    unit: 'per month',
    includes: [
      'Afiax EHR for up to 20 providers',
      'Patient Portals',
      'Afiax Tele-Healthcare',
      'Clinical Decision Support',
      'Training, onboarding, and go-live support',
    ],
  },
  {
    badge: 'Most adopted',
    title: 'Connected Enterprise',
    summary:
      'An enterprise operating environment for multi-facility health systems that need connected care, imaging, revenue workflows, and interoperable data exchange.',
    audience: 'Best for hospital groups, care networks, and payer-connected provider enterprises.',
    price: '$7,500',
    unit: 'per month',
    includes: [
      'Everything in Care Delivery Cloud',
      'Afiax Medical Imaging',
      'Healthcare Financial Services',
      'Afiax FHIR Cloud foundation',
      'Operational dashboards and executive reporting',
    ],
  },
  {
    badge: 'National and sovereign',
    title: 'Health Platform Infrastructure',
    summary:
      'Dedicated or sovereign platform delivery for public-sector programs, national interoperability boundaries, payer platforms, and regulated ecosystem operators.',
    audience: 'Best for governments, national schemes, major payers, and strategic ecosystem programs.',
    price: 'Custom',
    unit: 'annual agreement',
    includes: [
      'Dedicated Afiax FHIR Cloud',
      'Country Pack Runtime',
      'Private networking and residency controls',
      'Managed Digital Health Services',
      '24/7 service operations and enterprise support',
    ],
  },
];

export const applicationProducts: PricedOffering[] = [
  {
    category: 'SaaS',
    title: 'Afiax EHR',
    summary:
      'Transform the EHR from a cumbersome administrative tool into an intelligent, collaborative assistant with embedded advanced automation.',
    description:
      'Easily document and access critical information to support efficient care delivery, alleviate burnout, and enhance patient and clinician experiences.',
    price: '$149',
    unit: 'provider / month',
    commitment: 'Starting price for annual agreements with a 20-provider minimum.',
    includes: [
      'FHIR Compliant',
      'Patient Portals',
      '100% Opensource',
      'Backup and Business Continuity',
    ],
  },
  {
    category: 'SaaS',
    title: 'Patient Portals',
    summary:
      'Meet patients where they feel most comfortable with Afiax Clinical suite of video visit offerings and digital therapeutic capabilities.',
    description:
      'Empower patients to be involved in their care with our patient portal. Our portal is integrated with the Afiax EHR on both enterprise and open source platforms and provides the patient with access to their longitudinal record.',
    price: '$399',
    unit: 'organization / month',
    commitment: 'Includes up to 5,000 monthly active patients; overage from $0.03 per active patient.',
    includes: [
      'Live tele medicine consultations',
      'Secure messaging',
      'Appointment booking and refill requests',
      'Afiapedia patient education platform',
    ],
  },
  {
    category: 'SaaS',
    title: 'Afiax Tele-Healthcare',
    summary:
      'Enable near real-time collaboration across care teams with tools that help clinicians quickly identify shared patients, connect with care team members, and coordinate care on the go so they can deliver the right care to the right patient at the right time.',
    description:
      'real-time clinical communication and collaboration with tools that help clinicians quickly and easily collaborate and coordinate care on the go',
    price: '$99',
    unit: 'provider / month',
    commitment: 'Includes 2,000 participant minutes per provider; overage from $0.01 per participant minute.',
    includes: [
      'Remote patient care',
      'Tele medicine',
      'Embedded billing and invoicing',
      'Secure Data Protection and security',
    ],
  },
  {
    category: 'SaaS',
    title: 'Afiax Remote Care',
    summary:
      'Afiax Remote Patient Monitoring empowers care teams to seamlessly collect patient data from home devices and integrate it into clinician workflows.',
    description:
      'This integration provides a comprehensive view of the patient’s health, enabling early detection and proactive interventions.',
    price: '$24',
    unit: 'monitored patient / month',
    commitment: 'Annual program activation from $12,000 with device onboarding from $60 per patient.',
    includes: [
      '24/7 device streaming',
      'Reports and Alarms',
      'Intergrates with all medical devices',
      'No installation',
    ],
  },
  {
    category: 'SaaS',
    title: 'Afiax Medical Imaging',
    summary:
      'Cloud imaging, study access, and workflow coordination for enterprise radiology and diagnostic services.',
    description:
      'Medical imaging services for health systems that need imaging operations connected to the wider clinical, portal, and reimbursement environment.',
    price: '$1,250',
    unit: 'site / month',
    commitment: 'Includes viewer, routing, and archive foundation for one imaging site; enterprise teleradiology by quote.',
    includes: [
      'Study viewing and routing',
      'Archive and access controls',
      'Operational imaging workflows',
      'FHIR-linked imaging context',
    ],
  },
  {
    category: 'SaaS',
    title: 'Healthcare Financial Services',
    summary:
      'Enable your revenue cycle leaders to measure, predict, and optimize financial performance with targeted analytics capabilities,meanwhile Provide your community with convenience and transparency when seeking care by streamlining the patient financial experience across digital and staff-assisted workflows.',
    description:
      'Integrate your revenue cycle from registration through bill collection. Leverage intelligent automation and generative AI to drive optimal financial performance.',
    price: '$1,500',
    unit: 'site / month',
    commitment: 'Managed collections and payer operations are available from 3% of recovered revenue.',
    includes: [
      'Billing and invoicing workflows',
      'Claims and collections support',
      'Revenue integrity dashboards',
      'Operational evidence for reimbursement',
    ],
  },
  {
    category: 'SaaS',
    title: 'Clinical Decision Support',
    summary:
      'Deliver smart recommendations inside the workflow so clinicians can move faster without losing context.',
    description:
      'Clinical rules, alerts, and knowledge support designed to reduce administrative burden while supporting patient safety and better decisions.',
    price: '$29',
    unit: 'clinician / month',
    commitment: 'Available as an add-on to Afiax EHR and Tele-Healthcare deployments.',
    includes: [
      'Rules and alerts',
      'Workflow-aware recommendations',
      'Governed knowledge updates',
      'Clinical quality support',
    ],
  },
  {
    category: 'SaaS',
    title: 'Afiax Clinical AI Agent',
    summary:
      'With Afiax Health Clinical AI Agent—an AI-powered, voice-enabled solution—you can keep the focus on your patients.',
    description:
      'Integrated with our EHR, our solution streamlines key clinical and operational workflows, such as charting, documentation, and medication and order management',
    price: '$69',
    unit: 'clinician / month',
    commitment: 'Requires Afiax EHR and enterprise governance for note, order, and voice workflows.',
    includes: [
      'Voice-enabled documentation',
      'Charting assistance',
      'Medication and order support',
      'Workflow-aware AI controls',
    ],
  },
  {
    category: 'SaaS',
    title: 'CPD Training',
    summary:
      'Continuous professional development and training delivery for clinicians, teams, and partner networks.',
    description:
      'Structured learning, certification tracking, and training programs that sit alongside operational products and onboarding.',
    price: '$6',
    unit: 'learner / month',
    commitment: 'Annual enterprise minimum from $3,000 for institutional training programs.',
    includes: [
      'Program enrollment and tracking',
      'Digital course delivery',
      'Certification reporting',
      'Onboarding and skills pathways',
    ],
  },
  {
    category: 'SaaS',
    title: 'Locums',
    summary:
      'Workforce coverage, scheduling, and talent coordination for fast-moving provider organizations.',
    description:
      'A connected workforce product for facilities and clinical groups that need staffing agility without creating another disconnected operational tool.',
    price: '$299',
    unit: 'facility / month',
    commitment: 'Marketplace and staffing operations can be expanded with managed services by quote.',
    includes: [
      'Facility staffing requests',
      'Availability and coordination',
      'Operational workflow linkage',
      'Managed rollout support',
    ],
  },
];

export const platformProducts: PricedOffering[] = [
  {
    category: 'PaaS',
    title: 'Afiax FHIR Cloud',
    summary:
      'THE HEALTH CARE CLOUD THAT UNDERSTANDS CLINICIANS',
    description:
      'Leverage AI-driven solutions that help simplify workflows, alleviate administrative burden, and support patient safety.',
    price: '$2,500',
    unit: 'environment / month',
    commitment:
      'Delivered as a managed service across Afiax Public Cloud, Hybrid, and Private Afiax Cloud. Includes 5 million standard API requests and 100 GB structured storage; overage from $0.60 per 100,000 requests and $0.25 per GB.',
    includes: [
      'Canonical FHIR core',
      'Open, connected ecosystems',
      'Backups and business continuity',
      'Managed environment operations',
    ],
  },
  {
    category: 'PaaS',
    title: 'Country Pack Runtime',
    summary:
      'Country-specific registries, terminology, claims rails, and compliance flows behind a stable platform contract.',
    description:
      'Designed for pan-African expansion so new market requirements can be introduced without rewriting the canonical core.',
    price: '$3,500',
    unit: 'country / month',
    commitment:
      'Managed country onboarding and statutory mapping services start at $15,000 per market, aligned to Afiax Public Cloud, Hybrid, or Private Afiax Cloud delivery.',
    includes: [
      'Registry and payer connectors',
      'Secrets and onboarding governance',
      'Terminology and mapping controls',
      'Pack-aware operational dispatch',
    ],
  },
  {
    category: 'PaaS',
    title: 'Medical I.O.T Fabric',
    summary:
      'Device connectivity, telemetry capture, and operational routing for connected healthcare hardware and home devices.',
    description:
      'Medical I.O.T services designed to bring device data into the same clinical and operational environment rather than leaving it stranded in a point solution.',
    price: '$2',
    unit: 'device / month',
    commitment:
      'Gateway onboarding starts at $2,500 per site; all deployments are managed and high-volume telemetry tiers are available by quote.',
    includes: [
      'Device identity and telemetry ingestion',
      'Alert routing and escalation',
      'Clinical workflow integration',
      'Longitudinal patient context',
    ],
  },
  {
    category: 'PaaS',
    title: 'API and Integration Hub',
    summary:
      'Interoperability solutions for Open, connected ecosystems',
    description:
      'Enable collaborative third-party relationships and seamless data exchange. Equip providers with comprehensive patient information while giving developers the tools and training to focus on advancing healthcare innovation.',
    price: '$1,250',
    unit: 'tenant / month',
    commitment:
      'Includes five active connectors and 2 million orchestration events; additional connectors from $150 per month within managed public, hybrid, or private delivery.',
    includes: [
      'API governance and gateway services',
      'Partner and third-party exchange',
      'Webhook and event orchestration',
      'Connector lifecycle management',
    ],
  },
  {
    category: 'PaaS',
    title: 'Data and AI Workspace',
    summary:
      'Spend less time hunting and preparing data, and more time acting on it.',
    description:
      'Cultivate a data-centric culture by putting appropriate data in the hands of your clinical, financial and operational users with the Afiax Clinical suite Unified Analytics and Reporting features.',
    price: '$1,800',
    unit: 'workspace / month',
    commitment:
      'Includes executive dashboards and 250 GB analytical storage; advanced AI workloads are priced by compute profile across managed public, hybrid, or private deployment.',
    includes: [
      'Transform data into groundbreaking innovations',
      'Connecting care across the continuum',
      'Engaging Patient experience in the care process',
      'Near real-time health record delivery technology',
    ],
  },
  {
    category: 'Managed',
    title: 'Managed Digital Health Services',
    summary:
      'While healthcare is complex, your data doesn’t have to be.',
    description:
      'Our experts in E health and cloud computing will help ensure your support is flawless; your end users are happy; your issues get resolved; your security is breach-proof; your workforce is healthy and your applications perform as designed.',
    price: '$3,500',
    unit: 'tenant / month',
    commitment: '24/7 enterprise support, incident response, and change-management retainers scale by environment and service window.',
    includes: [
      'Site-to-Site VPN',
      'Private APIs',
      'Designed to meet industry regulations',
      'Get additional trust controls out of the box',
    ],
  },
  {
    category: 'Managed',
    title: 'Sovereign Health Platform',
    summary:
      'Dedicated and sovereign delivery patterns for countries, national schemes, and regulated enterprises with strict residency requirements.',
    description:
      'Supports shared, dedicated, managed, and sovereign operating models without changing the core platform meaning or country-pack contract.',
    price: 'Custom',
    unit: 'environment agreement',
    commitment: 'Typical private-space starting point is $8,500 per month plus pass-through cloud or colocation costs.',
    includes: [
      'Dedicated environments and networking',
      'Residency and sovereignty controls',
      'Custom support and service windows',
      'Regulated deployment architecture',
    ],
  },
];

export const pricingPrinciples: DetailEntry[] = [
  {
    term: 'Commercial structure',
    description:
      'Application products are priced primarily by provider, facility, learner, or patient volume. Platform products are priced by environment, country, connector, device, and usage.',
  },
  {
    term: 'Annual agreements',
    description:
      'Prices shown are starting points for annual enterprise agreements. Pilot and monthly terms are available for smaller launch programs at a premium.',
  },
  {
    term: 'Implementation',
    description:
      'Every enterprise launch begins with readiness assessment, onboarding, training, and implementation planning. Country-specific statutory integrations are quoted up front with no hidden charges.',
  },
  {
    term: 'Cloud and residency',
    description:
      'All Afiax PaaS offers are managed and available as Afiax Public Cloud, Hybrid, or Private Afiax Cloud. Pricing changes with infrastructure isolation, service windows, residency constraints, and security posture.',
  },
  {
    term: 'Activation hardware',
    description:
      'Every Afiax PaaS agreement includes a complimentary activation kit with tablets, displays, and digital health starter devices sized to the selected tier and deployment model.',
  },
  {
    term: 'Volume economics',
    description:
      'Pricing improves with enterprise scale across providers, patients, transactions, countries, and long-term platform commitments.',
  },
];

export const paasDeploymentProfiles: PaaSDeploymentProfile[] = [
  {
    model: 'public',
    badge: 'Managed public cloud',
    title: 'Afiax Public Cloud',
    summary:
      'The fastest path to launch on Afiax-operated infrastructure with managed security, backups, monitoring, and platform operations.',
    audience: 'Best for private provider groups, fast-moving digital programs, and organizations that want enterprise speed with minimal infrastructure overhead.',
    includes: [
      'Afiax-operated managed hosting',
      'Standard residency and managed security controls',
      'Shared cloud economics with enterprise governance',
      'Complimentary activation kit with tablets, displays, and digital health starter devices',
    ],
  },
  {
    model: 'hybrid',
    badge: 'Managed hybrid',
    title: 'Hybrid',
    summary:
      'A split-control operating model that combines Afiax-managed cloud services with on-premise, partner, or country-hosted boundary systems.',
    audience: 'Best for enterprises that need local boundary systems, phased modernization, or mixed residency and integration constraints.',
    includes: [
      'Afiax-managed cloud core with hybrid connectivity',
      'Integration across facility or country-hosted systems',
      'Managed operations spanning both cloud and boundary components',
      'Complimentary activation kit with tablets, displays, and digital health starter devices',
    ],
  },
  {
    model: 'private',
    badge: 'Managed private cloud',
    title: 'Private Afiax Cloud',
    summary:
      'Dedicated Afiax-operated private cloud environments with higher isolation, private networking, and residency-oriented operating controls.',
    audience: 'Best for regulated enterprises, national programs, and organizations that need stronger isolation without giving up managed operations.',
    includes: [
      'Dedicated compute, storage, and private networking',
      'Higher isolation and residency-aligned operating controls',
      'Managed enterprise operations and premium support windows',
      'Complimentary activation kit with tablets, displays, and digital health starter devices',
    ],
  },
];

const productProfiles: Record<string, ProductProfile> = {
  'Afiax EHR': {
    audience: 'Provider groups, hospital systems, ambulatory networks, and digitally maturing care organizations.',
    deploymentFit: 'Shared SaaS, dedicated SaaS, and managed enterprise deployments.',
    outcomes: [
      'FHIR Compliant',
      'Patient Portals',
      '100% Opensource',
      'Backup and Business Continuity',
    ],
    related: ['patient-portals', 'clinical-decision-support', 'afiax-clinical-ai-agent'],
  },
  'Patient Portals': {
    audience: 'Health systems, specialty clinics, and provider groups that want stronger patient engagement.',
    deploymentFit: 'Shared SaaS and dedicated enterprise deployments aligned to the core clinical platform.',
    outcomes: [
      'Patients can communicate with providers for live tele medicine consultations and through secure messaging to book or change appointments, view clinical information, request refills, update information and send files.',
      'Through the portal, physicians can share accredited, evidence-based data with their patients on more than 3,000 topics.',
      'Patients also have access to exclusive health promotion videos on demand through Afiapedia – the Afiax patient education platform',
    ],
    related: ['afiax-ehr', 'afiax-tele-healthcare', 'afiax-remote-care'],
  },
  'Afiax Tele-Healthcare': {
    audience: 'Provider organizations, distributed care teams, and virtual-first service lines.',
    deploymentFit: 'Shared SaaS, dedicated SaaS, and managed enterprise virtual-care rollouts.',
    outcomes: [
      'Remote patient care',
      'Tele medicine',
      'Embedded billing and invoicing',
      'Secure Data Protection and security',
    ],
    related: ['afiax-ehr', 'patient-portals', 'healthcare-financial-services'],
  },
  'Afiax Remote Care': {
    audience: 'Chronic-care programs, home-based care teams, and health systems extending beyond facility walls.',
    deploymentFit: 'Managed programs with shared or dedicated platform delivery and device onboarding.',
    outcomes: [
      '24/7 Device streaming',
      'Reports and Alarms',
      'Intergrates with all medical devices',
      'No installation',
    ],
    related: ['medical-i-o-t-fabric', 'patient-portals', 'afiax-tele-healthcare'],
  },
  'Afiax Medical Imaging': {
    audience: 'Hospitals, radiology groups, diagnostic providers, and multi-site care networks.',
    deploymentFit: 'Dedicated and managed enterprise deployments with archive, routing, and viewer services.',
    outcomes: [
      'Connect imaging operations to the wider clinical and reimbursement environment.',
      'Improve access to studies across care teams and facilities.',
      'Support enterprise imaging workflows without fragmenting the patient record.',
    ],
    related: ['afiax-ehr', 'data-and-ai-workspace', 'managed-digital-health-services'],
  },
  'Healthcare Financial Services': {
    audience: 'Provider enterprises, payer-connected networks, and organizations focused on revenue integrity.',
    deploymentFit: 'Shared SaaS, dedicated SaaS, and managed collections programs.',
    outcomes: [
      'Revenue Cycle Management',
      'Integrate your revenue cycle from registration through bill collection.',
      'Leverage intelligent automation and generative AI to drive optimal financial performance.',
    ],
    related: ['afiax-ehr', 'country-pack-runtime', 'api-and-integration-hub'],
  },
  'Clinical Decision Support': {
    audience: 'Clinicians, care teams, and provider organizations focused on speed, quality, and consistency.',
    deploymentFit: 'Add-on service embedded into Afiax care-delivery workflows.',
    outcomes: [
      'Surface recommendations inside clinician workflows rather than outside them.',
      'Reduce cognitive load while supporting safety and quality goals.',
      'Standardize knowledge support across distributed care teams.',
    ],
    related: ['afiax-ehr', 'afiax-clinical-ai-agent', 'data-and-ai-workspace'],
  },
  'Afiax Clinical AI Agent': {
    audience: 'Enterprises looking to reduce clinician burden and automate high-volume documentation workflows.',
    deploymentFit: 'Governed AI deployment layered onto Afiax clinical products and enterprise controls.',
    outcomes: [
      'AI-powered, voice-enabled solution',
      'Charting and documentation',
      'Medication and order management',
    ],
    related: ['afiax-ehr', 'clinical-decision-support', 'data-and-ai-workspace'],
  },
  'CPD Training': {
    audience: 'Health systems, training institutions, partner networks, and workforce development programs.',
    deploymentFit: 'Shared SaaS and institutional enterprise learning programs.',
    outcomes: [
      'Scale training, certification, and onboarding across distributed teams.',
      'Track learning activity alongside operational rollout and adoption.',
      'Support workforce readiness as part of enterprise transformation.',
    ],
    related: ['locums', 'managed-digital-health-services', 'afiax-ehr'],
  },
  Locums: {
    audience: 'Hospital groups, staffing coordinators, and provider organizations managing variable workforce demand.',
    deploymentFit: 'Shared SaaS with optional managed workforce operations.',
    outcomes: [
      'Improve staffing agility without breaking operational workflow alignment.',
      'Coordinate requests, availability, and deployment across facilities.',
      'Reduce friction between workforce operations and care delivery needs.',
    ],
    related: ['cpd-training', 'managed-digital-health-services', 'afiax-ehr'],
  },
  'Afiax FHIR Cloud': {
    audience: 'Health platforms, provider networks, payers, and ecosystem builders needing a governed clinical core.',
    deploymentFit: 'Shared, dedicated, managed, and sovereign platform environments.',
    outcomes: [
      'Leverage AI-driven solutions that help simplify workflows, alleviate administrative burden, and support patient safety.',
      'Transform your EHR from a cumbersome administrative tool into an intelligent, collaborative assistant with embedded advanced automation.',
      'Afiax Clinical Suite is Designed to enable Clinicians Easily document and access critical information to support efficient care delivery, alleviate burnout, and enhance patient and clinician experiences.',
    ],
    related: ['country-pack-runtime', 'api-and-integration-hub', 'data-and-ai-workspace'],
  },
  'Country Pack Runtime': {
    audience: 'Public-sector programs, national schemes, payer ecosystems, and pan-African platform operators.',
    deploymentFit: 'Dedicated, managed, and sovereign delivery where market-specific rails must be controlled.',
    outcomes: [
      'Adapt the shared platform to country-specific registries, claims rails, and terminology.',
      'Expand into new markets without rewriting the canonical core.',
      'Keep national integrations governed behind explicit operational boundaries.',
    ],
    related: ['afiax-fhir-cloud', 'api-and-integration-hub', 'sovereign-health-platform'],
  },
  'Medical I.O.T Fabric': {
    audience: 'Connected-care programs, device-enabled providers, and enterprises extending care into the home.',
    deploymentFit: 'Managed device programs and platform deployments with telemetry at scale.',
    outcomes: [
      'Bring device telemetry into the clinical workflow with governed identity and routing.',
      'Reduce fragmentation across device, patient, and clinician workflows.',
      'Support remote interventions with better context and faster escalation.',
    ],
    related: ['afiax-remote-care', 'afiax-fhir-cloud', 'data-and-ai-workspace'],
  },
  'API and Integration Hub': {
    audience: 'Providers, payers, developers, and ecosystem partners integrating across enterprise boundaries.',
    deploymentFit: 'Shared or dedicated gateway and orchestration services with enterprise governance.',
    outcomes: [
      'Enable collaborative third-party relationships and seamless data exchange.',
      'Equip providers with comprehensive patient information.',
      'Give developers the tools and training to focus on advancing healthcare innovation.',
    ],
    related: ['afiax-fhir-cloud', 'country-pack-runtime', 'managed-digital-health-services'],
  },
  'Data and AI Workspace': {
    audience: 'Executives, analytics teams, AI programs, and operational leaders needing governed healthcare insights.',
    deploymentFit: 'Shared or dedicated analytical workspaces with enterprise reporting and AI-ready services.',
    outcomes: [
      'Transform data into groundbreaking innovations',
      'Connecting care across the continuum',
      'Engaging Patient experience in the care process',
    ],
    related: ['afiax-fhir-cloud', 'afiax-clinical-ai-agent', 'afiax-medical-imaging'],
  },
  'Managed Digital Health Services': {
    audience: 'Organizations that want operational support across launch, support, security, and continuity.',
    deploymentFit: 'Managed service overlays for shared, dedicated, and sovereign enterprise deployments.',
    outcomes: [
      'Site-to-Site VPN',
      'Private APIs',
      'Designed to meet industry regulations',
      'Get additional trust controls out of the box',
    ],
    related: ['afiax-fhir-cloud', 'sovereign-health-platform', 'cpd-training'],
  },
  'Sovereign Health Platform': {
    audience: 'Governments, national schemes, regulated enterprises, and organizations with strict residency needs.',
    deploymentFit: 'Dedicated private-space and sovereign deployment models with custom service windows.',
    outcomes: [
      'Meet residency, isolation, and sovereignty requirements without changing platform meaning.',
      'Support national-scale or regulated deployments on the same core architecture.',
      'Preserve country-pack and integration discipline across stricter operating environments.',
    ],
    related: ['afiax-fhir-cloud', 'country-pack-runtime', 'managed-digital-health-services'],
  },
};

function slugifyProductTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function getProductProfile(title: string): ProductProfile {
  return (
    productProfiles[title] ?? {
      audience: 'Enterprise healthcare organizations and ecosystem operators.',
      deploymentFit: 'Shared, dedicated, and managed enterprise delivery models.',
      outcomes: [
        'Support connected healthcare operations on one governed platform foundation.',
        'Improve coordination across teams, workflows, and partner systems.',
        'Scale with enterprise controls, operational discipline, and clear deployment choices.',
      ],
      related: [],
    }
  );
}

export const allProducts: CatalogProduct[] = [...applicationProducts, ...platformProducts].map((product) => ({
  ...product,
  slug: slugifyProductTitle(product.title),
  ...getProductProfile(product.title),
}));

export function getProductHref(title: string): string {
  return `/solutions/${slugifyProductTitle(title)}`;
}

export function getCatalogProductBySlug(slug: string): CatalogProduct | undefined {
  return allProducts.find((product) => product.slug === slug);
}

export function getRelatedProducts(product: CatalogProduct): CatalogProduct[] {
  return product.related
    .map((slug) => getCatalogProductBySlug(slug))
    .filter((candidate): candidate is CatalogProduct => Boolean(candidate));
}

export const pricingPlanOffers: PricingPlanOffer[] = [
  {
    track: 'saas',
    tier: 'basic',
    badge: 'SaaS Basic',
    title: 'Care Delivery Starter',
    summary: 'Core clinical and patient-access applications for ambulatory groups and early enterprise rollouts.',
    monthlyPrice: 2900,
    audience: 'Best for specialty practices, ambulatory groups, and fast-moving provider organizations.',
    commitment: 'Annual agreement with implementation planning, onboarding, and go-live support.',
    includes: [
      'Afiax EHR foundation',
      'Patient Portals',
      'Afiax Tele-Healthcare',
      'Clinical Decision Support',
      'Standard onboarding and training',
    ],
    featuredProductSlugs: ['afiax-ehr', 'patient-portals', 'afiax-tele-healthcare', 'clinical-decision-support'],
    erpnext: {
      itemCode: 'AFX-SAAS-BASIC',
      itemGroup: 'Afiax SaaS Plans',
      subscriptionPlan: 'Afiax SaaS Basic Monthly',
      invoiceCadence: 'Monthly subscription or annual prepaid contract',
      usageItems: ['AFX-IMPL-SVC', 'AFX-PORTAL-ACTIVE', 'AFX-TELE-MIN-OVER'],
    },
  },
  {
    track: 'saas',
    tier: 'pro',
    badge: 'SaaS Pro',
    title: 'Connected Enterprise Suite',
    summary: 'A multi-site application suite for health systems that need connected care, revenue, imaging, and AI-assisted operations.',
    monthlyPrice: 7500,
    audience: 'Best for hospital systems, integrated provider networks, and payer-connected enterprises.',
    commitment: 'Annual enterprise agreement with multi-site rollout support and executive onboarding.',
    includes: [
      'Everything in Basic',
      'Afiax Medical Imaging',
      'Healthcare Financial Services',
      'Afiax Clinical AI Agent',
      'Remote care workflows',
    ],
    featuredProductSlugs: [
      'afiax-ehr',
      'patient-portals',
      'afiax-tele-healthcare',
      'afiax-medical-imaging',
      'healthcare-financial-services',
      'afiax-clinical-ai-agent',
      'afiax-remote-care',
    ],
    erpnext: {
      itemCode: 'AFX-SAAS-PRO',
      itemGroup: 'Afiax SaaS Plans',
      subscriptionPlan: 'Afiax SaaS Pro Monthly',
      invoiceCadence: 'Monthly subscription or annual enterprise contract',
      usageItems: ['AFX-IMPL-SVC', 'AFX-RPM-PATIENT', 'AFX-IMAGE-SITE-ADD', 'AFX-MANAGED-SUPPORT'],
    },
  },
  {
    track: 'saas',
    tier: 'platinum',
    badge: 'SaaS Platinum',
    title: 'Enterprise Operations Cloud',
    summary: 'The full application portfolio for organizations that want clinical, workforce, training, patient, and revenue operations on one enterprise stack.',
    monthlyPrice: 14500,
    pricePrefix: 'Starting at',
    audience: 'Best for mature health systems, digital-first networks, and regional healthcare groups.',
    commitment: 'Annual enterprise agreement with premium support windows, executive governance, and managed adoption services.',
    includes: [
      'Everything in Pro',
      'CPD Training',
      'Locums',
      'Managed service overlay',
      'Premium executive support',
    ],
    featuredProductSlugs: [
      'afiax-ehr',
      'patient-portals',
      'afiax-tele-healthcare',
      'afiax-remote-care',
      'afiax-medical-imaging',
      'healthcare-financial-services',
      'clinical-decision-support',
      'afiax-clinical-ai-agent',
      'cpd-training',
      'locums',
    ],
    erpnext: {
      itemCode: 'AFX-SAAS-PLAT',
      itemGroup: 'Afiax SaaS Plans',
      subscriptionPlan: 'Afiax SaaS Platinum Monthly',
      invoiceCadence: 'Annual enterprise contract with premium service schedule',
      usageItems: ['AFX-IMPL-SVC', 'AFX-MANAGED-SUPPORT', 'AFX-PRIVATE-ENV', 'AFX-ADOPTION-SVC'],
    },
  },
  {
    track: 'paas',
    tier: 'basic',
    deployment: 'public',
    badge: 'PaaS Basic',
    title: 'FHIR Platform Core',
    summary:
      'A managed Afiax Public Cloud foundation for governed interoperability, APIs, and connected-health delivery on the canonical FHIR core.',
    monthlyPrice: 2500,
    audience:
      'Best for healthcare platforms, provider networks, and digital teams building on a shared FHIR core with Afiax Public Cloud delivery.',
    commitment: 'Annual platform agreement with managed public-cloud onboarding, implementation planning, and standard launch support.',
    managedModel:
      'Afiax manages hosting, monitoring, patching, backup, and standard security operations on Afiax Public Cloud.',
    activationKit: ['4 managed clinical tablets', '1 digital display', 'Starter barcode, label, and intake kit'],
    includes: [
      'Afiax FHIR Cloud',
      'API and Integration Hub',
      'Managed platform operations',
      'Complimentary activation hardware pack',
    ],
    featuredProductSlugs: ['afiax-fhir-cloud', 'api-and-integration-hub'],
    erpnext: {
      itemCode: 'AFX-PAAS-BASIC-PUB',
      itemGroup: 'Afiax PaaS Plans',
      subscriptionPlan: 'Afiax PaaS Basic Public Cloud Monthly',
      invoiceCadence: 'Monthly platform subscription or annual platform contract',
      usageItems: ['AFX-API-REQ-OVER', 'AFX-STORAGE-GB-OVER', 'AFX-CONNECTOR-ADD', 'AFX-HW-BUNDLE-INCL'],
    },
  },
  {
    track: 'paas',
    tier: 'pro',
    deployment: 'public',
    badge: 'PaaS Pro',
    title: 'Country-Ready Platform',
    summary:
      'A managed Afiax Public Cloud platform for enterprises and programs that need country adaptation, analytics, and enterprise service operations.',
    monthlyPrice: 6800,
    audience:
      'Best for payer ecosystems, public-sector programs, and enterprises expanding across markets on Afiax Public Cloud.',
    commitment:
      'Annual platform agreement with country onboarding, statutory mapping, managed operations support, and rollout governance.',
    managedModel:
      'Afiax manages the cloud core, country services, monitoring, patching, and managed service operations on Afiax Public Cloud.',
    activationKit: ['10 managed clinical tablets', '3 digital displays', 'Nursing-station barcode and intake kit'],
    includes: [
      'Everything in Basic',
      'Country Pack Runtime',
      'Data and AI Workspace',
      'Managed Digital Health Services',
      'Complimentary activation hardware pack',
    ],
    featuredProductSlugs: ['afiax-fhir-cloud', 'country-pack-runtime', 'api-and-integration-hub', 'data-and-ai-workspace'],
    erpnext: {
      itemCode: 'AFX-PAAS-PRO-PUB',
      itemGroup: 'Afiax PaaS Plans',
      subscriptionPlan: 'Afiax PaaS Pro Public Cloud Monthly',
      invoiceCadence: 'Monthly platform subscription with country add-ons or annual enterprise contract',
      usageItems: ['AFX-COUNTRY-ADD', 'AFX-API-REQ-OVER', 'AFX-DATA-GB-OVER', 'AFX-MANAGED-SUPPORT', 'AFX-HW-BUNDLE-INCL'],
    },
  },
  {
    track: 'paas',
    tier: 'platinum',
    deployment: 'public',
    badge: 'PaaS Platinum',
    title: 'Enterprise Ecosystem Platform',
    summary:
      'A managed Afiax Public Cloud platform for high-scale healthcare ecosystems that need country packs, analytics, device integration, and premium operations.',
    monthlyPrice: 12500,
    pricePrefix: 'Starting at',
    audience:
      'Best for large enterprises, multi-country operators, and strategic digital health ecosystems that want premium service on Afiax Public Cloud.',
    commitment:
      'Multi-year platform agreement with premium service windows, advanced analytics, device enablement, and executive operational governance.',
    managedModel:
      'Afiax manages the full public-cloud platform estate, premium operations, service continuity, and advanced platform governance.',
    activationKit: ['20 managed clinical tablets', '6 digital displays', 'Connected-care starter devices and rollout kits'],
    includes: [
      'Everything in Pro',
      'Medical I.O.T Fabric',
      '24/7 enterprise operations',
      'Complimentary activation hardware pack',
    ],
    featuredProductSlugs: [
      'afiax-fhir-cloud',
      'country-pack-runtime',
      'api-and-integration-hub',
      'data-and-ai-workspace',
      'managed-digital-health-services',
      'medical-i-o-t-fabric',
    ],
    erpnext: {
      itemCode: 'AFX-PAAS-PLAT-PUB',
      itemGroup: 'Afiax PaaS Plans',
      subscriptionPlan: 'Afiax PaaS Platinum Public Cloud Contract',
      invoiceCadence: 'Annual or multi-year platform contract with recurring billing and premium service schedule',
      usageItems: ['AFX-COUNTRY-ADD', 'AFX-IOT-DEVICE', 'AFX-PREMIUM-OPS', 'AFX-HW-BUNDLE-INCL'],
    },
  },
  {
    track: 'paas',
    tier: 'basic',
    deployment: 'hybrid',
    badge: 'PaaS Basic',
    title: 'FHIR Platform Core',
    summary:
      'A managed hybrid platform that combines Afiax cloud services with facility, partner, or country-hosted boundary systems.',
    monthlyPrice: 4400,
    audience:
      'Best for organizations modernizing from local systems while keeping a governed FHIR core in Afiax-managed cloud services.',
    commitment:
      'Annual hybrid platform agreement with connectivity design, implementation planning, and managed launch support.',
    managedModel:
      'Afiax manages the cloud core, hybrid integration fabric, monitoring, patching, and platform continuity across the shared boundary.',
    activationKit: ['4 managed clinical tablets', '1 digital display', 'Hybrid site connectivity and intake starter kit'],
    includes: [
      'Afiax FHIR Cloud',
      'API and Integration Hub',
      'Managed hybrid operations',
      'Complimentary activation hardware pack',
    ],
    featuredProductSlugs: ['afiax-fhir-cloud', 'api-and-integration-hub'],
    erpnext: {
      itemCode: 'AFX-PAAS-BASIC-HYB',
      itemGroup: 'Afiax PaaS Plans',
      subscriptionPlan: 'Afiax PaaS Basic Hybrid Monthly',
      invoiceCadence: 'Monthly hybrid subscription or annual platform contract',
      usageItems: ['AFX-API-REQ-OVER', 'AFX-STORAGE-GB-OVER', 'AFX-HYBRID-LINK', 'AFX-HW-BUNDLE-INCL'],
    },
  },
  {
    track: 'paas',
    tier: 'pro',
    deployment: 'hybrid',
    badge: 'PaaS Pro',
    title: 'Country-Ready Platform',
    summary:
      'A managed hybrid platform for enterprises that need country services, analytics, and mixed cloud or local integration boundaries.',
    monthlyPrice: 10400,
    audience:
      'Best for public-sector programs, payer ecosystems, and regulated enterprises with mixed-hosting or phased modernization needs.',
    commitment:
      'Annual hybrid agreement with country onboarding, statutory mapping, integration design, and managed multi-boundary operations.',
    managedModel:
      'Afiax manages the cloud platform, hybrid integration patterns, and operational support while customer or partner systems remain in-place.',
    activationKit: ['10 managed clinical tablets', '3 digital displays', 'Hybrid nursing-station and registration starter kit'],
    includes: [
      'Everything in Basic',
      'Country Pack Runtime',
      'Data and AI Workspace',
      'Managed Digital Health Services',
      'Complimentary activation hardware pack',
    ],
    featuredProductSlugs: ['afiax-fhir-cloud', 'country-pack-runtime', 'api-and-integration-hub', 'data-and-ai-workspace'],
    erpnext: {
      itemCode: 'AFX-PAAS-PRO-HYB',
      itemGroup: 'Afiax PaaS Plans',
      subscriptionPlan: 'Afiax PaaS Pro Hybrid Monthly',
      invoiceCadence: 'Monthly hybrid subscription with country add-ons or annual enterprise contract',
      usageItems: ['AFX-COUNTRY-ADD', 'AFX-HYBRID-LINK', 'AFX-DATA-GB-OVER', 'AFX-MANAGED-SUPPORT', 'AFX-HW-BUNDLE-INCL'],
    },
  },
  {
    track: 'paas',
    tier: 'platinum',
    deployment: 'hybrid',
    badge: 'PaaS Platinum',
    title: 'Enterprise Ecosystem Platform',
    summary:
      'A managed hybrid platform for high-scale healthcare ecosystems that need device integration, analytics, and premium multi-boundary operations.',
    monthlyPrice: 18500,
    pricePrefix: 'Starting at',
    audience:
      'Best for regional networks, strategic payers, and multi-country operators balancing modern cloud services with retained boundary systems.',
    commitment:
      'Multi-year hybrid platform agreement with premium service windows, advanced integration engineering, and executive governance.',
    managedModel:
      'Afiax manages the cloud estate, hybrid boundary controls, premium operations, and service continuity across the wider platform landscape.',
    activationKit: ['20 managed clinical tablets', '6 digital displays', 'Connected-care devices and command-center starter kits'],
    includes: [
      'Everything in Pro',
      'Medical I.O.T Fabric',
      '24/7 enterprise operations',
      'Complimentary activation hardware pack',
    ],
    featuredProductSlugs: [
      'afiax-fhir-cloud',
      'country-pack-runtime',
      'api-and-integration-hub',
      'data-and-ai-workspace',
      'managed-digital-health-services',
      'medical-i-o-t-fabric',
    ],
    erpnext: {
      itemCode: 'AFX-PAAS-PLAT-HYB',
      itemGroup: 'Afiax PaaS Plans',
      subscriptionPlan: 'Afiax PaaS Platinum Hybrid Contract',
      invoiceCadence: 'Annual or multi-year hybrid platform contract with premium billing schedule',
      usageItems: ['AFX-COUNTRY-ADD', 'AFX-HYBRID-LINK', 'AFX-IOT-DEVICE', 'AFX-PREMIUM-OPS', 'AFX-HW-BUNDLE-INCL'],
    },
  },
  {
    track: 'paas',
    tier: 'basic',
    deployment: 'private',
    badge: 'PaaS Basic',
    title: 'FHIR Platform Core',
    summary:
      'A managed Private Afiax Cloud deployment for organizations that need stronger isolation and private networking from the start.',
    monthlyPrice: 7200,
    audience:
      'Best for regulated provider groups and enterprises that want dedicated private-cloud controls around the FHIR platform core.',
    commitment:
      'Annual private-cloud agreement with dedicated environment setup, private networking, and managed launch services.',
    managedModel:
      'Afiax manages the dedicated private-cloud estate, patching, backup, monitoring, and security operations behind private-network controls.',
    activationKit: ['4 managed clinical tablets', '1 digital display', 'Private-site registration and barcode starter kit'],
    includes: [
      'Afiax FHIR Cloud',
      'API and Integration Hub',
      'Managed private-cloud operations',
      'Complimentary activation hardware pack',
    ],
    featuredProductSlugs: ['afiax-fhir-cloud', 'api-and-integration-hub', 'sovereign-health-platform'],
    erpnext: {
      itemCode: 'AFX-PAAS-BASIC-PRI',
      itemGroup: 'Afiax PaaS Plans',
      subscriptionPlan: 'Afiax PaaS Basic Private Cloud Monthly',
      invoiceCadence: 'Monthly dedicated environment subscription or annual private-cloud contract',
      usageItems: ['AFX-PRIVATE-ENV', 'AFX-STORAGE-GB-OVER', 'AFX-PRIVATE-NET', 'AFX-HW-BUNDLE-INCL'],
    },
  },
  {
    track: 'paas',
    tier: 'pro',
    deployment: 'private',
    badge: 'PaaS Pro',
    title: 'Country-Ready Platform',
    summary:
      'A managed Private Afiax Cloud platform for enterprises that need country services, analytics, and dedicated operating boundaries.',
    monthlyPrice: 15800,
    audience:
      'Best for public-sector programs, major payers, and regulated enterprises that need country execution on dedicated private infrastructure.',
    commitment:
      'Annual private-cloud agreement with country onboarding, statutory mapping, dedicated operations, and premium support windows.',
    managedModel:
      'Afiax manages the dedicated environment, country services, security operations, and private-network delivery across the platform estate.',
    activationKit: ['10 managed clinical tablets', '3 digital displays', 'Private-site nursing and registration starter kit'],
    includes: [
      'Everything in Basic',
      'Country Pack Runtime',
      'Data and AI Workspace',
      'Managed Digital Health Services',
      'Complimentary activation hardware pack',
    ],
    featuredProductSlugs: [
      'afiax-fhir-cloud',
      'country-pack-runtime',
      'api-and-integration-hub',
      'data-and-ai-workspace',
      'managed-digital-health-services',
      'sovereign-health-platform',
    ],
    erpnext: {
      itemCode: 'AFX-PAAS-PRO-PRI',
      itemGroup: 'Afiax PaaS Plans',
      subscriptionPlan: 'Afiax PaaS Pro Private Cloud Monthly',
      invoiceCadence: 'Monthly dedicated subscription with country add-ons or annual private-cloud contract',
      usageItems: ['AFX-PRIVATE-ENV', 'AFX-COUNTRY-ADD', 'AFX-DATA-GB-OVER', 'AFX-MANAGED-SUPPORT', 'AFX-HW-BUNDLE-INCL'],
    },
  },
  {
    track: 'paas',
    tier: 'platinum',
    deployment: 'private',
    badge: 'PaaS Platinum',
    title: 'Sovereign Health Platform',
    summary:
      'A managed Private Afiax Cloud platform for national, regulated, and high-scale enterprise healthcare ecosystems that need dedicated control.',
    monthlyPrice: 27500,
    pricePrefix: 'Starting at',
    audience:
      'Best for governments, national schemes, strategic payers, and highly regulated enterprises with strict private-cloud or sovereignty requirements.',
    commitment:
      'Multi-year private-cloud agreement with sovereign architecture, private networking, premium service windows, and executive governance.',
    managedModel:
      'Afiax manages the full dedicated estate, private networking, residency controls, premium operations, and sovereign continuity processes.',
    activationKit: ['20 managed clinical tablets', '6 digital displays', 'Ward, command-center, and connected-care starter devices'],
    includes: [
      'Everything in Pro',
      'Sovereign Health Platform',
      'Medical I.O.T Fabric',
      '24/7 enterprise operations',
      'Complimentary activation hardware pack',
    ],
    featuredProductSlugs: [
      'afiax-fhir-cloud',
      'country-pack-runtime',
      'api-and-integration-hub',
      'data-and-ai-workspace',
      'managed-digital-health-services',
      'medical-i-o-t-fabric',
      'sovereign-health-platform',
    ],
    erpnext: {
      itemCode: 'AFX-PAAS-PLAT-PRI',
      itemGroup: 'Afiax PaaS Plans',
      subscriptionPlan: 'Afiax PaaS Platinum Private Cloud Contract',
      invoiceCadence: 'Annual or multi-year private-cloud contract with milestone and recurring billing',
      usageItems: ['AFX-PRIVATE-ENV', 'AFX-COUNTRY-ADD', 'AFX-IOT-DEVICE', 'AFX-PREMIUM-OPS', 'AFX-HW-BUNDLE-INCL'],
    },
  },
];

export function getPricingPlan(
  track: OfferingTrack,
  tier: PlanTier,
  deployment: PaaSDeploymentModel = 'public'
): PricingPlanOffer | undefined {
  return pricingPlanOffers.find(
    (offer) => offer.track === track && offer.tier === tier && (track === 'paas' ? offer.deployment === deployment : !offer.deployment)
  );
}

export function getProductsBySlugs(slugs: readonly string[]): CatalogProduct[] {
  return slugs.map((slug) => getCatalogProductBySlug(slug)).filter((product): product is CatalogProduct => Boolean(product));
}

export const erpnextBillingFlow: DetailEntry[] = [
  {
    term: 'Quote and subscription',
    description: 'ERPNext will own the commercial record for quotes, accepted plans, subscription schedules, and contract-linked recurring invoices.',
  },
  {
    term: 'Usage and overages',
    description: 'API requests, storage, tele-health minutes, patient overages, devices, and country-pack add-ons should be posted as ERPNext usage or recurring invoice line items.',
  },
  {
    term: 'Deployment and hardware',
    description:
      'ERPNext plans should distinguish Afiax Public Cloud, Hybrid, and Private Afiax Cloud packages, while complimentary tablets, displays, and activation-device bundles are tracked as included promotional items for fulfillment visibility.',
  },
  {
    term: 'Implementation and services',
    description: 'Readiness, onboarding, statutory mapping, premium support, and managed-service work should land as separate ERPNext service items rather than being hidden in plan copy.',
  },
  {
    term: 'Collections and reporting',
    description: 'ERPNext should remain the billing system of record for invoicing, payment tracking, renewal reporting, and finance-facing commercial visibility.',
  },
];
