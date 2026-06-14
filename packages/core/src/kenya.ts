// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getExtensionValue } from './utils';
import type {
  Claim,
  ClaimResponse,
  Coverage,
  CoverageEligibilityRequest,
  CoverageEligibilityResponse,
  Extension,
  Identifier,
  Organization,
  Practitioner,
  Reference,
  Task,
} from '@medplum/fhirtypes';

export interface KenyaFacilityVerificationResultInput {
  readonly status: string;
  readonly correlationId: string;
  readonly message: string;
  readonly nextState: string;
  readonly facilityApprovalStatus?: string;
  readonly facilityOperationalStatus?: string;
  readonly currentLicenseExpiryDate?: string;
  readonly facilityAuthorityIdentifier?: string;
  readonly facilityAuthoritySystem?: string;
}

export const KenyaFacilityVerificationExtension = {
  baseUrl: 'https://afiax.africa/fhir/StructureDefinition/kenya-facility-verification',
  status: 'status',
  correlationId: 'correlationId',
  message: 'message',
  nextState: 'nextState',
  verifiedAt: 'verifiedAt',
  task: 'task',
  facilityApprovalStatus: 'facilityApprovalStatus',
  facilityOperationalStatus: 'facilityOperationalStatus',
  currentLicenseExpiryDate: 'currentLicenseExpiryDate',
  facilityAuthorityIdentifier: 'facilityAuthorityIdentifier',
  facilityAuthoritySystem: 'facilityAuthoritySystem',
} as const;

export const KenyaFacilityAuthorityIdentifierSystem = 'https://afiax.africa/kenya/identifier/mfl-code';
export const KenyaFacilityRegistrationIdentifierSystem =
  'https://afiax.africa/kenya/identifier/facility-registration-number';
export const KenyaPractitionerAuthorityIdentifierSystem =
  'https://afiax.africa/kenya/identifier/health-worker-registration-number';
export const KenyaPractitionerNationalIdIdentifierSystem = 'https://afiax.africa/kenya/identifier/national-id';
export const KenyaPractitionerPassportIdentifierSystem = 'https://afiax.africa/kenya/identifier/passport-number';
export const KenyaCoverageNationalIdIdentifierSystem = 'https://afiax.africa/kenya/identifier/coverage-national-id';
export const KenyaCoverageAlienIdIdentifierSystem = 'https://afiax.africa/kenya/identifier/coverage-alien-id';
export const KenyaCoverageMandateNumberIdentifierSystem =
  'https://afiax.africa/kenya/identifier/coverage-mandate-number';
export const KenyaCoverageTemporaryIdIdentifierSystem =
  'https://afiax.africa/kenya/identifier/coverage-temporary-id';
export const KenyaCoverageShaNumberIdentifierSystem = 'https://afiax.africa/kenya/identifier/sha-number';
export const KenyaCoverageRefugeeIdIdentifierSystem = 'https://afiax.africa/kenya/identifier/coverage-refugee-id';

export const KenyaFacilityRegistryExtension = {
  baseUrl: 'https://afiax.africa/fhir/StructureDefinition/kenya-facility-registry',
  facilityCode: 'facilityCode',
  found: 'found',
  facilityName: 'facilityName',
  registrationNumber: 'registrationNumber',
  regulator: 'regulator',
  approvalStatus: 'approvalStatus',
  facilityLevel: 'facilityLevel',
  facilityCategory: 'facilityCategory',
  facilityOwner: 'facilityOwner',
  facilityType: 'facilityType',
  county: 'county',
  subCounty: 'subCounty',
  ward: 'ward',
  operationalStatus: 'operationalStatus',
  currentLicenseExpiryDate: 'currentLicenseExpiryDate',
  lookedUpAt: 'lookedUpAt',
} as const;

export interface KenyaFacilityVerificationSnapshot {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly verifiedAt?: string;
  readonly task?: Reference<Task>;
  readonly facilityApprovalStatus?: string;
  readonly facilityOperationalStatus?: string;
  readonly currentLicenseExpiryDate?: string;
  readonly facilityAuthorityIdentifier?: string;
  readonly facilityAuthoritySystem?: string;
}

export interface KenyaFacilityRegistrySnapshot {
  readonly facilityCode?: string;
  readonly found?: boolean;
  readonly facilityName?: string;
  readonly registrationNumber?: string;
  readonly regulator?: string;
  readonly approvalStatus?: string;
  readonly facilityLevel?: string;
  readonly facilityCategory?: string;
  readonly facilityOwner?: string;
  readonly facilityType?: string;
  readonly county?: string;
  readonly subCounty?: string;
  readonly ward?: string;
  readonly operationalStatus?: string;
  readonly currentLicenseExpiryDate?: string;
  readonly lookedUpAt?: string;
}

export interface KenyaFacilityRegistryInput {
  readonly facilityCode?: string | null;
  readonly found?: number | boolean | null;
  readonly facilityName?: string | null;
  readonly registrationNumber?: string | null;
  readonly regulator?: string | null;
  readonly approvalStatus?: string | boolean | null;
  readonly facilityLevel?: string | null;
  readonly facilityCategory?: string | null;
  readonly facilityOwner?: string | null;
  readonly facilityType?: string | null;
  readonly county?: string | null;
  readonly subCounty?: string | null;
  readonly ward?: string | null;
  readonly operationalStatus?: string | null;
  readonly currentLicenseExpiryDate?: string | null;
}

export function buildKenyaFacilityVerificationExtension(
  result: KenyaFacilityVerificationResultInput,
  verifiedAt: string,
  task?: Reference<Task>
): Extension {
  const extension: Extension = {
    url: KenyaFacilityVerificationExtension.baseUrl,
    extension: [
      { url: KenyaFacilityVerificationExtension.status, valueCode: result.status },
      { url: KenyaFacilityVerificationExtension.correlationId, valueString: result.correlationId },
      { url: KenyaFacilityVerificationExtension.message, valueString: result.message },
      { url: KenyaFacilityVerificationExtension.nextState, valueString: result.nextState },
      { url: KenyaFacilityVerificationExtension.verifiedAt, valueDateTime: verifiedAt },
    ],
  };

  if (task) {
    extension.extension?.push({ url: KenyaFacilityVerificationExtension.task, valueReference: task });
  }
  if (result.facilityApprovalStatus) {
    extension.extension?.push({
      url: KenyaFacilityVerificationExtension.facilityApprovalStatus,
      valueString: result.facilityApprovalStatus,
    });
  }
  if (result.facilityOperationalStatus) {
    extension.extension?.push({
      url: KenyaFacilityVerificationExtension.facilityOperationalStatus,
      valueString: result.facilityOperationalStatus,
    });
  }
  if (result.currentLicenseExpiryDate) {
    extension.extension?.push({
      url: KenyaFacilityVerificationExtension.currentLicenseExpiryDate,
      valueDate: result.currentLicenseExpiryDate,
    });
  }
  if (result.facilityAuthorityIdentifier) {
    extension.extension?.push({
      url: KenyaFacilityVerificationExtension.facilityAuthorityIdentifier,
      valueString: result.facilityAuthorityIdentifier,
    });
  }
  if (result.facilityAuthoritySystem) {
    extension.extension?.push({
      url: KenyaFacilityVerificationExtension.facilityAuthoritySystem,
      valueUri: result.facilityAuthoritySystem,
    });
  }

  return extension;
}

export function getKenyaFacilityVerificationSnapshot(
  organization: Pick<Organization, 'extension'> | undefined
): KenyaFacilityVerificationSnapshot | undefined {
  if (!organization?.extension?.length) {
    return undefined;
  }

  const base = KenyaFacilityVerificationExtension.baseUrl;
  const status = getExtensionValue(organization, base, KenyaFacilityVerificationExtension.status);
  if (typeof status !== 'string' || !status) {
    return undefined;
  }

  const taskValue = getExtensionValue(organization, base, KenyaFacilityVerificationExtension.task);
  return {
    status,
    correlationId: getStringExtensionValue(organization, KenyaFacilityVerificationExtension.correlationId),
    message: getStringExtensionValue(organization, KenyaFacilityVerificationExtension.message),
    nextState: getStringExtensionValue(organization, KenyaFacilityVerificationExtension.nextState),
    verifiedAt: getStringExtensionValue(organization, KenyaFacilityVerificationExtension.verifiedAt),
    task: isReference(taskValue) ? (taskValue as Reference<Task>) : undefined,
    facilityApprovalStatus: getStringExtensionValue(organization, KenyaFacilityVerificationExtension.facilityApprovalStatus),
    facilityOperationalStatus: getStringExtensionValue(
      organization,
      KenyaFacilityVerificationExtension.facilityOperationalStatus
    ),
    currentLicenseExpiryDate: getStringExtensionValue(
      organization,
      KenyaFacilityVerificationExtension.currentLicenseExpiryDate
    ),
    facilityAuthorityIdentifier: getStringExtensionValue(
      organization,
      KenyaFacilityVerificationExtension.facilityAuthorityIdentifier
    ),
    facilityAuthoritySystem: getStringExtensionValue(organization, KenyaFacilityVerificationExtension.facilityAuthoritySystem),
  };

  function getStringExtensionValue(resource: Pick<Organization, 'extension'>, childUrl: string): string | undefined {
    const value = getExtensionValue(resource, base, childUrl);
    return typeof value === 'string' && value ? value : undefined;
  }
}

