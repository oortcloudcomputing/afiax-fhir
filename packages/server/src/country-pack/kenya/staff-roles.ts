// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya staff roles: each role is a menu (a UserConfiguration, read by GET /auth/me and rendered by
// the provider app) plus an AccessPolicy that enforces the same scoping on the server. Menus are not
// security; the AccessPolicy is. Front desk and cashier staff see demographics, visits, cover, bills
// and claims but no clinical record. Clinical roles read the record and write only what their job
// needs. The facility admin is a project admin with no AccessPolicy.

import type { WithId } from '@medplum/core';
import { createReference, Operator } from '@medplum/core';
import type {
  AccessPolicy,
  AccessPolicyResource,
  Reference,
  UserConfiguration,
  UserConfigurationMenu,
} from '@medplum/fhirtypes';
import type { Repository } from '../../fhir/repo';

/** Tag on the seeded AccessPolicy and UserConfiguration resources: code = role code. */
export const KenyaStaffRoleSystem = 'https://afiax.africa/kenya/staff-role';
/** UserConfiguration.option id that carries the role code, for the apps. */
export const KenyaStaffRoleOption = 'kenyaStaffRole';

export type KenyaStaffRoleCode =
  | 'front-desk'
  | 'nurse'
  | 'clinician'
  | 'pharmacy'
  | 'laboratory'
  | 'department'
  | 'cashier'
  | 'facility-admin';

export interface KenyaStaffRole {
  readonly code: KenyaStaffRoleCode;
  readonly display: string;
  readonly description: string;
  /** Project admin (the facility admin). Admins have no AccessPolicy. */
  readonly admin?: boolean;
  readonly menu: UserConfigurationMenu[];
  /** AccessPolicy resource rules; undefined for admins. */
  readonly resources?: AccessPolicyResource[];
}

const write = (...types: string[]): AccessPolicyResource[] => types.map((resourceType) => ({ resourceType }));
const read = (...types: string[]): AccessPolicyResource[] =>
  types.map((resourceType) => ({ resourceType, readonly: true }));

/** Directory and terminology everyone needs to read. */
const reference = read(
  'Practitioner',
  'PractitionerRole',
  'Organization',
  'Location',
  'HealthcareService',
  'Endpoint',
  'ValueSet',
  'CodeSystem',
  'ConceptMap',
  'Questionnaire',
  'PlanDefinition',
  'ActivityDefinition',
  'ChargeItemDefinition',
  'Medication',
  'Schedule',
  'Slot'
);

/** Clinical record types: read by clinical roles, never by front desk or cashier. */
const clinicalTypes = [
  'Condition',
  'Observation',
  'AllergyIntolerance',
  'FamilyMemberHistory',
  'Procedure',
  'ClinicalImpression',
  'DiagnosticReport',
  'ServiceRequest',
  'MedicationRequest',
  'MedicationStatement',
  'MedicationDispense',
  'MedicationAdministration',
  'Immunization',
  'CarePlan',
  'CareTeam',
  'Goal',
  'DocumentReference',
  'QuestionnaireResponse',
  'DetectedIssue',
  'Flag',
  'Specimen',
  'ImagingStudy',
  'Media',
  'Composition',
  'Binary',
];

/**
 * Clinical types read-only, except those listed, which the role may write.
 * @param writable - The clinical types this role may write.
 * @returns The AccessPolicy resource rules.
 */
function clinical(...writable: string[]): AccessPolicyResource[] {
  return clinicalTypes.map((resourceType) =>
    writable.includes(resourceType) ? { resourceType } : { resourceType, readonly: true }
  );
}

const patients = { name: 'Patients', target: '/Patient?_count=20&_sort=-_lastUpdated' };
const newPatient = { name: 'New patient', target: '/onboarding' };
const schedule = { name: 'Schedule', target: '/schedule' };
const tasks = { name: 'My tasks', target: '/Task?_sort=-_lastUpdated&status=requested,accepted,in-progress' };
const messages = { name: 'Messages', target: '/Communication?status=in-progress' };
const visits = { name: 'Visits', target: '/Encounter?_sort=-date&status=arrived,triaged,in-progress' };
const cover = { name: 'Insurance cover', target: '/Coverage?_sort=-_lastUpdated' };
const bills = { name: 'Bills', target: '/Invoice?_sort=-date' };
const claims = { name: 'Claims', target: '/Claim?_sort=-created' };
const queue = (department: string, name: string): { name: string; target: string } => ({
  name,
  target: `/kenya/queue/${department}`,
});

