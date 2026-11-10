// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA visit consent and start visit on an Encounter (Kenya), through the DHA HIE middleware.
// See country-pack/kenya/hie-visit.ts for the DHA flow these operations follow.
import {
  AccessPolicyInteraction,
  allOk,
  badRequest,
  createReference,
  forbidden,
  KenyaClientRegistryIdSystem,
  normalizeErrorString,
  OperationOutcomeError,
  resolveId,
} from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Encounter, Extension, OperationDefinition, Organization, Patient } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type { KenyaAfyaLinkCredentials } from '../../country-pack/kenya/afyalink';
import { getKenyaAfyaLinkCredentials } from '../../country-pack/kenya/afyalink';
import type { KenyaShaVisitType } from '../../country-pack/kenya/hie-coverage';
import {
  getKenyaHieBenefits,
  getKenyaHieInterventions,
  getKenyaHieSubBenefits,
  getKenyaHieUtilization,
} from '../../country-pack/kenya/hie-coverage';
import type { KenyaHieStartVisitInput, KenyaShaServiceType } from '../../country-pack/kenya/hie-visit';
import {
  createKenyaHieBiometricsAuthorization,
  getKenyaHieAuthorizations,
  getKenyaHiePatientContacts,
  KenyaHieRequestError,
  KenyaShaServiceTypes,
  rejectKenyaHieAuthorization,
  sendKenyaHieVisitOtp,
  startKenyaHieVisit,
} from '../../country-pack/kenya/hie-visit';
import { getProjectCountryPack } from '../../country-pack/registry';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const KenyaShaVisitExtension = {
  url: 'https://afiax.africa/fhir/StructureDefinition/kenya-sha-visit',
  claimId: 'claimId',
  consentToken: 'consentToken',
  authorizationGuid: 'authorizationGuid',
  visitNumber: 'visitNumber',
  serviceType: 'serviceType',
  consentMethod: 'consentMethod',
  interventionCode: 'interventionCode',
  workflowState: 'workflowState',
  schemeName: 'schemeName',
  startedAt: 'startedAt',
} as const;

export const KenyaShaVisitClaimIdSystem = 'https://afiax.africa/kenya/identifier/sha-visit-claim-id';

const FacilityFrCodePattern = /^FID-[\w-]+$/i;

export const kenyaVisitConsentOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'encounter-kenya-visit-consent',
  name: 'KenyaVisitConsent',
  title: 'Capture SHA visit consent for an encounter: OTP or fingerprints (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-visit-consent',
  resource: ['Encounter'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    {
      use: 'in',
      name: 'action',
      type: 'code',
      min: 1,
      max: '1',
      documentation: 'contacts | send-otp | authorize-biometrics | authorization-status | cancel-authorization',
    },
    { use: 'in', name: 'interventionCode', type: 'string', min: 0, max: '*' },
    { use: 'in', name: 'serviceType', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'contactId', type: 'integer', min: 0, max: '1' },
    { use: 'in', name: 'workStationId', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'agentId', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'deviceOs', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'facilityFrCode', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'authorizationGuid', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'consentToken', type: 'string', min: 0, max: '1' },
    { use: 'out', name: 'result', type: 'string', min: 1, max: '1', documentation: 'The DHA result, as JSON.' },
  ],
};

export const kenyaStartVisitOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'encounter-kenya-start-visit',
  name: 'KenyaStartVisit',
  title: 'Start the SHA visit for an encounter after consent (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-start-visit',
  resource: ['Encounter'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'serviceType', type: 'code', min: 1, max: '1' },
    { use: 'in', name: 'interventionCode', type: 'string', min: 1, max: '*' },
    { use: 'in', name: 'otp', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'authorizationGuid', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'practitionerIdentificationType', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'practitionerIdentificationNumber', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'practitionerRegulator', type: 'code', min: 0, max: '1' },
    { use: 'out', name: 'encounter', type: 'Reference', min: 1, max: '1' },
    { use: 'out', name: 'result', type: 'string', min: 1, max: '1', documentation: 'The DHA visit, as JSON.' },
  ],
};