function isReference(value: unknown): value is Reference {
  return !!value && typeof value === 'object' && 'reference' in (value as Record<string, unknown>);
}

export function getKenyaFacilityAuthorityIdentifier(
  organization: Pick<Organization, 'identifier'> | undefined,
  preferredSystem = KenyaFacilityAuthorityIdentifierSystem
): Identifier | undefined {
  return organization?.identifier?.find((identifier) => isKenyaFacilityAuthorityIdentifier(identifier, preferredSystem));
}

export function setKenyaFacilityAuthorityIdentifier(
  organization: Organization,
  value: string,
  preferredSystem = KenyaFacilityAuthorityIdentifierSystem
): Organization {
  const trimmed = value.trim();
  const nextIdentifier: Identifier = {
    system: preferredSystem,
    value: trimmed,
    type: {
      text: 'Facility authority identifier',
      coding: [{ code: 'facility-authority-id', display: 'Facility authority identifier' }],
    },
  };

  const identifiers = [...(organization.identifier ?? [])];
  const existingIndex = identifiers.findIndex((identifier) => isKenyaFacilityAuthorityIdentifier(identifier, preferredSystem));
  if (existingIndex >= 0) {
    identifiers[existingIndex] = {
      ...identifiers[existingIndex],
      ...nextIdentifier,
    };
  } else {
    identifiers.push(nextIdentifier);
  }

  return {
    ...organization,
    identifier: identifiers,
  };
}

export function clearKenyaFacilityVerificationSnapshot(organization: Organization): Organization {
  if (!organization.extension?.length) {
    return organization;
  }

  return {
    ...organization,
    extension: organization.extension.filter((ext) => ext.url !== KenyaFacilityVerificationExtension.baseUrl),
  };
}

export function clearKenyaFacilityRegistrySnapshot(organization: Organization): Organization {
  if (!organization.extension?.length) {
    return organization;
  }

  return {
    ...organization,
    extension: organization.extension.filter((ext) => ext.url !== KenyaFacilityRegistryExtension.baseUrl),
  };
}

export function buildKenyaFacilityRegistryExtension(
  input: KenyaFacilityRegistryInput,
  lookedUpAt: string
): Extension {
  const extension: Extension = {
    url: KenyaFacilityRegistryExtension.baseUrl,
    extension: [{ url: KenyaFacilityRegistryExtension.lookedUpAt, valueDateTime: lookedUpAt }],
  };

  pushString(extension, KenyaFacilityRegistryExtension.facilityCode, input.facilityCode);
  if (input.found !== undefined && input.found !== null) {
    extension.extension?.push({
      url: KenyaFacilityRegistryExtension.found,
      valueBoolean: input.found === true || input.found === 1,
    });
  }
  pushString(extension, KenyaFacilityRegistryExtension.facilityName, input.facilityName);
  pushString(extension, KenyaFacilityRegistryExtension.registrationNumber, input.registrationNumber);
  pushString(extension, KenyaFacilityRegistryExtension.regulator, input.regulator);
  pushString(extension, KenyaFacilityRegistryExtension.approvalStatus, normalizeOptionalString(input.approvalStatus));
  pushString(extension, KenyaFacilityRegistryExtension.facilityLevel, input.facilityLevel);
  pushString(extension, KenyaFacilityRegistryExtension.facilityCategory, input.facilityCategory);
  pushString(extension, KenyaFacilityRegistryExtension.facilityOwner, input.facilityOwner);
  pushString(extension, KenyaFacilityRegistryExtension.facilityType, input.facilityType);
  pushString(extension, KenyaFacilityRegistryExtension.county, input.county);
  pushString(extension, KenyaFacilityRegistryExtension.subCounty, input.subCounty);
  pushString(extension, KenyaFacilityRegistryExtension.ward, input.ward);
  pushString(extension, KenyaFacilityRegistryExtension.operationalStatus, input.operationalStatus);
  pushString(
    extension,
    KenyaFacilityRegistryExtension.currentLicenseExpiryDate,
    input.currentLicenseExpiryDate
  );

  return extension;
}

export function getKenyaFacilityRegistrySnapshot(
  organization: Pick<Organization, 'extension'> | undefined
): KenyaFacilityRegistrySnapshot | undefined {
  if (!organization?.extension?.length) {
    return undefined;
  }

  const base = KenyaFacilityRegistryExtension.baseUrl;
  const facilityCode = getExtensionValue(organization, base, KenyaFacilityRegistryExtension.facilityCode);
  const lookedUpAt = getExtensionValue(organization, base, KenyaFacilityRegistryExtension.lookedUpAt);
  if (typeof facilityCode !== 'string' || typeof lookedUpAt !== 'string') {
    return undefined;
  }

  const found = getExtensionValue(organization, base, KenyaFacilityRegistryExtension.found);
  return {
    facilityCode: typeof facilityCode === 'string' ? facilityCode : undefined,
    found: typeof found === 'boolean' ? found : undefined,
    facilityName: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.facilityName),
    registrationNumber: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.registrationNumber),
    regulator: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.regulator),
    approvalStatus: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.approvalStatus),
    facilityLevel: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.facilityLevel),
    facilityCategory: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.facilityCategory),
    facilityOwner: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.facilityOwner),
    facilityType: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.facilityType),
    county: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.county),
    subCounty: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.subCounty),
    ward: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.ward),
    operationalStatus: getKenyaRegistryStringValue(organization, KenyaFacilityRegistryExtension.operationalStatus),
    currentLicenseExpiryDate: getKenyaRegistryStringValue(
      organization,
      KenyaFacilityRegistryExtension.currentLicenseExpiryDate
    ),
    lookedUpAt: typeof lookedUpAt === 'string' ? lookedUpAt : undefined,
  };
}

export function applyKenyaFacilityRegistryToOrganization(
  organization: Organization,
  input: KenyaFacilityRegistryInput,
  lookedUpAt: string
): Organization {
  const facilityCode = input.facilityCode?.trim();
  const registryExtension = buildKenyaFacilityRegistryExtension(input, lookedUpAt);
  const nextExtensions =
    organization.extension?.filter(
      (ext) =>
        ext.url !== KenyaFacilityRegistryExtension.baseUrl && ext.url !== KenyaFacilityVerificationExtension.baseUrl
    ) ?? [];

  let updated: Organization = {
    ...organization,
    extension: [...nextExtensions, registryExtension],
  };

  if (facilityCode) {
    updated = setKenyaFacilityAuthorityIdentifier(updated, facilityCode);
  }

  const facilityName = input.facilityName?.trim();
  if (facilityName) {
    updated.name = facilityName;
  }

  const registrationNumber = input.registrationNumber?.trim();
  if (registrationNumber) {
    const identifiers = [...(updated.identifier ?? [])];
    const registrationIdentifier: Identifier = {
      system: KenyaFacilityRegistrationIdentifierSystem,
      value: registrationNumber,
      type: {
        text: 'Facility registration number',
      },
    };
    const existingIndex = identifiers.findIndex(
      (identifier) => identifier.system === KenyaFacilityRegistrationIdentifierSystem
    );
    if (existingIndex >= 0) {
      identifiers[existingIndex] = { ...identifiers[existingIndex], ...registrationIdentifier };
    } else {
      identifiers.push(registrationIdentifier);
    }
    updated.identifier = identifiers;
  }

  return updated;
}

function isKenyaFacilityAuthorityIdentifier(identifier: Identifier | undefined, preferredSystem: string): boolean {
  if (!identifier) {
    return false;
  }

  if (identifier.system === preferredSystem) {
    return true;
  }

  if (identifier.system?.toLowerCase().includes('mfl')) {
    return true;
  }

  const typeText = identifier.type?.text?.toLowerCase();
  if (typeText?.includes('facility authority')) {
    return true;
  }

  return (identifier.type?.coding ?? []).some(
    (coding) =>
      coding.code === 'facility-authority-id' || coding.display?.toLowerCase().includes('facility authority')
  );
}

function pushString(extension: Extension, url: string, value: string | null | undefined): void {
  const normalized = value?.trim();
  if (normalized) {
    extension.extension?.push({ url, valueString: normalized });
  }
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  return String(value);
}

function getKenyaRegistryStringValue(
  organization: Pick<Organization, 'extension'>,
  childUrl: string
): string | undefined {
  const value = getExtensionValue(organization, KenyaFacilityRegistryExtension.baseUrl, childUrl);
  return typeof value === 'string' && value ? value : undefined;
}

export type KenyaPractitionerIdentificationType = 'ID' | 'PASSPORT';
export type KenyaCoverageEligibilityIdentificationType =
  | 'National ID'
  | 'Alien ID'
  | 'Mandate Number'
  | 'Temporary ID'
  | 'SHA Number'
  | 'Refugee ID';

export interface KenyaPractitionerVerificationResultInput {
  readonly status: string;
  readonly correlationId: string;
  readonly message: string;
  readonly nextState: string;
  readonly practitionerAuthorityIdentifier?: string;
  readonly practitionerAuthoritySystem?: string;
  readonly registrationNumber?: string;
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly practitionerActiveStatus?: string;
}

