// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

import type { Metric } from './site-content';

export type DeviceFormFactor = 'phone' | 'tablet' | 'screen';
export type ExperienceAccent = 'gold' | 'teal' | 'clay';
export type ExperienceScene =
  | 'clinical-command'
  | 'bedside-chart'
  | 'mobile-rounding'
  | 'automation-mesh'
  | 'intake-orbit'
  | 'executive-ops'
  | 'terminology-fabric'
  | 'imaging-flow';

export interface ExperienceAsset {
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly signal: string;
  readonly highlights: readonly string[];
  readonly alt: string;
  readonly scene: ExperienceScene;
  readonly formFactor: DeviceFormFactor;
  readonly accent: ExperienceAccent;
}

export interface AboutPillar {
  readonly eyebrow: string;
  readonly title: string;
  readonly body: string;
}

export interface TeamUnit {
  readonly title: string;
  readonly summary: string;
  readonly focus: readonly string[];
}

export interface TeamPrinciple {
  readonly title: string;
  readonly body: string;
}

export interface DeviceFamily {
  readonly eyebrow: string;
  readonly title: string;
  readonly summary: string;
  readonly suitedFor: string;
  readonly includes: readonly string[];
  readonly pairedProductTitles: readonly string[];
  readonly previewAsset: ExperienceAsset;
}

export interface DeviceProgram {
  readonly title: string;
  readonly summary: string;
}

export const experienceAssets = {
  clinicalWorkspace: {
    eyebrow: 'Clinical workspace',
    title: 'Enterprise clinical operations',
    summary:
      'Desktop and nurse-station experiences bring registration, charting, order workflows, and documentation onto one governed operational surface.',
    signal: 'Command center ready',
    highlights: ['Orders and charting', 'Patient flow oversight', 'Role-based command views'],
    alt: 'Afiax clinical workspace shown on a large desktop display.',
    scene: 'clinical-command',
    formFactor: 'screen',
    accent: 'gold',
  },
  chartingSuite: {
    eyebrow: 'Tablet workflows',
    title: 'Bedside and consult charting',
    summary:
      'Ward teams and roaming clinicians can move from patient review to structured charting on a tablet-first interface without breaking continuity.',
    signal: 'Ward-ready tablet surface',
    highlights: ['Structured charting', 'Medication review', 'Consultation handoff'],
    alt: 'Afiax charting workflows shown on a tablet.',
    scene: 'bedside-chart',
    formFactor: 'tablet',
    accent: 'teal',
  },
  mobileRounding: {
    eyebrow: 'Mobile care',
    title: 'Phone-led rounding and review',
    summary:
      'Clinicians, community teams, and on-call staff can review updates, complete quick actions, and stay connected while moving across care settings.',
    signal: 'Mobile care orchestration',
    highlights: ['Alerts and escalations', 'Remote review', 'Field-team continuity'],
    alt: 'Afiax mobile rounding experience shown on a phone.',
    scene: 'mobile-rounding',
    formFactor: 'phone',
    accent: 'clay',
  },
  automationConsole: {
    eyebrow: 'Workflow automation',
    title: 'Automation and orchestration consoles',
    summary:
      'Operational teams can watch background workflows, integration activity, and automation outcomes from the same enterprise command layer.',
    signal: 'Managed workflow mesh',
    highlights: ['Connector health', 'Automation status', 'Exception tracking'],
    alt: 'Afiax automation console shown on an enterprise display.',
    scene: 'automation-mesh',
    formFactor: 'screen',
    accent: 'teal',
  },
  intakeFlow: {
    eyebrow: 'Digital intake',
    title: 'Patient onboarding and intake',
    summary:
      'New patient, triage, and registration journeys can be streamlined across guided forms, assisted intake, and operational review queues.',
    signal: 'Front-door digital intake',
    highlights: ['Guided registration', 'Triage readiness', 'Queue coordination'],
    alt: 'Afiax patient intake workflow shown on a tablet device.',
    scene: 'intake-orbit',
    formFactor: 'tablet',
    accent: 'gold',
  },
  executiveConsole: {
    eyebrow: 'Operational visibility',
    title: 'Executive and service dashboards',
    summary:
      'Leadership, operations, and managed-service teams can monitor performance, access, exceptions, and throughput from a unified visibility layer.',
    signal: 'Executive visibility layer',
    highlights: ['Service posture', 'Portfolio metrics', 'Operational pulse'],
    alt: 'Afiax executive console shown on a widescreen display.',
    scene: 'executive-ops',
    formFactor: 'screen',
    accent: 'clay',
  },
  terminologyWorkflow: {
    eyebrow: 'Interoperability tooling',
    title: 'Terminology and data harmonization',
    summary:
      'Terminology, mapping, and data quality operations can be executed through dedicated workflow surfaces that keep country adaptation disciplined.',
    signal: 'Country-pack harmonization',
    highlights: ['Terminology mapping', 'Data quality', 'Profile alignment'],
    alt: 'Afiax terminology workflow shown on a tablet display.',
    scene: 'terminology-fabric',
    formFactor: 'tablet',
    accent: 'teal',
  },
  imagingLoop: {
    eyebrow: 'Diagnostic imaging',
    title: 'Imaging review and collaboration',
    summary:
      'Diagnostic teams can review imaging, coordinate reading workflows, and connect imaging activity back into the wider enterprise record.',
    signal: 'Diagnostic review station',
    highlights: ['Study coordination', 'Reading workflow', 'Shared enterprise record'],
    alt: 'Afiax imaging review experience shown on a clinical display.',
    scene: 'imaging-flow',
    formFactor: 'screen',
    accent: 'gold',
  },
} as const satisfies Record<string, ExperienceAsset>;