export const kenyaShaCoverageOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'encounter-kenya-sha-coverage',
  name: 'KenyaShaCoverage',
  title:
    "Look up the patient's SHA coverage for an encounter: benefits, sub-benefits, interventions, utilization (Kenya)",
  status: 'active',
  kind: 'operation',
  code: 'kenya-sha-coverage',
  resource: ['Encounter'],
  system: false,
  type: false,
  instance: true,
  affectsState: false,
  parameter: [
    {
      use: 'in',
      name: 'action',
      type: 'code',
      min: 1,
      max: '1',
      documentation: 'benefits | sub-benefits | interventions | utilization',
    },
    {
      use: 'in',
      name: 'visitType',
      type: 'code',
      min: 0,
      max: '1',
      documentation: 'OP | IP. Defaults from Encounter.class (IMP = IP, else OP).',
    },
    { use: 'in', name: 'parentBenefitCode', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'subBenefitCode', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'interventionCode', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'search', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'page', type: 'integer', min: 0, max: '1' },
    { use: 'in', name: 'pageSize', type: 'integer', min: 0, max: '1' },
    { use: 'out', name: 'result', type: 'string', min: 1, max: '1', documentation: 'The DHA result, as JSON.' },
  ],
};

interface ShaCoverageParameters {
  readonly action: string;
  readonly visitType?: string;
  readonly parentBenefitCode?: string;
  readonly subBenefitCode?: string;
  readonly interventionCode?: string;
  readonly search?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

interface VisitConsentParameters {
  readonly action: string;
  readonly interventionCode?: string[];
  readonly serviceType?: string;
  readonly contactId?: number;
  readonly workStationId?: string;
  readonly agentId?: string;
  readonly deviceOs?: string;
  readonly facilityFrCode?: string;
  readonly authorizationGuid?: string;
  readonly consentToken?: string;
}

interface StartVisitParameters {
  readonly serviceType: string;
  readonly interventionCode: string[];
  readonly otp?: string;
  readonly authorizationGuid?: string;
  readonly practitionerIdentificationType?: string;
  readonly practitionerIdentificationNumber?: string;
  readonly practitionerRegulator?: string;
}

interface VisitContext {
  readonly encounter: Encounter & { id: string };
  readonly patientCrId: string;
  readonly credentials: KenyaAfyaLinkCredentials;
}

function asArray(value: string[] | string | undefined): string[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function parseServiceType(value: string | undefined): KenyaShaServiceType {
  const normalized = value?.trim().toUpperCase();
  if (!normalized || !KenyaShaServiceTypes.includes(normalized as KenyaShaServiceType)) {
    throw new OperationOutcomeError(badRequest(`serviceType must be one of ${KenyaShaServiceTypes.join(', ')}`));
  }
  return normalized as KenyaShaServiceType;
}

function getExistingVisit(encounter: Encounter): Extension | undefined {
  return encounter.extension?.find((extension) => extension.url === KenyaShaVisitExtension.url);
}

/**
 * Loads the Encounter as the caller (so their access policy applies), checks they may update it,
 * and resolves the patient's Client Registry ID and the project's HIE credentials.
 * @param req - The FHIR request.
 * @returns The visit context.
 */
async function loadVisitContext(req: FhirRequest): Promise<VisitContext> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  const profileType = ctx.profile.reference?.split('/')[0];
  if (profileType !== 'Practitioner' || !ctx.repo.supportsInteraction(AccessPolicyInteraction.UPDATE, 'Encounter')) {
    throw new OperationOutcomeError(forbidden);
  }

  const encounter = (await ctx.repo.readResource<Encounter>('Encounter', req.params.id)) as Encounter & { id: string };
  const patientId = resolveId(encounter.subject);
  if (!patientId || !encounter.subject?.reference?.startsWith('Patient/')) {
    throw new OperationOutcomeError(badRequest('The encounter has no patient.'));
  }
  const patient = await ctx.repo.readResource<Patient>('Patient', patientId);
  const patientCrId = patient.identifier?.find((id) => id.system === KenyaClientRegistryIdSystem)?.value?.trim();
  if (!patientCrId) {
    throw new OperationOutcomeError(
      badRequest(
        'The patient has no DHA Client Registry ID. Look the patient up in the Client Registry before starting an SHA visit.'
      )
    );
  }

  return { encounter, patientCrId, credentials: getKenyaAfyaLinkCredentials(ctx.project) };
}

async function resolveFacility(
  context: VisitContext,
  facilityFrCode: string | undefined
): Promise<{ frCode: string; name: string }> {
  const ctx = getAuthenticatedContext();
  let organization: Organization | undefined;
  const organizationId = resolveId(context.encounter.serviceProvider);
  if (organizationId && context.encounter.serviceProvider?.reference?.startsWith('Organization/')) {
    organization = await ctx.repo.readResource<Organization>('Organization', organizationId);
  }
  const frCode =
    facilityFrCode?.trim() ||
    context.credentials.facilityId ||
    organization?.identifier?.find((id) => id.value && FacilityFrCodePattern.test(id.value.trim()))?.value?.trim();
  if (!frCode) {
    throw new OperationOutcomeError(
      badRequest(
        "The facility's Facility Registry code (FID-...) is required for fingerprint consent. Pass facilityFrCode or add it to the encounter's facility."
      )
    );
  }
  const name = organization?.name?.trim();
  if (!name) {
    throw new OperationOutcomeError(badRequest('The encounter has no facility (serviceProvider) with a name.'));
  }
  return { frCode, name };
}

async function callHie<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (err) {
    if (err instanceof OperationOutcomeError) {
      throw err;
    }
    // DHA validation errors (bad OTP, unknown intervention, ...) are the caller's to fix.
    if (err instanceof KenyaHieRequestError && err.status >= 400 && err.status < 500) {
      throw new OperationOutcomeError(badRequest(err.message));
    }
    if (err instanceof Error && !(err instanceof KenyaHieRequestError)) {
      throw new OperationOutcomeError(badRequest(err.message));
    }
    throw new OperationOutcomeError(badRequest(normalizeErrorString(err)));
  }
}