export const KenyaPractitionerVerificationExtension = {
  baseUrl: 'https://afiax.africa/fhir/StructureDefinition/kenya-practitioner-verification',
  status: 'status',
  correlationId: 'correlationId',
  message: 'message',
  nextState: 'nextState',
  verifiedAt: 'verifiedAt',
  task: 'task',
  practitionerAuthorityIdentifier: 'practitionerAuthorityIdentifier',
  practitionerAuthoritySystem: 'practitionerAuthoritySystem',
  registrationNumber: 'registrationNumber',
  identificationType: 'identificationType',
  identificationNumber: 'identificationNumber',
  practitionerActiveStatus: 'practitionerActiveStatus',
} as const;

export const KenyaPractitionerRegistryExtension = {
  baseUrl: 'https://afiax.africa/fhir/StructureDefinition/kenya-practitioner-registry',
  identificationType: 'identificationType',
  identificationNumber: 'identificationNumber',
  registrationNumber: 'registrationNumber',
  found: 'found',
  isActive: 'isActive',
  lookedUpAt: 'lookedUpAt',
} as const;

export interface KenyaPractitionerVerificationSnapshot {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly verifiedAt?: string;
  readonly task?: Reference<Task>;
  readonly practitionerAuthorityIdentifier?: string;
  readonly practitionerAuthoritySystem?: string;
  readonly registrationNumber?: string;
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly practitionerActiveStatus?: string;
}

export interface KenyaPractitionerRegistrySnapshot {
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly registrationNumber?: string;
  readonly found?: boolean;
  readonly isActive?: boolean;
  readonly lookedUpAt?: string;
}

export interface KenyaPractitionerRegistryInput {
  readonly identificationType?: string | null;
  readonly identificationNumber?: string | null;
  readonly registrationNumber?: string | null;
  readonly found?: number | boolean | null;
  readonly isActive?: string | boolean | null;
}

export interface KenyaPractitionerLookupIdentifier {
  readonly identificationType: KenyaPractitionerIdentificationType;
  readonly identifier: Identifier;
}

export function buildKenyaPractitionerVerificationExtension(
  result: KenyaPractitionerVerificationResultInput,
  verifiedAt: string,
  task?: Reference<Task>
): Extension {
  const extension: Extension = {
    url: KenyaPractitionerVerificationExtension.baseUrl,
    extension: [
      { url: KenyaPractitionerVerificationExtension.status, valueCode: result.status },
      { url: KenyaPractitionerVerificationExtension.correlationId, valueString: result.correlationId },
      { url: KenyaPractitionerVerificationExtension.message, valueString: result.message },
      { url: KenyaPractitionerVerificationExtension.nextState, valueString: result.nextState },
      { url: KenyaPractitionerVerificationExtension.verifiedAt, valueDateTime: verifiedAt },
    ],
  };

  if (task) {
    extension.extension?.push({ url: KenyaPractitionerVerificationExtension.task, valueReference: task });
  }
  pushString(
    extension,
    KenyaPractitionerVerificationExtension.practitionerAuthorityIdentifier,
    result.practitionerAuthorityIdentifier
  );
  if (result.practitionerAuthoritySystem) {
    extension.extension?.push({
      url: KenyaPractitionerVerificationExtension.practitionerAuthoritySystem,
      valueUri: result.practitionerAuthoritySystem,
    });
  }
  pushString(extension, KenyaPractitionerVerificationExtension.registrationNumber, result.registrationNumber);
  pushString(extension, KenyaPractitionerVerificationExtension.identificationType, result.identificationType);
  pushString(extension, KenyaPractitionerVerificationExtension.identificationNumber, result.identificationNumber);
  pushString(
    extension,
    KenyaPractitionerVerificationExtension.practitionerActiveStatus,
    result.practitionerActiveStatus
  );

  return extension;
}

export function getKenyaPractitionerVerificationSnapshot(
  practitioner: Pick<Practitioner, 'extension'> | undefined
): KenyaPractitionerVerificationSnapshot | undefined {
  if (!practitioner?.extension?.length) {
    return undefined;
  }

  const base = KenyaPractitionerVerificationExtension.baseUrl;
  const status = getExtensionValue(practitioner, base, KenyaPractitionerVerificationExtension.status);
  if (typeof status !== 'string' || !status) {
    return undefined;
  }

  const taskValue = getExtensionValue(practitioner, base, KenyaPractitionerVerificationExtension.task);
  return {
    status,
    correlationId: getKenyaExtensionStringValue(practitioner, base, KenyaPractitionerVerificationExtension.correlationId),
    message: getKenyaExtensionStringValue(practitioner, base, KenyaPractitionerVerificationExtension.message),
    nextState: getKenyaExtensionStringValue(practitioner, base, KenyaPractitionerVerificationExtension.nextState),
    verifiedAt: getKenyaExtensionStringValue(practitioner, base, KenyaPractitionerVerificationExtension.verifiedAt),
    task: isReference(taskValue) ? (taskValue as Reference<Task>) : undefined,
    practitionerAuthorityIdentifier: getKenyaExtensionStringValue(
      practitioner,
      base,
      KenyaPractitionerVerificationExtension.practitionerAuthorityIdentifier
    ),
    practitionerAuthoritySystem: getKenyaExtensionStringValue(
      practitioner,
      base,
      KenyaPractitionerVerificationExtension.practitionerAuthoritySystem
    ),
    registrationNumber: getKenyaExtensionStringValue(
      practitioner,
      base,
      KenyaPractitionerVerificationExtension.registrationNumber
    ),
    identificationType: getKenyaExtensionStringValue(
      practitioner,
      base,
      KenyaPractitionerVerificationExtension.identificationType
    ),
    identificationNumber: getKenyaExtensionStringValue(
      practitioner,
      base,
      KenyaPractitionerVerificationExtension.identificationNumber
    ),
    practitionerActiveStatus: getKenyaExtensionStringValue(
      practitioner,
      base,
      KenyaPractitionerVerificationExtension.practitionerActiveStatus
    ),
  };
}

export function buildKenyaPractitionerRegistryExtension(
  input: KenyaPractitionerRegistryInput,
  lookedUpAt: string
): Extension {
  const extension: Extension = {
    url: KenyaPractitionerRegistryExtension.baseUrl,
    extension: [{ url: KenyaPractitionerRegistryExtension.lookedUpAt, valueDateTime: lookedUpAt }],
  };

  pushString(extension, KenyaPractitionerRegistryExtension.identificationType, input.identificationType);
  pushString(extension, KenyaPractitionerRegistryExtension.identificationNumber, input.identificationNumber);
  pushString(extension, KenyaPractitionerRegistryExtension.registrationNumber, input.registrationNumber);
  if (input.found !== undefined && input.found !== null) {
    extension.extension?.push({
      url: KenyaPractitionerRegistryExtension.found,
      valueBoolean: input.found === true || input.found === 1,
    });
  }

  const normalizedActive = normalizeOptionalBoolean(input.isActive);
  if (normalizedActive !== undefined) {
    extension.extension?.push({
      url: KenyaPractitionerRegistryExtension.isActive,
      valueBoolean: normalizedActive,
    });
  }

  return extension;
}

export function getKenyaPractitionerRegistrySnapshot(
  practitioner: Pick<Practitioner, 'extension'> | undefined
): KenyaPractitionerRegistrySnapshot | undefined {
  if (!practitioner?.extension?.length) {
    return undefined;
  }

  const base = KenyaPractitionerRegistryExtension.baseUrl;
  const identificationNumber = getExtensionValue(practitioner, base, KenyaPractitionerRegistryExtension.identificationNumber);
  const lookedUpAt = getExtensionValue(practitioner, base, KenyaPractitionerRegistryExtension.lookedUpAt);
  if (typeof identificationNumber !== 'string' && typeof lookedUpAt !== 'string') {
    return undefined;
  }

  const found = getExtensionValue(practitioner, base, KenyaPractitionerRegistryExtension.found);
  const isActive = getExtensionValue(practitioner, base, KenyaPractitionerRegistryExtension.isActive);
  return {
    identificationType: getKenyaExtensionStringValue(
      practitioner,
      base,
      KenyaPractitionerRegistryExtension.identificationType
    ),
    identificationNumber: typeof identificationNumber === 'string' ? identificationNumber : undefined,
    registrationNumber: getKenyaExtensionStringValue(
      practitioner,
      base,
      KenyaPractitionerRegistryExtension.registrationNumber
    ),
    found: typeof found === 'boolean' ? found : undefined,
    isActive: typeof isActive === 'boolean' ? isActive : undefined,
    lookedUpAt: typeof lookedUpAt === 'string' ? lookedUpAt : undefined,
  };
}

export function getKenyaPractitionerAuthorityIdentifier(
  practitioner: Pick<Practitioner, 'identifier'> | undefined,
  preferredSystem = KenyaPractitionerAuthorityIdentifierSystem
): Identifier | undefined {
  return practitioner?.identifier?.find((identifier) => isKenyaPractitionerAuthorityIdentifier(identifier, preferredSystem));
}