export const KenyaStaffRoles: readonly KenyaStaffRole[] = [
  {
    code: 'front-desk',
    display: 'Front desk',
    description: 'Registers patients, adds SHA cover and starts visits. No access to the clinical record.',
    menu: [{ title: 'Front desk', link: [patients, newPatient, visits, schedule, cover] }],
    resources: [
      ...write('Patient', 'RelatedPerson', 'Person', 'Encounter', 'Appointment', 'Coverage'),
      ...write('CoverageEligibilityRequest', 'CoverageEligibilityResponse', 'Task', 'Communication'),
      ...read('Claim', 'ClaimResponse', 'Invoice'),
      ...reference,
    ],
  },
  {
    code: 'nurse',
    display: 'Nurse',
    description: 'Triage, vital signs, nursing notes and medicines given. Reads orders but does not prescribe.',
    menu: [{ title: 'Nursing', link: [patients, visits, tasks, messages] }],
    resources: [
      ...write('Patient', 'RelatedPerson', 'Encounter', 'Appointment', 'Task', 'Communication'),
      ...clinical(
        'Observation',
        'AllergyIntolerance',
        'FamilyMemberHistory',
        'MedicationAdministration',
        'Immunization',
        'DocumentReference',
        'QuestionnaireResponse',
        'ClinicalImpression',
        'Binary'
      ),
      ...read('Coverage'),
      ...reference,
    ],
  },
  {
    code: 'clinician',
    display: 'Clinician',
    description: 'Diagnoses, orders and prescribes. Full clinical record.',
    menu: [{ title: 'Clinical', link: [patients, newPatient, visits, schedule, tasks, messages] }],
    resources: [
      ...write('Patient', 'RelatedPerson', 'Encounter', 'Appointment', 'Task', 'Communication', 'ChargeItem'),
      ...clinical(...clinicalTypes),
      ...read('Coverage', 'CoverageEligibilityResponse', 'Claim', 'ClaimResponse'),
      ...reference,
    ],
  },
  {
    code: 'pharmacy',
    display: 'Pharmacy',
    description: 'Works the pharmacy queue and dispenses prescriptions.',
    menu: [{ title: 'Pharmacy', link: [queue('pharmacy', 'Pharmacy queue'), patients, tasks] }],
    resources: [
      ...read('Patient', 'Encounter'),
      ...write('Task', 'ChargeItem', 'Communication'),
      ...clinical('MedicationDispense'),
      ...reference,
    ],
  },
  {
    code: 'laboratory',
    display: 'Laboratory',
    description: 'Works the laboratory queue: specimens, results and reports.',
    menu: [{ title: 'Laboratory', link: [queue('laboratory', 'Laboratory queue'), patients, tasks] }],
    resources: [
      ...read('Patient', 'Encounter'),
      ...write('Task', 'Communication'),
      ...clinical('Observation', 'DiagnosticReport', 'Specimen', 'DocumentReference', 'Binary'),
      ...reference,
    ],
  },
  {
    code: 'department',
    display: 'Radiology and other departments',
    description: 'Radiology, physiotherapy, nutrition, social work and counselling queues.',
    menu: [
      {
        title: 'Departments',
        link: [
          queue('radiology', 'Radiology queue'),
          queue('physiotherapy', 'Physiotherapy queue'),
          queue('nutrition', 'Nutrition queue'),
          queue('social-work', 'Social work queue'),
          queue('counselling', 'Counselling queue'),
          patients,
          tasks,
        ],
      },
    ],
    resources: [
      ...read('Patient', 'Encounter'),
      ...write('Task', 'Communication'),
      ...clinical(
        'Observation',
        'DiagnosticReport',
        'ImagingStudy',
        'Media',
        'Procedure',
        'DocumentReference',
        'Binary'
      ),
      ...reference,
    ],
  },
  {
    code: 'cashier',
    display: 'Cashier',
    description:
      'Bills visits, takes payments, submits SHA claims and records SHA remittances. No access to the clinical record.',
    menu: [{ title: 'Billing', link: [patients, bills, claims, cover] }],
    resources: [
      ...read('Patient', 'Encounter'),
      ...write('ChargeItem', 'Invoice', 'PaymentNotice', 'Account', 'Claim', 'ClaimResponse', 'Task'),
      ...write('Coverage', 'CoverageEligibilityRequest', 'CoverageEligibilityResponse'),
      // SHA remittances (PaymentReconciliation/$kenya-sha-remittance)
      ...write('PaymentReconciliation'),
      ...reference,
    ],
  },
  {
    code: 'facility-admin',
    display: 'Facility admin',
    description: 'Manages staff, roles and the facility set-up. Project administrator.',
    admin: true,
    menu: [
      { title: 'Clinical', link: [patients, visits, schedule] },
      { title: 'Billing', link: [bills, claims] },
      {
        title: 'Admin',
        link: [
          { name: 'Staff and invites', target: '/admin/project' },
          { name: 'Country Pack Settings', target: '/admin/settings' },
        ],
      },
    ],
  },
];