/**
 * Handles POST Encounter/:id/$kenya-visit-consent. One action per call:
 * - contacts: the patient's masked contacts, to choose where the OTP goes
 * - send-otp: send the start-visit OTP (interventionCode required; contactId optional)
 * - authorize-biometrics: create a fingerprint authorization and return its capture page
 * - authorization-status: read an authorization (authorizationGuid or consentToken)
 * - cancel-authorization: reject a pending authorization (consentToken)
 * @param req - The FHIR request.
 * @returns The DHA result as JSON.
 */
export async function kenyaVisitConsentHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<VisitConsentParameters>(kenyaVisitConsentOperation, req);
  const context = await loadVisitContext(req);
  const { credentials, patientCrId } = context;
  const interventionCodes = asArray(params.interventionCode);

  let result: unknown;
  switch (params.action) {
    case 'contacts':
      result = await callHie(() => getKenyaHiePatientContacts(credentials, patientCrId));
      break;
    case 'send-otp':
      result = await callHie(() =>
        sendKenyaHieVisitOtp(credentials, {
          patientId: patientCrId,
          interventionCodes,
          ...(params.contactId !== undefined ? { contactId: params.contactId } : {}),
        })
      );
      break;
    case 'authorize-biometrics': {
      const facility = await resolveFacility(context, params.facilityFrCode);
      result = await callHie(() =>
        createKenyaHieBiometricsAuthorization(credentials, {
          patientId: patientCrId,
          serviceType: parseServiceType(params.serviceType),
          interventionCodes,
          agentId: params.agentId ?? '',
          workStationId: params.workStationId ?? '',
          deviceOs: params.deviceOs ?? '',
          facilityFrCode: facility.frCode,
          facilityName: facility.name,
        })
      );
      break;
    }
    case 'authorization-status':
      if (!params.authorizationGuid?.trim() && !params.consentToken?.trim()) {
        throw new OperationOutcomeError(badRequest('authorizationGuid or consentToken is required'));
      }
      result = await callHie(() =>
        getKenyaHieAuthorizations(credentials, {
          ...(params.authorizationGuid ? { guid: params.authorizationGuid } : {}),
          ...(params.consentToken ? { token: params.consentToken } : {}),
        })
      );
      break;
    case 'cancel-authorization':
      await callHie(() => rejectKenyaHieAuthorization(credentials, params.consentToken ?? ''));
      result = { rejected: true };
      break;
    default:
      throw new OperationOutcomeError(
        badRequest(
          'action must be contacts, send-otp, authorize-biometrics, authorization-status or cancel-authorization'
        )
      );
  }

  return [allOk, buildOutputParameters(kenyaVisitConsentOperation, { result: JSON.stringify(result) })];
}