export function setKenyaPractitionerAuthorityIdentifier(
  practitioner: Practitioner,
  value: string,
  preferredSystem = KenyaPractitionerAuthorityIdentifierSystem
): Practitioner {
  const trimmed = value.trim();
  const nextIdentifier: Identifier = {
    system: preferredSystem,
    value: trimmed,
    type: {
      text: 'Practitioner authority identifier',
      coding: [{ code: 'practitioner-authority-id', display: 'Practitioner authority identifier' }],
    },
  };

  const identifiers = [...(practitioner.identifier ?? [])];
  const existingIndex = identifiers.findIndex((identifier) => isKenyaPractitionerAuthorityIdentifier(identifier, preferredSystem));
  if (existingIndex >= 0) {
    identifiers[existingIndex] = {
      ...identifiers[existingIndex],
      ...nextIdentifier,
    };
  } else {
    identifiers.push(nextIdentifier);
  }

  return {
    ...practitioner,
    identifier: identifiers,
  };
}

export function getKenyaPractitionerLookupIdentifier(
  practitioner: Pick<Practitioner, 'identifier'> | undefined
): KenyaPractitionerLookupIdentifier | undefined {
  const identifiers = practitioner?.identifier ?? [];
  for (const identifier of identifiers) {
    const identificationType = getKenyaPractitionerIdentificationTypeForIdentifier(identifier);
    if (identificationType && identifier.value?.trim()) {
      return { identificationType, identifier };
    }
  }
  return undefined;
}

export function setKenyaPractitionerLookupIdentifier(
  practitioner: Practitioner,
  identificationType: KenyaPractitionerIdentificationType,
  identificationNumber: string
): Practitioner {
  const trimmedNumber = identificationNumber.trim();
  const nextIdentifier: Identifier = {
    system: getKenyaPractitionerLookupSystem(identificationType),
    value: trimmedNumber,
    type: {
      text: identificationType === 'PASSPORT' ? 'Passport number' : 'National ID number',
      coding: [{ code: identificationType, display: identificationType === 'PASSPORT' ? 'Passport' : 'National ID' }],
    },
  };

  const identifiers = [...(practitioner.identifier ?? [])];
  const existingIndex = identifiers.findIndex(
    (identifier) => getKenyaPractitionerIdentificationTypeForIdentifier(identifier) === identificationType
  );
  if (existingIndex >= 0) {
    identifiers[existingIndex] = {
      ...identifiers[existingIndex],
      ...nextIdentifier,
    };
  } else {
    identifiers.push(nextIdentifier);
  }

  return {
    ...practitioner,
    identifier: identifiers,
  };
}

export function clearKenyaPractitionerVerificationSnapshot(practitioner: Practitioner): Practitioner {
  if (!practitioner.extension?.length) {
    return practitioner;
  }

  return {
    ...practitioner,
    extension: practitioner.extension.filter((ext) => ext.url !== KenyaPractitionerVerificationExtension.baseUrl),
  };
}

export function clearKenyaPractitionerRegistrySnapshot(practitioner: Practitioner): Practitioner {
  if (!practitioner.extension?.length) {
    return practitioner;
  }

  return {
    ...practitioner,
    extension: practitioner.extension.filter((ext) => ext.url !== KenyaPractitionerRegistryExtension.baseUrl),
  };
}

export function applyKenyaPractitionerRegistryToPractitioner(
  practitioner: Practitioner,
  input: KenyaPractitionerRegistryInput,
  lookedUpAt: string
): Practitioner {
  const registryExtension = buildKenyaPractitionerRegistryExtension(input, lookedUpAt);
  const nextExtensions =
    practitioner.extension?.filter(
      (ext) =>
        ext.url !== KenyaPractitionerRegistryExtension.baseUrl &&
        ext.url !== KenyaPractitionerVerificationExtension.baseUrl
    ) ?? [];

  let updated: Practitioner = {
    ...practitioner,
    extension: [...nextExtensions, registryExtension],
  };

  const identificationType = normalizePractitionerIdentificationType(input.identificationType);
  const identificationNumber = input.identificationNumber?.trim();
  if (identificationType && identificationNumber) {
    updated = setKenyaPractitionerLookupIdentifier(updated, identificationType, identificationNumber);
  }

  const registrationNumber = input.registrationNumber?.trim();
  if (registrationNumber) {
    updated = setKenyaPractitionerAuthorityIdentifier(updated, registrationNumber);
  }

  return updated;
}

function isKenyaPractitionerAuthorityIdentifier(identifier: Identifier | undefined, preferredSystem: string): boolean {
  if (!identifier) {
    return false;
  }

  if (identifier.system === preferredSystem) {
    return true;
  }

  if (identifier.system?.toLowerCase().includes('registration-number')) {
    return true;
  }

  const typeText = identifier.type?.text?.toLowerCase();
  if (typeText?.includes('practitioner authority')) {
    return true;
  }

  return (identifier.type?.coding ?? []).some(
    (coding) =>
      coding.code === 'practitioner-authority-id' || coding.display?.toLowerCase().includes('practitioner authority')
  );
}

function getKenyaPractitionerIdentificationTypeForIdentifier(
  identifier: Identifier | undefined
): KenyaPractitionerIdentificationType | undefined {
  if (!identifier?.value?.trim()) {
    return undefined;
  }

  if (identifier.system === KenyaPractitionerNationalIdIdentifierSystem) {
    return 'ID';
  }
  if (identifier.system === KenyaPractitionerPassportIdentifierSystem) {
    return 'PASSPORT';
  }

  const typeText = identifier.type?.text?.toLowerCase();
  if (typeText?.includes('passport')) {
    return 'PASSPORT';
  }
  if (typeText?.includes('national id') || typeText === 'id' || typeText?.includes('national identification')) {
    return 'ID';
  }

  for (const coding of identifier.type?.coding ?? []) {
    const code = coding.code?.toUpperCase();
    const display = coding.display?.toLowerCase();
    if (code === 'PASSPORT' || display?.includes('passport')) {
      return 'PASSPORT';
    }
    if (code === 'ID' || display?.includes('national id')) {
      return 'ID';
    }
  }

  return undefined;
}

function getKenyaPractitionerLookupSystem(identificationType: KenyaPractitionerIdentificationType): string {
  return identificationType === 'PASSPORT'
    ? KenyaPractitionerPassportIdentifierSystem
    : KenyaPractitionerNationalIdIdentifierSystem;
}

function normalizePractitionerIdentificationType(
  value: string | null | undefined
): KenyaPractitionerIdentificationType | undefined {
  const normalized = value?.trim().toUpperCase();
  if (normalized === 'PASSPORT') {
    return 'PASSPORT';
  }
  if (normalized === 'ID') {
    return 'ID';
  }
  return undefined;
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'number') {
    return value === 1;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (!normalized) {
      return undefined;
    }
    if (['1', 'true', 'yes', 'active'].includes(normalized)) {
      return true;
    }
    if (['0', 'false', 'no', 'inactive'].includes(normalized)) {
      return false;
    }
  }

  return undefined;
}

function getKenyaExtensionStringValue(
  resource: Pick<Organization, 'extension'> | Pick<Practitioner, 'extension'> | Pick<Coverage, 'extension'> | Pick<Claim, 'extension'>,
  baseUrl: string,
  childUrl: string
): string | undefined {
  const value = getExtensionValue(resource, baseUrl, childUrl);
  return typeof value === 'string' && value ? value : undefined;
}

function getKenyaExtensionNumberValue(
  resource: Pick<Coverage, 'extension'> | Pick<Claim, 'extension'>,
  baseUrl: string,
  childUrl: string
): number | undefined {
  const value = getExtensionValue(resource, baseUrl, childUrl);
  return typeof value === 'number' ? value : undefined;
}

export interface KenyaCoverageEligibilityResultInput {
  readonly status: string;
  readonly correlationId: string;
  readonly message: string;
  readonly nextState: string;
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly eligible?: boolean;
  readonly fullName?: string;
  readonly reason?: string;
  readonly possibleSolution?: string;
  readonly coverageEndDate?: string;
  readonly transitionStatus?: string;
  readonly requestId?: string;
  readonly requestIdNumber?: string;
  readonly requestIdType?: string;
}

export const KenyaCoverageEligibilityExtension = {
  baseUrl: 'https://afiax.africa/fhir/StructureDefinition/kenya-coverage-eligibility',
  status: 'status',
  correlationId: 'correlationId',
  message: 'message',
  nextState: 'nextState',
  checkedAt: 'checkedAt',
  task: 'task',
  eligibilityRequest: 'eligibilityRequest',
  eligibilityResponse: 'eligibilityResponse',
  identificationType: 'identificationType',
  identificationNumber: 'identificationNumber',
  eligible: 'eligible',
  fullName: 'fullName',
  reason: 'reason',
  possibleSolution: 'possibleSolution',
  coverageEndDate: 'coverageEndDate',
  transitionStatus: 'transitionStatus',
  requestId: 'requestId',
  requestIdNumber: 'requestIdNumber',
  requestIdType: 'requestIdType',
} as const;