export const homepageHeroAssets: readonly ExperienceAsset[] = [
  experienceAssets.clinicalWorkspace,
  experienceAssets.chartingSuite,
  experienceAssets.mobileRounding,
];

export const homepageExperienceAssets: readonly ExperienceAsset[] = [
  experienceAssets.automationConsole,
  experienceAssets.intakeFlow,
  experienceAssets.executiveConsole,
];

export const aboutExperienceAssets: readonly ExperienceAsset[] = [
  experienceAssets.clinicalWorkspace,
  experienceAssets.automationConsole,
  experienceAssets.terminologyWorkflow,
];

export const deviceShowcaseAssets: readonly ExperienceAsset[] = [
  experienceAssets.imagingLoop,
  experienceAssets.chartingSuite,
  experienceAssets.mobileRounding,
];

export const aboutMetrics: Metric[] = [
  {
    label: 'Corporate focus',
    value: 'Enterprise healthcare products, platform services, and field-ready delivery',
  },
  {
    label: 'Architecture stance',
    value: 'Canonical FHIR, explicit country adaptation, and governed extensions',
  },
  {
    label: 'Market context',
    value: 'Pan-African by design with Kenya as the active execution path',
  },
  {
    label: 'Experience layer',
    value: 'Phone, tablet, workstation, kiosk, and diagnostic display programs',
  },
];

export const teamMetrics: Metric[] = [
  {
    label: 'Team model',
    value: 'Clinical, platform, interoperability, migration, and service-operations teams',
  },
  {
    label: 'Delivery rhythm',
    value: 'Readiness, migration, rollout, training, and managed support',
  },
  {
    label: 'Execution posture',
    value: 'Architecture-led, implementation-aware, and country-disciplined',
  },
  {
    label: 'Customer coverage',
    value: 'Providers, programs, payer operations, and partner ecosystems',
  },
];

export const deviceMetrics: Metric[] = [
  {
    label: 'Device catalog',
    value: 'Phones, tablets, nurse-station displays, diagnostic consoles, and self-service kits',
  },
  {
    label: 'Managed rollout',
    value: 'Provisioning, configuration, asset tagging, training, and replacement planning',
  },
  {
    label: 'PaaS activation',
    value: 'Managed PaaS includes free tablets, displays, and launch bundles',
  },
  {
    label: 'Care settings',
    value: 'Facility, bedside, community, diagnostic, and remote-care environments',
  },
];

export const aboutPillars: AboutPillar[] = [
  {
    eyebrow: 'Open foundation',
    title: 'Build on an open, interoperable clinical core.',
    body:
      'Afiax is structured around a canonical FHIR record so applications, services, and national interoperability do not each create their own incompatible truth.',
  },
  {
    eyebrow: 'Operational cohesion',
    title: 'Connect products, workflows, and devices across the enterprise.',
    body:
      'The platform is designed to keep front-office, clinical, imaging, revenue, and patient-facing experiences coordinated around one operating record.',
  },
  {
    eyebrow: 'Country-aware scale',
    title: 'Expand by adding country packs rather than rebuilding the platform.',
    body:
      'That keeps Kenya-specific execution disciplined while preserving a pan-African architecture that can support additional markets over time.',
  },
  {
    eyebrow: 'Managed delivery',
    title: 'Pair software with onboarding, migration, devices, and support.',
    body:
      'Afiax is presented as a delivery program, not just a software license, so customers can move from domain, onboarding, and migration into stable operations.',
  },
];

export const teamUnits: TeamUnit[] = [
  {
    title: 'Clinical transformation',
    summary: 'Translates operating requirements into care-delivery workflows, forms, templates, and rollout plans.',
    focus: ['Clinical readiness and workflow mapping', 'Go-live support and adoption planning', 'Policy, training, and operating model alignment'],
  },
  {
    title: 'Platform engineering',
    summary: 'Builds the canonical FHIR platform, core product services, and the enterprise web and onboarding surfaces around it.',
    focus: ['Core services and APIs', 'Application architecture and UX systems', 'Security, cloud, and release discipline'],
  },
  {
    title: 'Country interoperability',
    summary: 'Implements registry, payer, terminology, and compliance flows through explicit country-pack boundaries.',
    focus: ['Country-pack integration contracts', 'Payer, registry, and claims connectors', 'Terminology, conformance, and exchange logic'],
  },
  {
    title: 'Migration and data services',
    summary: 'Owns legacy system extraction, data quality, mapping, reconciliation, and validation programs.',
    focus: ['OpenMRS and KenyaEMR migration paths', 'Structured file and database migration pipelines', 'Cutover rehearsal and data assurance'],
  },
  {
    title: 'Managed operations',
    summary: 'Runs support, monitoring, continuity, and customer-operating relationships after launch.',
    focus: ['24/7 support and service operations', 'Platform monitoring and continuity controls', 'Billing, commercial, and onboarding coordination'],
  },
  {
    title: 'Device enablement',
    summary: 'Prepares phones, tablets, large displays, and care kits so the software lands in a ready-to-use field environment.',
    focus: ['Provisioning and asset preparation', 'Facility, bedside, and mobile deployment kits', 'Replacement, accessories, and endpoint support'],
  },
];