/**
 * Handles POST Encounter/:id/$kenya-start-visit: starts the SHA visit with the patient's OTP or an
 * authorized fingerprint consent, then records the visit on the Encounter (extension kenya-sha-visit
 * and a visit claim identifier). The consent token saved there is needed by every later claim step.
 * @param req - The FHIR request.
 * @returns A reference to the updated Encounter and the DHA visit.
 */
export async function kenyaStartVisitHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<StartVisitParameters>(kenyaStartVisitOperation, req);
  const serviceType = parseServiceType(params.serviceType);
  const context = await loadVisitContext(req);
  const { encounter } = context;

  if (getExistingVisit(encounter)) {
    throw new OperationOutcomeError(badRequest('An SHA visit has already been started for this encounter.'));
  }

  const interventionCodes = asArray(params.interventionCode);
  let practitioner: KenyaHieStartVisitInput['practitioner'];
  if (params.practitionerIdentificationNumber?.trim()) {
    const regulator = params.practitionerRegulator?.trim().toUpperCase();
    const identificationType = params.practitionerIdentificationType?.trim() || 'registration_number';
    if (regulator !== 'KMPDC' && regulator !== 'COC' && regulator !== 'NCK' && regulator !== 'PPB') {
      throw new OperationOutcomeError(badRequest('practitionerRegulator must be KMPDC, COC, NCK or PPB'));
    }
    if (!['registration_number', 'National ID', 'Alien ID', 'Refugee ID'].includes(identificationType)) {
      throw new OperationOutcomeError(
        badRequest('practitionerIdentificationType must be registration_number, National ID, Alien ID or Refugee ID')
      );
    }
    practitioner = {
      identificationType: identificationType as NonNullable<
        KenyaHieStartVisitInput['practitioner']
      >['identificationType'],
      identificationNumber: params.practitionerIdentificationNumber.trim(),
      regulator,
    };
  }

  const visit = await callHie(() =>
    startKenyaHieVisit(context.credentials, {
      patientId: context.patientCrId,
      serviceType,
      interventionCodes,
      ...(params.otp ? { otp: params.otp } : {}),
      ...(params.authorizationGuid ? { authorizationGuid: params.authorizationGuid } : {}),
      ...(practitioner ? { practitioner } : {}),
    })
  );

  const values: Extension[] = [
    { url: KenyaShaVisitExtension.consentToken, valueString: visit.consentToken ?? '' },
    { url: KenyaShaVisitExtension.serviceType, valueCode: serviceType },
    { url: KenyaShaVisitExtension.consentMethod, valueCode: params.otp ? 'otp' : 'biometrics' },
    { url: KenyaShaVisitExtension.startedAt, valueDateTime: new Date().toISOString() },
    ...interventionCodes.map((code) => ({ url: KenyaShaVisitExtension.interventionCode, valueString: code })),
  ];
  const optional: [string, string | null][] = [
    [KenyaShaVisitExtension.claimId, visit.claimId],
    [KenyaShaVisitExtension.authorizationGuid, visit.authorizationGuid],
    [KenyaShaVisitExtension.visitNumber, visit.visitNumber],
    [KenyaShaVisitExtension.workflowState, visit.workflowState],
    [KenyaShaVisitExtension.schemeName, visit.schemeName],
  ];
  for (const [url, value] of optional) {
    if (value) {
      values.push({ url, valueString: value });
    }
  }

  const ctx = getAuthenticatedContext();
  // Save as the caller (their access policy applies) and reject the update if the encounter changed
  // since it was read, so a second start in parallel cannot overwrite the first visit.
  const updated = await ctx.repo.updateResource<Encounter>(
    {
      ...encounter,
      identifier: [
        ...(encounter.identifier ?? []),
        ...(visit.claimId ? [{ system: KenyaShaVisitClaimIdSystem, value: visit.claimId }] : []),
      ],
      extension: [...(encounter.extension ?? []), { url: KenyaShaVisitExtension.url, extension: values }],
    },
    { ifMatch: encounter.meta?.versionId }
  );

  return [
    allOk,
    buildOutputParameters(kenyaStartVisitOperation, {
      encounter: createReference(updated),
      result: JSON.stringify(visit),
    }),
  ];
}