export interface KenyaCoverageEligibilitySnapshot {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly checkedAt?: string;
  readonly task?: Reference<Task>;
  readonly eligibilityRequest?: Reference<CoverageEligibilityRequest>;
  readonly eligibilityResponse?: Reference<CoverageEligibilityResponse>;
  readonly identificationType?: string;
  readonly identificationNumber?: string;
  readonly eligible?: boolean;
  readonly fullName?: string;
  readonly reason?: string;
  readonly possibleSolution?: string;
  readonly coverageEndDate?: string;
  readonly transitionStatus?: string;
  readonly requestId?: string;
  readonly requestIdNumber?: string;
  readonly requestIdType?: string;
}

export interface KenyaCoverageEligibilityLookupIdentifier {
  readonly identificationType: KenyaCoverageEligibilityIdentificationType;
  readonly identifier: Identifier;
}

export function buildKenyaCoverageEligibilityExtension(
  result: KenyaCoverageEligibilityResultInput,
  checkedAt: string,
  references?: {
    readonly task?: Reference<Task>;
    readonly eligibilityRequest?: Reference<CoverageEligibilityRequest>;
    readonly eligibilityResponse?: Reference<CoverageEligibilityResponse>;
  }
): Extension {
  const extension: Extension = {
    url: KenyaCoverageEligibilityExtension.baseUrl,
    extension: [
      { url: KenyaCoverageEligibilityExtension.status, valueCode: result.status },
      { url: KenyaCoverageEligibilityExtension.correlationId, valueString: result.correlationId },
      { url: KenyaCoverageEligibilityExtension.message, valueString: result.message },
      { url: KenyaCoverageEligibilityExtension.nextState, valueString: result.nextState },
      { url: KenyaCoverageEligibilityExtension.checkedAt, valueDateTime: checkedAt },
    ],
  };

  if (references?.task) {
    extension.extension?.push({ url: KenyaCoverageEligibilityExtension.task, valueReference: references.task });
  }
  if (references?.eligibilityRequest) {
    extension.extension?.push({
      url: KenyaCoverageEligibilityExtension.eligibilityRequest,
      valueReference: references.eligibilityRequest,
    });
  }
  if (references?.eligibilityResponse) {
    extension.extension?.push({
      url: KenyaCoverageEligibilityExtension.eligibilityResponse,
      valueReference: references.eligibilityResponse,
    });
  }
  pushString(extension, KenyaCoverageEligibilityExtension.identificationType, result.identificationType);
  pushString(extension, KenyaCoverageEligibilityExtension.identificationNumber, result.identificationNumber);
  if (result.eligible !== undefined) {
    extension.extension?.push({ url: KenyaCoverageEligibilityExtension.eligible, valueBoolean: result.eligible });
  }
  pushString(extension, KenyaCoverageEligibilityExtension.fullName, result.fullName);
  pushString(extension, KenyaCoverageEligibilityExtension.reason, result.reason);
  pushString(extension, KenyaCoverageEligibilityExtension.possibleSolution, result.possibleSolution);
  pushString(extension, KenyaCoverageEligibilityExtension.coverageEndDate, result.coverageEndDate);
  pushString(extension, KenyaCoverageEligibilityExtension.transitionStatus, result.transitionStatus);
  pushString(extension, KenyaCoverageEligibilityExtension.requestId, result.requestId);
  pushString(extension, KenyaCoverageEligibilityExtension.requestIdNumber, result.requestIdNumber);
  pushString(extension, KenyaCoverageEligibilityExtension.requestIdType, result.requestIdType);

  return extension;
}

export function getKenyaCoverageEligibilitySnapshot(
  coverage: Pick<Coverage, 'extension'> | undefined
): KenyaCoverageEligibilitySnapshot | undefined {
  if (!coverage?.extension?.length) {
    return undefined;
  }

  const base = KenyaCoverageEligibilityExtension.baseUrl;
  const status = getExtensionValue(coverage, base, KenyaCoverageEligibilityExtension.status);
  if (typeof status !== 'string' || !status) {
    return undefined;
  }

  const taskValue = getExtensionValue(coverage, base, KenyaCoverageEligibilityExtension.task);
  const requestValue = getExtensionValue(coverage, base, KenyaCoverageEligibilityExtension.eligibilityRequest);
  const responseValue = getExtensionValue(coverage, base, KenyaCoverageEligibilityExtension.eligibilityResponse);
  const eligible = getExtensionValue(coverage, base, KenyaCoverageEligibilityExtension.eligible);

  return {
    status,
    correlationId: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.correlationId),
    message: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.message),
    nextState: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.nextState),
    checkedAt: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.checkedAt),
    task: isReference(taskValue) ? (taskValue as Reference<Task>) : undefined,
    eligibilityRequest: isReference(requestValue) ? (requestValue as Reference<CoverageEligibilityRequest>) : undefined,
    eligibilityResponse: isReference(responseValue) ? (responseValue as Reference<CoverageEligibilityResponse>) : undefined,
    identificationType: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.identificationType),
    identificationNumber: getKenyaExtensionStringValue(
      coverage,
      base,
      KenyaCoverageEligibilityExtension.identificationNumber
    ),
    eligible: typeof eligible === 'boolean' ? eligible : undefined,
    fullName: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.fullName),
    reason: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.reason),
    possibleSolution: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.possibleSolution),
    coverageEndDate: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.coverageEndDate),
    transitionStatus: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.transitionStatus),
    requestId: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.requestId),
    requestIdNumber: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.requestIdNumber),
    requestIdType: getKenyaExtensionStringValue(coverage, base, KenyaCoverageEligibilityExtension.requestIdType),
  };
}

export function getKenyaCoverageEligibilityLookupIdentifier(
  coverage: Pick<Coverage, 'identifier' | 'subscriberId'> | undefined
): KenyaCoverageEligibilityLookupIdentifier | undefined {
  const identifiers = coverage?.identifier ?? [];
  for (const identifier of identifiers) {
    const identificationType = getKenyaCoverageEligibilityTypeForIdentifier(identifier);
    if (identificationType && identifier.value?.trim()) {
      return { identificationType, identifier };
    }
  }

  if (coverage?.subscriberId?.trim()) {
    return {
      identificationType: 'SHA Number',
      identifier: {
        system: KenyaCoverageShaNumberIdentifierSystem,
        value: coverage.subscriberId,
      },
    };
  }

  return undefined;
}

export function setKenyaCoverageEligibilityLookupIdentifier(
  coverage: Coverage,
  identificationType: KenyaCoverageEligibilityIdentificationType,
  identificationNumber: string
): Coverage {
  const trimmedNumber = identificationNumber.trim();
  const nextIdentifier: Identifier = {
    system: getKenyaCoverageEligibilitySystem(identificationType),
    value: trimmedNumber,
    type: {
      text: identificationType,
      coding: [{ code: identificationType, display: identificationType }],
    },
  };

  const identifiers = [...(coverage.identifier ?? [])];
  const existingIndex = identifiers.findIndex(
    (identifier) => getKenyaCoverageEligibilityTypeForIdentifier(identifier) === identificationType
  );
  if (existingIndex >= 0) {
    identifiers[existingIndex] = { ...identifiers[existingIndex], ...nextIdentifier };
  } else {
    identifiers.push(nextIdentifier);
  }

  return {
    ...coverage,
    identifier: identifiers,
    subscriberId: identificationType === 'SHA Number' ? trimmedNumber : coverage.subscriberId,
  };
}

export function clearKenyaCoverageEligibilitySnapshot(coverage: Coverage): Coverage {
  if (!coverage.extension?.length) {
    return coverage;
  }

  return {
    ...coverage,
    extension: coverage.extension.filter((ext) => ext.url !== KenyaCoverageEligibilityExtension.baseUrl),
  };
}

export interface KenyaNationalClaimSubmissionResultInput {
  readonly status: string;
  readonly correlationId: string;
  readonly message: string;
  readonly nextState: string;
  readonly shaClaimsEnvironment?: string;
  readonly submissionEndpoint?: string;
  readonly statusTrackingEndpoint?: string;
  readonly responseStatusCode?: number;
  readonly bundleId?: string;
  readonly bundleEntryCount?: number;
  readonly workflowBot?: string;
  readonly workflowBotStatus?: string;
  readonly workflowBotMessage?: string;
}

export const KenyaNationalClaimSubmissionExtension = {
  baseUrl: 'https://afiax.africa/fhir/StructureDefinition/kenya-national-claim-submission',
  status: 'status',
  correlationId: 'correlationId',
  message: 'message',
  nextState: 'nextState',
  submittedAt: 'submittedAt',
  task: 'task',
  shaClaimsEnvironment: 'shaClaimsEnvironment',
  submissionEndpoint: 'submissionEndpoint',
  statusTrackingEndpoint: 'statusTrackingEndpoint',
  responseStatusCode: 'responseStatusCode',
  bundleId: 'bundleId',
  bundleEntryCount: 'bundleEntryCount',
  workflowBot: 'workflowBot',
  workflowBotStatus: 'workflowBotStatus',
  workflowBotMessage: 'workflowBotMessage',
} as const;

export interface KenyaNationalClaimSubmissionSnapshot {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly submittedAt?: string;
  readonly task?: Reference<Task>;
  readonly shaClaimsEnvironment?: string;
  readonly submissionEndpoint?: string;
  readonly statusTrackingEndpoint?: string;
  readonly responseStatusCode?: number;
  readonly bundleId?: string;
  readonly bundleEntryCount?: number;
  readonly workflowBot?: string;
  readonly workflowBotStatus?: string;
  readonly workflowBotMessage?: string;
}