export const teamPrinciples: TeamPrinciple[] = [
  {
    title: 'Build one platform story',
    body: 'Clinical, interoperability, device, and service teams should reinforce one platform meaning instead of fragmenting the customer experience.',
  },
  {
    title: 'Deliver with country context',
    body: 'Execution should be explicit about market context, regulator boundaries, and enterprise operating discipline rather than relying on generic global claims.',
  },
  {
    title: 'Make deployment tangible',
    body: 'Software, onboarding, devices, and training should be presented as one operating move from day one.',
  },
];

export const deviceFamilies: DeviceFamily[] = [
  {
    eyebrow: 'Phone kit',
    title: 'Clinician mobile kits',
    summary: 'Smartphones configured for rounding, tele-health coordination, alerts, and field-service workflows.',
    suitedFor: 'Community teams, on-call clinicians, supervisors, and mobile care programs.',
    includes: ['Managed device setup', 'Protective accessories and charging kit', 'Secure access and launch configuration'],
    pairedProductTitles: ['Afiax Tele-Healthcare', 'Afiax Remote Care'],
    previewAsset: experienceAssets.mobileRounding,
  },
  {
    eyebrow: 'Tablet kit',
    title: 'Consultation and ward tablets',
    summary: 'Touch-first tablets prepared for consultation rooms, bedside charting, patient intake, and care coordination.',
    suitedFor: 'Consult rooms, nursing stations, triage desks, and bedside documentation.',
    includes: ['Tablet enrollment and MDM setup', 'Protective case and charging dock', 'Role-based workflow configuration'],
    pairedProductTitles: ['Afiax EHR', 'Patient Portals'],
    previewAsset: experienceAssets.chartingSuite,
  },
  {
    eyebrow: 'Display program',
    title: 'Nurse-station and executive displays',
    summary: 'Large displays for command centers, nursing oversight, operations dashboards, and patient-flow visibility.',
    suitedFor: 'Operations rooms, nurse stations, executive review spaces, and shared care teams.',
    includes: ['Display provisioning and mount planning', 'Dashboard startup configuration', 'Operational review templates'],
    pairedProductTitles: ['Healthcare Financial Services', 'Managed Digital Health Services'],
    previewAsset: experienceAssets.executiveConsole,
  },
  {
    eyebrow: 'Imaging console',
    title: 'Diagnostic review stations',
    summary: 'High-visibility stations aligned with diagnostic and imaging workflows that need larger working surfaces.',
    suitedFor: 'Radiology, diagnostics, review boards, and imaging-heavy service lines.',
    includes: ['Display calibration guidance', 'Workflow and viewer setup', 'Managed continuity and endpoint support'],
    pairedProductTitles: ['Afiax Medical Imaging'],
    previewAsset: experienceAssets.imagingLoop,
  },
  {
    eyebrow: 'Patient access',
    title: 'Self-service and bedside access points',
    summary: 'Kiosks, bedside tablets, and patient-facing access devices for check-in, education, and communication.',
    suitedFor: 'Reception, waiting areas, inpatient bedside, and guided patient journeys.',
    includes: ['Branding and language setup', 'Accessory and stand kit', 'Remote update and support plan'],
    pairedProductTitles: ['Patient Portals', 'Afiax EHR'],
    previewAsset: experienceAssets.intakeFlow,
  },
  {
    eyebrow: 'Home care bundle',
    title: 'Remote monitoring activation bundles',
    summary: 'Home-device and RPM kits to support connected chronic care, triage, and clinician review workflows.',
    suitedFor: 'Remote care programs, chronic disease pathways, and post-discharge monitoring.',
    includes: ['Device activation support', 'Connectivity and alert configuration', 'Program launch collateral and guides'],
    pairedProductTitles: ['Afiax Remote Care'],
    previewAsset: experienceAssets.mobileRounding,
  },
];

export const devicePrograms: DeviceProgram[] = [
  {
    title: 'Free activation kits with managed PaaS',
    summary:
      'Every managed PaaS offer can launch with free tablets, displays, and starter digital health accessories so customers move into a real operating environment faster.',
  },
  {
    title: 'Provisioning and managed updates',
    summary:
      'Devices are prepared with role-based setup, secure access, network assumptions, and support baselines before they reach the care environment.',
  },
  {
    title: 'Migration-aware rollout',
    summary:
      'Device deployment can be synchronized with domain onboarding, legacy migration, training, and ERPNext lead-to-customer handoff so rollout steps stay aligned.',
  },
];