function getVisitType(encounter: Encounter, value: string | undefined): KenyaShaVisitType {
  const normalized = value?.trim().toUpperCase();
  if (normalized) {
    if (normalized !== 'OP' && normalized !== 'IP') {
      throw new OperationOutcomeError(badRequest('visitType must be OP or IP'));
    }
    return normalized;
  }
  return encounter.class?.code === 'IMP' ? 'IP' : 'OP';
}

/**
 * Handles POST Encounter/:id/$kenya-sha-coverage: what the encounter's patient is covered for at
 * this facility, following DHA's eligibility chain (run the eligibility check first). One action
 * per call:
 * - benefits: the parent benefits
 * - sub-benefits: the sub-benefits billable on this visit (parentBenefitCode optional)
 * - interventions: the interventions billable on this visit, each with DHA's flags and the
 *   integration scenario they select (subBenefitCode, search, interventionCode, page, pageSize)
 * - utilization: used and remaining limits for one intervention (interventionCode)
 * @param req - The FHIR request.
 * @returns The DHA result as JSON.
 */
export async function kenyaShaCoverageHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ShaCoverageParameters>(kenyaShaCoverageOperation, req);
  const context = await loadVisitContext(req);
  const { credentials, patientCrId, encounter } = context;
  const visitType = getVisitType(encounter, params.visitType);

  let result: unknown;
  switch (params.action) {
    case 'benefits':
      result = await callHie(() => getKenyaHieBenefits(credentials, patientCrId));
      break;
    case 'sub-benefits':
      result = await callHie(() =>
        getKenyaHieSubBenefits(credentials, patientCrId, {
          visitType,
          ...(params.parentBenefitCode ? { parentBenefitCode: params.parentBenefitCode } : {}),
        })
      );
      break;
    case 'interventions':
      result = await callHie(() =>
        getKenyaHieInterventions(credentials, patientCrId, {
          visitType,
          ...(params.subBenefitCode ? { subBenefitCode: params.subBenefitCode } : {}),
          ...(params.search ? { search: params.search } : {}),
          ...(params.interventionCode ? { code: params.interventionCode } : {}),
          ...(params.page !== undefined ? { page: params.page } : {}),
          ...(params.pageSize !== undefined ? { pageSize: params.pageSize } : {}),
        })
      );
      break;
    case 'utilization':
      result = await callHie(() => getKenyaHieUtilization(credentials, patientCrId, params.interventionCode ?? ''));
      break;
    default:
      throw new OperationOutcomeError(
        badRequest('action must be benefits, sub-benefits, interventions or utilization')
      );
  }

  return [
    allOk,
    buildOutputParameters(kenyaShaCoverageOperation, {
      result: JSON.stringify({ visitType, ...(Array.isArray(result) ? { results: result } : (result as object)) }),
    }),
  ];
}