export function buildKenyaNationalClaimSubmissionExtension(
  result: KenyaNationalClaimSubmissionResultInput,
  submittedAt: string,
  task?: Reference<Task>
): Extension {
  const extension: Extension = {
    url: KenyaNationalClaimSubmissionExtension.baseUrl,
    extension: [
      { url: KenyaNationalClaimSubmissionExtension.status, valueCode: result.status },
      { url: KenyaNationalClaimSubmissionExtension.correlationId, valueString: result.correlationId },
      { url: KenyaNationalClaimSubmissionExtension.message, valueString: result.message },
      { url: KenyaNationalClaimSubmissionExtension.nextState, valueString: result.nextState },
      { url: KenyaNationalClaimSubmissionExtension.submittedAt, valueDateTime: submittedAt },
    ],
  };

  if (task) {
    extension.extension?.push({ url: KenyaNationalClaimSubmissionExtension.task, valueReference: task });
  }
  pushString(extension, KenyaNationalClaimSubmissionExtension.shaClaimsEnvironment, result.shaClaimsEnvironment);
  pushString(extension, KenyaNationalClaimSubmissionExtension.submissionEndpoint, result.submissionEndpoint);
  pushString(extension, KenyaNationalClaimSubmissionExtension.statusTrackingEndpoint, result.statusTrackingEndpoint);
  if (result.responseStatusCode !== undefined) {
    extension.extension?.push({
      url: KenyaNationalClaimSubmissionExtension.responseStatusCode,
      valueUnsignedInt: result.responseStatusCode,
    });
  }
  pushString(extension, KenyaNationalClaimSubmissionExtension.bundleId, result.bundleId);
  pushString(extension, KenyaNationalClaimSubmissionExtension.workflowBot, result.workflowBot);
  pushString(extension, KenyaNationalClaimSubmissionExtension.workflowBotStatus, result.workflowBotStatus);
  pushString(extension, KenyaNationalClaimSubmissionExtension.workflowBotMessage, result.workflowBotMessage);
  if (result.bundleEntryCount !== undefined) {
    extension.extension?.push({
      url: KenyaNationalClaimSubmissionExtension.bundleEntryCount,
      valueUnsignedInt: result.bundleEntryCount,
    });
  }

  return extension;
}

export function getKenyaNationalClaimSubmissionSnapshot(
  claim: Pick<Claim, 'extension'> | undefined
): KenyaNationalClaimSubmissionSnapshot | undefined {
  if (!claim?.extension?.length) {
    return undefined;
  }

  const base = KenyaNationalClaimSubmissionExtension.baseUrl;
  const status = getExtensionValue(claim, base, KenyaNationalClaimSubmissionExtension.status);
  if (typeof status !== 'string' || !status) {
    return undefined;
  }

  const taskValue = getExtensionValue(claim, base, KenyaNationalClaimSubmissionExtension.task);
  return {
    status,
    correlationId: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.correlationId),
    message: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.message),
    nextState: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.nextState),
    submittedAt: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.submittedAt),
    task: isReference(taskValue) ? (taskValue as Reference<Task>) : undefined,
    shaClaimsEnvironment: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.shaClaimsEnvironment),
    submissionEndpoint: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.submissionEndpoint),
    statusTrackingEndpoint: getKenyaExtensionStringValue(
      claim,
      base,
      KenyaNationalClaimSubmissionExtension.statusTrackingEndpoint
    ),
    responseStatusCode: getKenyaExtensionNumberValue(claim, base, KenyaNationalClaimSubmissionExtension.responseStatusCode),
    bundleId: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.bundleId),
    bundleEntryCount: getKenyaExtensionNumberValue(claim, base, KenyaNationalClaimSubmissionExtension.bundleEntryCount),
    workflowBot: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.workflowBot),
    workflowBotStatus: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.workflowBotStatus),
    workflowBotMessage: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimSubmissionExtension.workflowBotMessage),
  };
}

export function clearKenyaNationalClaimSubmissionSnapshot(claim: Claim): Claim {
  if (!claim.extension?.length) {
    return claim;
  }

  return {
    ...claim,
    extension: claim.extension.filter((ext) => ext.url !== KenyaNationalClaimSubmissionExtension.baseUrl),
  };
}

export interface KenyaNationalClaimStatusResultInput {
  readonly status: string;
  readonly correlationId: string;
  readonly message: string;
  readonly nextState: string;
  readonly shaClaimsEnvironment?: string;
  readonly statusEndpoint?: string;
  readonly responseStatusCode?: number;
  readonly claimId?: string;
  readonly claimState?: string;
  readonly workflowBot?: string;
  readonly workflowBotStatus?: string;
  readonly workflowBotMessage?: string;
}

export const KenyaNationalClaimStatusExtension = {
  baseUrl: 'https://afiax.africa/fhir/StructureDefinition/kenya-national-claim-status',
  status: 'status',
  correlationId: 'correlationId',
  message: 'message',
  nextState: 'nextState',
  checkedAt: 'checkedAt',
  task: 'task',
  claimResponse: 'claimResponse',
  shaClaimsEnvironment: 'shaClaimsEnvironment',
  statusEndpoint: 'statusEndpoint',
  responseStatusCode: 'responseStatusCode',
  claimId: 'claimId',
  claimState: 'claimState',
  workflowBot: 'workflowBot',
  workflowBotStatus: 'workflowBotStatus',
  workflowBotMessage: 'workflowBotMessage',
} as const;

export interface KenyaNationalClaimStatusSnapshot {
  readonly status?: string;
  readonly correlationId?: string;
  readonly message?: string;
  readonly nextState?: string;
  readonly checkedAt?: string;
  readonly task?: Reference<Task>;
  readonly claimResponse?: Reference<ClaimResponse>;
  readonly shaClaimsEnvironment?: string;
  readonly statusEndpoint?: string;
  readonly responseStatusCode?: number;
  readonly claimId?: string;
  readonly claimState?: string;
  readonly workflowBot?: string;
  readonly workflowBotStatus?: string;
  readonly workflowBotMessage?: string;
}

export function buildKenyaNationalClaimStatusExtension(
  result: KenyaNationalClaimStatusResultInput,
  checkedAt: string,
  references?: {
    readonly task?: Reference<Task>;
    readonly claimResponse?: Reference<ClaimResponse>;
  }
): Extension {
  const extension: Extension = {
    url: KenyaNationalClaimStatusExtension.baseUrl,
    extension: [
      { url: KenyaNationalClaimStatusExtension.status, valueCode: result.status },
      { url: KenyaNationalClaimStatusExtension.correlationId, valueString: result.correlationId },
      { url: KenyaNationalClaimStatusExtension.message, valueString: result.message },
      { url: KenyaNationalClaimStatusExtension.nextState, valueString: result.nextState },
      { url: KenyaNationalClaimStatusExtension.checkedAt, valueDateTime: checkedAt },
    ],
  };

  if (references?.task) {
    extension.extension?.push({ url: KenyaNationalClaimStatusExtension.task, valueReference: references.task });
  }
  if (references?.claimResponse) {
    extension.extension?.push({
      url: KenyaNationalClaimStatusExtension.claimResponse,
      valueReference: references.claimResponse,
    });
  }
  pushString(extension, KenyaNationalClaimStatusExtension.shaClaimsEnvironment, result.shaClaimsEnvironment);
  pushString(extension, KenyaNationalClaimStatusExtension.statusEndpoint, result.statusEndpoint);
  if (result.responseStatusCode !== undefined) {
    extension.extension?.push({
      url: KenyaNationalClaimStatusExtension.responseStatusCode,
      valueUnsignedInt: result.responseStatusCode,
    });
  }
  pushString(extension, KenyaNationalClaimStatusExtension.claimId, result.claimId);
  pushString(extension, KenyaNationalClaimStatusExtension.claimState, result.claimState);
  pushString(extension, KenyaNationalClaimStatusExtension.workflowBot, result.workflowBot);
  pushString(extension, KenyaNationalClaimStatusExtension.workflowBotStatus, result.workflowBotStatus);
  pushString(extension, KenyaNationalClaimStatusExtension.workflowBotMessage, result.workflowBotMessage);

  return extension;
}

export function getKenyaNationalClaimStatusSnapshot(
  claim: Pick<Claim, 'extension'> | undefined
): KenyaNationalClaimStatusSnapshot | undefined {
  if (!claim?.extension?.length) {
    return undefined;
  }

  const base = KenyaNationalClaimStatusExtension.baseUrl;
  const status = getExtensionValue(claim, base, KenyaNationalClaimStatusExtension.status);
  if (typeof status !== 'string' || !status) {
    return undefined;
  }

  const taskValue = getExtensionValue(claim, base, KenyaNationalClaimStatusExtension.task);
  const claimResponseValue = getExtensionValue(claim, base, KenyaNationalClaimStatusExtension.claimResponse);
  return {
    status,
    correlationId: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.correlationId),
    message: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.message),
    nextState: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.nextState),
    checkedAt: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.checkedAt),
    task: isReference(taskValue) ? (taskValue as Reference<Task>) : undefined,
    claimResponse: isReference(claimResponseValue) ? (claimResponseValue as Reference<ClaimResponse>) : undefined,
    shaClaimsEnvironment: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.shaClaimsEnvironment),
    statusEndpoint: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.statusEndpoint),
    responseStatusCode: getKenyaExtensionNumberValue(claim, base, KenyaNationalClaimStatusExtension.responseStatusCode),
    claimId: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.claimId),
    claimState: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.claimState),
    workflowBot: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.workflowBot),
    workflowBotStatus: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.workflowBotStatus),
    workflowBotMessage: getKenyaExtensionStringValue(claim, base, KenyaNationalClaimStatusExtension.workflowBotMessage),
  };
}