export function getKenyaStaffRole(code: string | undefined): KenyaStaffRole | undefined {
  return KenyaStaffRoles.find((r) => r.code === code);
}

export interface KenyaStaffRoleResources {
  readonly role: KenyaStaffRole;
  readonly userConfiguration: Reference<UserConfiguration>;
  readonly accessPolicy?: Reference<AccessPolicy>;
}

/**
 * Builds the UserConfiguration for a role.
 * @param role - The staff role.
 * @returns The UserConfiguration (without id).
 */
export function buildKenyaStaffRoleConfiguration(role: KenyaStaffRole): UserConfiguration {
  return {
    resourceType: 'UserConfiguration',
    meta: { tag: [{ system: KenyaStaffRoleSystem, code: role.code, display: role.display }] },
    name: `Kenya: ${role.display}`,
    menu: role.menu,
    option: [{ id: KenyaStaffRoleOption, valueString: role.code }],
  };
}

/**
 * Builds the AccessPolicy for a role.
 * @param role - The staff role (must not be an admin role).
 * @returns The AccessPolicy (without id).
 */
export function buildKenyaStaffRoleAccessPolicy(role: KenyaStaffRole): AccessPolicy {
  return {
    resourceType: 'AccessPolicy',
    meta: { tag: [{ system: KenyaStaffRoleSystem, code: role.code, display: role.display }] },
    name: `Kenya: ${role.display}`,
    resource: role.resources,
  };
}

/**
 * Creates or updates every role's UserConfiguration and AccessPolicy in a project, so they match the
 * current definitions. Safe to run again: existing resources (found by tag) are updated in place, so
 * memberships keep pointing at them.
 * @param repo - A repository scoped to the project (the project admin's).
 * @returns Each role with references to its resources.
 */
export async function ensureKenyaStaffRoles(repo: Repository): Promise<KenyaStaffRoleResources[]> {
  const result: KenyaStaffRoleResources[] = [];
  for (const role of KenyaStaffRoles) {
    const userConfiguration = await upsertTagged(repo, role, buildKenyaStaffRoleConfiguration(role));
    const accessPolicy = role.admin ? undefined : await upsertTagged(repo, role, buildKenyaStaffRoleAccessPolicy(role));
    result.push({
      role,
      userConfiguration: createReference(userConfiguration),
      accessPolicy: accessPolicy ? createReference(accessPolicy) : undefined,
    });
  }
  return result;
}

async function upsertTagged<T extends UserConfiguration | AccessPolicy>(
  repo: Repository,
  role: KenyaStaffRole,
  resource: T
): Promise<WithId<T>> {
  const existing = await repo.searchOne<T>({
    resourceType: resource.resourceType,
    filters: [{ code: '_tag', operator: Operator.EQUALS, value: `${KenyaStaffRoleSystem}|${role.code}` }],
  });
  if (existing) {
    return repo.updateResource<T>({
      ...resource,
      id: existing.id,
      meta: { ...existing.meta, tag: resource.meta?.tag },
    });
  }
  return repo.createResource<T>(resource);
}