export function clearKenyaNationalClaimStatusSnapshot(claim: Claim): Claim {
  if (!claim.extension?.length) {
    return claim;
  }

  return {
    ...claim,
    extension: claim.extension.filter((ext) => ext.url !== KenyaNationalClaimStatusExtension.baseUrl),
  };
}

function getKenyaCoverageEligibilityTypeForIdentifier(
  identifier: Identifier | undefined
): KenyaCoverageEligibilityIdentificationType | undefined {
  if (!identifier?.value?.trim()) {
    return undefined;
  }

  switch (identifier.system) {
    case KenyaCoverageNationalIdIdentifierSystem:
      return 'National ID';
    case KenyaCoverageAlienIdIdentifierSystem:
      return 'Alien ID';
    case KenyaCoverageMandateNumberIdentifierSystem:
      return 'Mandate Number';
    case KenyaCoverageTemporaryIdIdentifierSystem:
      return 'Temporary ID';
    case KenyaCoverageShaNumberIdentifierSystem:
      return 'SHA Number';
    case KenyaCoverageRefugeeIdIdentifierSystem:
      return 'Refugee ID';
    default:
      break;
  }

  const typeText = identifier.type?.text?.trim();
  if (
    typeText === 'National ID' ||
    typeText === 'Alien ID' ||
    typeText === 'Mandate Number' ||
    typeText === 'Temporary ID' ||
    typeText === 'SHA Number' ||
    typeText === 'Refugee ID'
  ) {
    return typeText;
  }

  for (const coding of identifier.type?.coding ?? []) {
    if (
      coding.code === 'National ID' ||
      coding.code === 'Alien ID' ||
      coding.code === 'Mandate Number' ||
      coding.code === 'Temporary ID' ||
      coding.code === 'SHA Number' ||
      coding.code === 'Refugee ID'
    ) {
      return coding.code;
    }
  }

  return undefined;
}

function getKenyaCoverageEligibilitySystem(
  identificationType: KenyaCoverageEligibilityIdentificationType
): string {
  switch (identificationType) {
    case 'National ID':
      return KenyaCoverageNationalIdIdentifierSystem;
    case 'Alien ID':
      return KenyaCoverageAlienIdIdentifierSystem;
    case 'Mandate Number':
      return KenyaCoverageMandateNumberIdentifierSystem;
    case 'Temporary ID':
      return KenyaCoverageTemporaryIdIdentifierSystem;
    case 'SHA Number':
      return KenyaCoverageShaNumberIdentifierSystem;
    case 'Refugee ID':
      return KenyaCoverageRefugeeIdIdentifierSystem;
  }
}

// ─── IDSR: Integrated Disease Surveillance and Response ───────────────────────
// Immediately notifiable conditions under:
//   Kenya Health Act 2017 s.57-63
//   Kenya IDSR Technical Guidelines 3rd Edition (2024)
//   IHR 2005 (International Health Regulations)
// Notification must reach the County Director of Health within 24 hours of
// clinical suspicion (not confirmed diagnosis).

export const KenyaIdsrImmediateNotificationCodes = [
  'A00',   // Cholera
  'A01',   // Typhoid fever
  'A20',   // Plague
  'A22',   // Anthrax
  'A33',   // Neonatal tetanus
  'A36',   // Diphtheria
  'A39',   // Meningococcal disease
  'A80',   // Acute poliomyelitis / AFP
  'A82',   // Rabies
  'A95',   // Yellow fever
  'A96',   // Arenaviral haemorrhagic fever
  'A98.4', // Ebola virus disease
  'A98.5', // Marburg virus disease
  'A99',   // Unspecified viral haemorrhagic fever
  'B03',   // Smallpox
  'B04',   // Mpox (monkeypox)
  'B05',   // Measles
  'J09',   // Influenza A (novel/pandemic subtype)
  'U07.1', // COVID-19
] as const;

export type KenyaIdsrImmediateNotificationCode = (typeof KenyaIdsrImmediateNotificationCodes)[number];

export const KenyaIdsrConditionDisplay: Record<string, string> = {
  'A00': 'Cholera',
  'A01': 'Typhoid fever',
  'A20': 'Plague',
  'A22': 'Anthrax',
  'A33': 'Neonatal tetanus',
  'A36': 'Diphtheria',
  'A39': 'Meningococcal disease',
  'A80': 'Acute poliomyelitis / AFP',
  'A82': 'Rabies',
  'A95': 'Yellow fever',
  'A96': 'Arenaviral haemorrhagic fever',
  'A98.4': 'Ebola virus disease',
  'A98.5': 'Marburg virus disease',
  'A99': 'Unspecified viral haemorrhagic fever',
  'B03': 'Smallpox',
  'B04': 'Mpox (monkeypox)',
  'B05': 'Measles',
  'J09': 'Influenza A (novel/pandemic subtype)',
  'U07.1': 'COVID-19',
};

export const KenyaIdsrCodeSystem = 'http://hl7.org/fhir/sid/icd-10';
export const KenyaIdsrValueSetUrl = 'https://afiax.africa/ValueSet/kenya-idsr-immediate-notification-conditions';
export const KenyaIdsrCorrelationIdSystem = 'https://afiax.africa/identifier/idsr-correlation-id';

export const KenyaIdsrNotificationExtension = {
  baseUrl: 'https://afiax.africa/fhir/StructureDefinition/kenya-idsr-notification',
  status: 'status',
  conditionCode: 'conditionCode',
  conditionDisplay: 'conditionDisplay',
  notifiedAt: 'notifiedAt',
  correlationId: 'correlationId',
  task: 'task',
} as const;

export type IdsrNotificationStatus = 'pending' | 'reported' | 'error';

export interface KenyaIdsrNotificationSnapshot {
  readonly status?: IdsrNotificationStatus;
  readonly conditionCode?: string;
  readonly conditionDisplay?: string;
  readonly notifiedAt?: string;
  readonly correlationId?: string;
  readonly task?: Reference<Task>;
}

export function isKenyaIdsrImmediateNotificationCode(code: string): boolean {
  return (KenyaIdsrImmediateNotificationCodes as readonly string[]).includes(code);
}

export function getKenyaIdsrConditionCode(condition: { code?: { coding?: Array<{ system?: string; code?: string }> } }): string | undefined {
  for (const coding of condition.code?.coding ?? []) {
    if (coding.code && isKenyaIdsrImmediateNotificationCode(coding.code)) {
      return coding.code;
    }
  }
  return undefined;
}

export function buildKenyaIdsrNotificationExtension(
  status: IdsrNotificationStatus,
  conditionCode: string,
  notifiedAt: string,
  correlationId: string,
  task?: Reference<Task>
): Extension {
  const extension: Extension = {
    url: KenyaIdsrNotificationExtension.baseUrl,
    extension: [
      { url: KenyaIdsrNotificationExtension.status, valueCode: status },
      { url: KenyaIdsrNotificationExtension.conditionCode, valueCode: conditionCode },
      { url: KenyaIdsrNotificationExtension.conditionDisplay, valueString: KenyaIdsrConditionDisplay[conditionCode] ?? conditionCode },
      { url: KenyaIdsrNotificationExtension.notifiedAt, valueDateTime: notifiedAt },
      { url: KenyaIdsrNotificationExtension.correlationId, valueString: correlationId },
    ],
  };

  if (task) {
    extension.extension?.push({ url: KenyaIdsrNotificationExtension.task, valueReference: task });
  }

  return extension;
}

// ─── KHIS: Kenya Health Information System (DHIS2) weekly aggregate export ────
// Implements MOH 505 weekly epidemiological bulletin reporting to KHIS (DHIS2).
// Legislative basis:
//   Kenya Health Act 2017 s.57-63 (disease notification)
//   Kenya IDSR Technical Guidelines 3rd Edition (2024) — weekly reporting tier
//   Digital Health Act 2023 s.24 (health data interoperability)
// Weekly notifiable conditions extend the immediate list with endemic diseases
// tracked in the MOH 505 bulletin (malaria, TB, ARI, diarrhoeal diseases, etc.).

export const KenyaKhisWeeklyNotificationCodes = [
  // ── Immediately notifiable (superset of KenyaIdsrImmediateNotificationCodes) ──
  'A00',   // Cholera
  'A01',   // Typhoid fever
  'A20',   // Plague
  'A22',   // Anthrax
  'A33',   // Neonatal tetanus
  'A36',   // Diphtheria
  'A39',   // Meningococcal disease
  'A80',   // Acute poliomyelitis / AFP
  'A82',   // Rabies
  'A95',   // Yellow fever
  'A96',   // Arenaviral haemorrhagic fever
  'A98.4', // Ebola virus disease
  'A98.5', // Marburg virus disease
  'A99',   // Unspecified viral haemorrhagic fever
  'B03',   // Smallpox
  'B04',   // Mpox (monkeypox)
  'B05',   // Measles
  'J09',   // Influenza A (novel/pandemic subtype)
  'U07.1', // COVID-19
  // ── Weekly reportable (MOH 505 endemic disease surveillance) ─────────────────
  'A15',   // Respiratory tuberculosis (confirmed bacteriologically/histologically)
  'A16',   // Respiratory tuberculosis (not confirmed)
  'A17',   // Tuberculosis of nervous system
  'A06',   // Amoebiasis
  'A09',   // Other and unspecified gastroenteritis and colitis (diarrhoeal diseases)
  'A27',   // Leptospirosis
  'A30',   // Leprosy
  'A75',   // Typhus fever
  'A90',   // Dengue fever
  'A92',   // Other mosquito-borne viral fevers (Rift Valley Fever, Chikungunya)
  'B50',   // Plasmodium falciparum malaria
  'B51',   // Plasmodium vivax malaria
  'B54',   // Unspecified malaria
  'B55',   // Leishmaniasis
  'B74',   // Filariasis
  'G00',   // Bacterial meningitis
  'G03',   // Meningitis due to other and unspecified causes
  'J00',   // Acute nasopharyngitis (common cold)
  'J06',   // Acute upper respiratory infections, multiple and unspecified
  'J18',   // Pneumonia, unspecified organism
  'K52',   // Other and unspecified noninfective gastroenteritis and colitis
] as const;

export type KenyaKhisWeeklyNotificationCode = (typeof KenyaKhisWeeklyNotificationCodes)[number];

export const KenyaKhisWeeklyConditionDisplay: Record<string, string> = {
  'A00': 'Cholera',
  'A01': 'Typhoid fever',
  'A06': 'Amoebiasis',
  'A09': 'Diarrhoeal diseases',
  'A15': 'Tuberculosis (confirmed)',
  'A16': 'Tuberculosis (unconfirmed)',
  'A17': 'Tuberculosis of nervous system',
  'A20': 'Plague',
  'A22': 'Anthrax',
  'A27': 'Leptospirosis',
  'A30': 'Leprosy',
  'A33': 'Neonatal tetanus',
  'A36': 'Diphtheria',
  'A39': 'Meningococcal disease',
  'A75': 'Typhus fever',
  'A80': 'Acute poliomyelitis / AFP',
  'A82': 'Rabies',
  'A90': 'Dengue fever',
  'A92': 'Other mosquito-borne viral fevers (RVF, Chikungunya)',
  'A95': 'Yellow fever',
  'A96': 'Arenaviral haemorrhagic fever',
  'A98.4': 'Ebola virus disease',
  'A98.5': 'Marburg virus disease',
  'A99': 'Unspecified viral haemorrhagic fever',
  'B03': 'Smallpox',
  'B04': 'Mpox (monkeypox)',
  'B05': 'Measles',
  'B50': 'Malaria (P. falciparum)',
  'B51': 'Malaria (P. vivax)',
  'B54': 'Malaria (unspecified)',
  'B55': 'Leishmaniasis',
  'B74': 'Filariasis',
  'G00': 'Bacterial meningitis',
  'G03': 'Meningitis (other/unspecified)',
  'J00': 'Acute nasopharyngitis (ARI)',
  'J06': 'Acute upper respiratory infection',
  'J09': 'Influenza A (novel/pandemic subtype)',
  'J18': 'Pneumonia (unspecified)',
  'K52': 'Acute gastroenteritis',
  'U07.1': 'COVID-19',
};

export const KenyaKhisBaseUrls = {
  uat: 'https://hiskenya-uat.health.go.ke',
  production: 'https://hiskenya.org',
} as const;

export const KenyaKhisCorrelationIdSystem = 'https://afiax.africa/identifier/khis-export-correlation-id';

export const KenyaKhisWeeklyExportExtension = {
  baseUrl: 'https://afiax.africa/fhir/StructureDefinition/kenya-khis-weekly-export',
  status: 'status',
  period: 'period',
  facilityOrgUnit: 'facilityOrgUnit',
  exportedAt: 'exportedAt',
  correlationId: 'correlationId',
  conditionCount: 'conditionCount',
  dhis2ImportStatus: 'dhis2ImportStatus',
  dhis2ImportCount: 'dhis2ImportCount',
  task: 'task',
} as const;

export type KhisWeeklyExportStatus = 'pending' | 'exported' | 'error';

export interface KenyaKhisWeeklyExportSnapshot {
  readonly status?: KhisWeeklyExportStatus;
  readonly period?: string;
  readonly facilityOrgUnit?: string;
  readonly exportedAt?: string;
  readonly correlationId?: string;
  readonly conditionCount?: number;
  readonly dhis2ImportStatus?: string;
  readonly dhis2ImportCount?: number;
  readonly task?: Reference<Task>;
}

export function isKenyaKhisWeeklyNotificationCode(code: string): boolean {
  return (KenyaKhisWeeklyNotificationCodes as readonly string[]).includes(code);
}

export function toKhisWeekPeriod(date: Date): string {
  // Returns DHIS2 ISO week period format: YYYYWnn (e.g. 2026W24)
  // Uses ISO 8601 week numbering (week starts Monday)
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}W${String(weekNo).padStart(2, '0')}`;
}

export function khisWeekPeriodToDateRange(period: string): { start: Date; end: Date } {
  // Parse YYYYWnn → Monday 00:00 UTC → Sunday 23:59:59 UTC of that ISO week
  const match = /^(\d{4})W(\d{2})$/.exec(period);
  if (!match) {
    throw new Error(`Invalid KHIS week period format: "${period}". Expected YYYYWnn (e.g. 2026W24).`);
  }
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  // Jan 4 is always in week 1 of the ISO year
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const weekStart = new Date(jan4.getTime() - (jan4Day - 1) * 86400000 + (week - 1) * 7 * 86400000);
  const weekEnd = new Date(weekStart.getTime() + 7 * 86400000 - 1);
  return { start: weekStart, end: weekEnd };
}

export function buildKenyaKhisWeeklyExportExtension(
  status: KhisWeeklyExportStatus,
  period: string,
  exportedAt: string,
  correlationId: string,
  options?: {
    facilityOrgUnit?: string;
    conditionCount?: number;
    dhis2ImportStatus?: string;
    dhis2ImportCount?: number;
    task?: Reference<Task>;
  }
): Extension {
  const extension: Extension = {
    url: KenyaKhisWeeklyExportExtension.baseUrl,
    extension: [
      { url: KenyaKhisWeeklyExportExtension.status, valueCode: status },
      { url: KenyaKhisWeeklyExportExtension.period, valueString: period },
      { url: KenyaKhisWeeklyExportExtension.exportedAt, valueDateTime: exportedAt },
      { url: KenyaKhisWeeklyExportExtension.correlationId, valueString: correlationId },
    ],
  };

  const ext = extension.extension!;
  if (options?.facilityOrgUnit) {
    ext.push({ url: KenyaKhisWeeklyExportExtension.facilityOrgUnit, valueString: options.facilityOrgUnit });
  }
  if (options?.conditionCount !== undefined) {
    ext.push({ url: KenyaKhisWeeklyExportExtension.conditionCount, valueInteger: options.conditionCount });
  }
  if (options?.dhis2ImportStatus) {
    ext.push({ url: KenyaKhisWeeklyExportExtension.dhis2ImportStatus, valueString: options.dhis2ImportStatus });
  }
  if (options?.dhis2ImportCount !== undefined) {
    ext.push({ url: KenyaKhisWeeklyExportExtension.dhis2ImportCount, valueInteger: options.dhis2ImportCount });
  }
  if (options?.task) {
    ext.push({ url: KenyaKhisWeeklyExportExtension.task, valueReference: options.task });
  }

  return extension;
}

export function getKenyaIdsrNotificationSnapshot(
  condition: { extension?: Extension[] } | undefined
): KenyaIdsrNotificationSnapshot | undefined {
  if (!condition?.extension?.length) {
    return undefined;
  }

  const base = KenyaIdsrNotificationExtension.baseUrl;
  const parentExt = condition.extension.find((e) => e.url === base);
  if (!parentExt?.extension?.length) {
    return undefined;
  }

  function child(url: string): string | undefined {
    const val = parentExt?.extension?.find((e) => e.url === url);
    return val?.valueCode ?? val?.valueString ?? val?.valueDateTime ?? undefined;
  }

  const status = child(KenyaIdsrNotificationExtension.status);
  if (!status) {
    return undefined;
  }

  const taskVal = parentExt.extension.find((e) => e.url === KenyaIdsrNotificationExtension.task);

  return {
    status: status as IdsrNotificationStatus,
    conditionCode: child(KenyaIdsrNotificationExtension.conditionCode),
    conditionDisplay: child(KenyaIdsrNotificationExtension.conditionDisplay),
    notifiedAt: child(KenyaIdsrNotificationExtension.notifiedAt),
    correlationId: child(KenyaIdsrNotificationExtension.correlationId),
    task: taskVal?.valueReference as Reference<Task> | undefined,
  };
}
