// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The Shared Health Record (SHR) for an Encounter (Kenya). See country-pack/kenya/hie-shr.ts for
// DHA's lifecycle and sources. The SHR consent (consent id, OTP record, visit id and the per-visit
// consent token) is kept on the encounter in the kenya-shr-visit extension; the token is never sent
// back to the caller and never reused for another encounter or patient.
//
// Not built: assembling a bundle from this encounter's records. DHA does not publish the
// non-emergency SHR profiles, nor how the bundle's EpisodeOfCare relates to the SHR visit_id; the
// publish action therefore sends a bundle the caller supplies, after checking every rule DHA states.
import { allOk, badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Bundle,
  Encounter,
  Extension,
  OperationDefinition,
  OperationDefinitionParameter,
  Practitioner,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type { KenyaShrConsent } from '../../country-pack/kenya/hie-shr';
import {
  closeKenyaShrVisit,
  getKenyaShrConsentStatus,
  getKenyaShrObservations,
  getKenyaShrOpenVisits,
  getKenyaShrPatientRecords,
  getKenyaShrReferrals,
  getKenyaShrSecurityLabels,
  refreshKenyaShrVisit,
  requestKenyaShrConsent,
  resendKenyaShrConsentOtp,
  submitKenyaShrBundle,
  verifyKenyaShrConsent,
} from '../../country-pack/kenya/hie-shr';
import type { VisitContext } from './kenyashavisit';
import { callHie, loadVisitContext } from './kenyashavisit';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

/** A practitioner's DHA Health Worker Registry PUID, when recorded on the Practitioner. */
export const KenyaDhaPuidSystem = 'https://afiax.africa/kenya/identifier/dha-puid';

export const KenyaShrVisitExtension = {
  url: 'https://afiax.africa/fhir/StructureDefinition/kenya-shr-visit',
  consentId: 'consentId',
  consentStatus: 'consentStatus',
  otpRecord: 'otpRecord',
  visitId: 'visitId',
  consentToken: 'consentToken',
  closeOtpRecord: 'closeOtpRecord',
  endDate: 'endDate',
  updatedAt: 'updatedAt',
} as const;

const Actions = [
  'open-visits',
  'request-consent',
  'verify',
  'refuse',
  'status',
  'resend-otp',
  'refresh',
  'close',
  'verify-close',
  'records',
  'observations',
  'referrals',
  'labels',
  'publish',
] as const;

const str = (name: string, documentation?: string): OperationDefinitionParameter => ({
  use: 'in',
  name,
  type: 'string',
  min: 0,
  max: '1',
  ...(documentation ? { documentation } : {}),
});

export const kenyaShrOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'encounter-kenya-shr',
  name: 'KenyaShr',
  title: 'Shared Health Record for an encounter: consent, read, publish, close (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-shr',
  resource: ['Encounter'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'action', type: 'code', min: 1, max: '1', documentation: Actions.join(' | ') },
    { use: 'in', name: 'visitType', type: 'code', min: 0, max: '1', documentation: 'OP | IP (default from class)' },
    str('requestedBy', 'Who is asking, for DHA audit (default: the signed-in user)'),
    str('practitionerId', "The clinician's DHA PUID (default: the practitioner's PUID identifier)"),
    str('facilityFrCode'),
    { use: 'in', name: 'startDate', type: 'date', min: 0, max: '1' },
    str('incapacityReason', 'Emergency consent, or closing for a patient who cannot consent'),
    { use: 'in', name: 'emergency', type: 'boolean', min: 0, max: '1' },
    str('representativeCrId'),
    str('representativeRelationship', 'Healthcare Proxy | Sibling | Principal | Other'),
    str('otp'),
    str('rejectionReason'),
    { use: 'in', name: 'resources', type: 'string', min: 0, max: '*' },
    str('pageToken'),
    { use: 'in', name: 'direction', type: 'code', min: 0, max: '1', documentation: 'incoming | outgoing' },
    { use: 'in', name: 'status', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'count', type: 'integer', min: 0, max: '1' },
    str('resourceName'),
    str('code'),
    { use: 'in', name: 'bundle', type: 'Bundle', min: 0, max: '1' },
    { use: 'out', name: 'result', type: 'string', min: 1, max: '1', documentation: 'The DHA result, as JSON.' },
    { use: 'out', name: 'encounter', type: 'Reference', min: 0, max: '1' },
  ],
};

interface ShrParameters {
  readonly action: string;
  readonly visitType?: string;
  readonly requestedBy?: string;
  readonly practitionerId?: string;
  readonly facilityFrCode?: string;
  readonly startDate?: string;
  readonly incapacityReason?: string;
  readonly emergency?: boolean;
  readonly representativeCrId?: string;
  readonly representativeRelationship?: string;
  readonly otp?: string;
  readonly rejectionReason?: string;
  readonly resources?: string[] | string;
  readonly pageToken?: string;
  readonly direction?: string;
  readonly status?: string;
  readonly count?: number;
  readonly resourceName?: string;
  readonly code?: string;
  readonly bundle?: Bundle;
}

function need<T>(value: T | undefined, name: string): T {
  if (value === undefined || (typeof value === 'string' && !value.trim())) {
    throw new OperationOutcomeError(badRequest(`${name} is required for this action`));
  }
  return value;
}

function getShr(encounter: Encounter): Extension | undefined {
  return encounter.extension?.find((e) => e.url === KenyaShrVisitExtension.url);
}

function value(shr: Extension | undefined, url: string): string | undefined {
  return shr?.extension?.find((e) => e.url === url)?.valueString;
}

/**
 * What the caller sees of the consent: never the token.
 * @param consent - The consent from DHA.
 * @returns The consent without its token.
 */
function publicConsent(consent: KenyaShrConsent): Omit<KenyaShrConsent, 'consentToken'> & { tokenIssued: boolean } {
  const { consentToken, ...rest } = consent;
  return { ...rest, tokenIssued: !!consentToken };
}

async function save(
  context: VisitContext,
  values: Record<string, string | null | undefined>,
  remove: readonly string[] = []
): Promise<Encounter> {
  const { encounter } = context;
  const previous = getShr(encounter);
  const drop = new Set([...Object.keys(values), ...remove]);
  const next: Extension[] = (previous?.extension ?? []).filter((e) => !drop.has(e.url));
  for (const [url, v] of Object.entries(values)) {
    if (v) {
      next.push({ url, valueString: v });
    }
  }
  next.push({ url: KenyaShrVisitExtension.updatedAt, valueString: new Date().toISOString() });
  const others = (encounter.extension ?? []).filter((e) => e.url !== KenyaShrVisitExtension.url);
  const ctx = getAuthenticatedContext();
  // As the caller, failing if the encounter changed since it was read.
  return ctx.repo.updateResource<Encounter>(
    { ...encounter, extension: [...others, { url: KenyaShrVisitExtension.url, extension: next }] },
    { ifMatch: encounter.meta?.versionId }
  );
}

function consentValues(consent: KenyaShrConsent): Record<string, string | null> {
  return {
    [KenyaShrVisitExtension.consentId]: consent.consentId,
    [KenyaShrVisitExtension.consentStatus]: consent.consentStatus,
    [KenyaShrVisitExtension.otpRecord]: consent.otpRecord,
    [KenyaShrVisitExtension.visitId]: consent.visitId,
    [KenyaShrVisitExtension.consentToken]: consent.consentToken,
  };
}

async function practitionerPuid(params: ShrParameters): Promise<string | undefined> {
  if (params.practitionerId?.trim()) {
    return params.practitionerId.trim();
  }
  const ctx = getAuthenticatedContext();
  if (!ctx.profile.reference?.startsWith('Practitioner/')) {
    return undefined;
  }
  const practitioner = await ctx.repo.readReference<Practitioner>(ctx.profile as { reference: string });
  return practitioner.identifier?.find((i) => i.system === KenyaDhaPuidSystem)?.value?.trim();
}

/**
 * Checks every patient reference in a bundle points at this patient (the SHR identifies patients
 * by Client Registry ID, as in DHA's examples: Patient/CR...).
 * @param bundle - The bundle.
 * @param crId - The encounter patient's Client Registry ID.
 */
function checkPatient(bundle: Bundle, crId: string): void {
  const expected = `Patient/${crId}`;
  for (const entry of bundle.entry ?? []) {
    const r = entry.resource as Record<string, unknown> | undefined;
    for (const field of ['subject', 'patient']) {
      const ref = (r?.[field] as { reference?: string } | undefined)?.reference;
      if (ref && ref !== expected) {
        throw new OperationOutcomeError(
          badRequest(`${String(r?.resourceType)}/${String(r?.id)} is for ${ref}, not this patient (${expected}).`)
        );
      }
    }
  }
}

/**
 * Handles POST Encounter/:id/$kenya-shr. One action per call:
 * - open-visits: the patient's open SHR visits at the facility; one is adopted and its token refreshed
 * - request-consent: standard, emergency (emergency + incapacityReason) or dependant
 *   (representativeCrId + representativeRelationship)
 * - verify (otp) or refuse (rejectionReason); status; resend-otp; refresh
 * - close (optional incapacityReason), then verify-close (otp) when DHA asks for a password
 * - records (resources, pageToken), observations (pageToken), referrals (direction), labels
 * - publish: a caller-supplied collection Bundle, checked against DHA's rules
 * @param req - The FHIR request.
 * @returns The DHA result as JSON (never the consent token), and the encounter when updated.
 */
export async function kenyaShrHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ShrParameters>(kenyaShrOperation, req);
  const action = params.action as (typeof Actions)[number];
  if (!Actions.includes(action)) {
    throw new OperationOutcomeError(badRequest(`action must be one of ${Actions.join(', ')}`));
  }
  const context = await loadVisitContext(req);
  const { credentials, encounter, patientCrId } = context;
  const shr = getShr(encounter);
  const consentId = value(shr, KenyaShrVisitExtension.consentId);
  const visitId = value(shr, KenyaShrVisitExtension.visitId);
  const token = value(shr, KenyaShrVisitExtension.consentToken);
  const closed = !!value(shr, KenyaShrVisitExtension.endDate);
  const facilityFrCode = params.facilityFrCode?.trim() || credentials.facilityId;

  const requireToken = (): string => {
    if (!token || closed) {
      throw new OperationOutcomeError(
        badRequest(
          closed ? 'The SHR visit is closed.' : 'No SHR consent for this encounter yet: request and verify it first.'
        )
      );
    }
    return token;
  };
  const requireFacility = (): string => need(facilityFrCode, "facilityFrCode (the facility's FID-... code)");

  let result: unknown;
  let updated: Encounter | undefined;
  switch (action) {
    case 'open-visits': {
      const visits = await callHie(() => getKenyaShrOpenVisits(credentials, patientCrId, requireFacility()));
      result = { visits };
      if (visits.length && !visitId) {
        // DHA: reuse the open visit and refresh its token rather than a new OTP.
        const refreshed = await callHie(() => refreshKenyaShrVisit(credentials, visits[0]));
        updated = await save(context, {
          [KenyaShrVisitExtension.visitId]: visits[0],
          [KenyaShrVisitExtension.consentToken]: refreshed.consentToken,
          [KenyaShrVisitExtension.consentStatus]: 'Approved',
        });
        result = { visits, adopted: visits[0], tokenIssued: !!refreshed.consentToken };
      }
      break;
    }
    case 'request-consent': {
      if (token && !closed) {
        throw new OperationOutcomeError(badRequest('This encounter already has an open SHR consent.'));
      }
      const ctx = getAuthenticatedContext();
      const visitType = (params.visitType?.trim().toUpperCase() || (encounter.class?.code === 'IMP' ? 'IP' : 'OP')) as
        | 'OP'
        | 'IP';
      const practitionerId = await practitionerPuid(params);
      const consent = await callHie(() =>
        requestKenyaShrConsent(credentials, {
          crId: patientCrId,
          facilityFrCode: requireFacility(),
          requestedBy:
            params.requestedBy?.trim() || ctx.profile.display || ctx.membership.profile.display || 'Clinician',
          visitType,
          ...(practitionerId ? { practitionerId } : {}),
          ...(params.startDate ? { startDate: params.startDate } : {}),
          ...(params.emergency
            ? { emergency: { incapacityReason: need(params.incapacityReason, 'incapacityReason') } }
            : {}),
          ...(params.representativeCrId
            ? {
                representative: {
                  crId: params.representativeCrId,
                  relationship: need(params.representativeRelationship, 'representativeRelationship'),
                  ...(params.incapacityReason ? { incapacityReason: params.incapacityReason } : {}),
                },
              }
            : {}),
        })
      );
      result = publicConsent(consent);
      updated = await save(context, consentValues(consent), [
        KenyaShrVisitExtension.endDate,
        KenyaShrVisitExtension.closeOtpRecord,
      ]);
      break;
    }
    case 'verify':
    case 'refuse': {
      const consent = await callHie(() =>
        verifyKenyaShrConsent(
          credentials,
          need(consentId, 'A consent request'),
          action === 'verify'
            ? { otpRecord: value(shr, KenyaShrVisitExtension.otpRecord), otp: need(params.otp, 'otp') }
            : {
                rejectionReason: need(params.rejectionReason, 'rejectionReason'),
                otpRecord: value(shr, KenyaShrVisitExtension.otpRecord),
              }
        )
      );
      result = publicConsent(consent);
      updated = await save(context, consentValues(consent));
      break;
    }
    case 'status': {
      const consent = await callHie(() => getKenyaShrConsentStatus(credentials, need(consentId, 'A consent request')));
      result = publicConsent(consent);
      updated = await save(context, {
        [KenyaShrVisitExtension.consentStatus]: consent.consentStatus,
        [KenyaShrVisitExtension.visitId]: consent.visitId,
      });
      break;
    }
    case 'resend-otp': {
      const consent = await callHie(() => resendKenyaShrConsentOtp(credentials, need(consentId, 'A consent request')));
      result = publicConsent(consent);
      // DHA: verify with the new otp_record.
      updated = await save(context, { [KenyaShrVisitExtension.otpRecord]: consent.otpRecord });
      break;
    }
    case 'refresh': {
      if (closed) {
        throw new OperationOutcomeError(badRequest('The SHR visit is closed; its token cannot be refreshed.'));
      }
      const consent = await callHie(() => refreshKenyaShrVisit(credentials, need(visitId, 'An SHR visit')));
      result = publicConsent(consent);
      updated = await save(context, { [KenyaShrVisitExtension.consentToken]: consent.consentToken });
      break;
    }
    case 'close': {
      if (closed) {
        throw new OperationOutcomeError(badRequest('The SHR visit is already closed.'));
      }
      const consent = await callHie(() =>
        closeKenyaShrVisit(credentials, need(visitId, 'An SHR visit'), params.incapacityReason)
      );
      result = publicConsent(consent);
      // DHA: an otp_record means a password must be verified; an end_date means it closed.
      updated = consent.otpRecord
        ? await save(context, { [KenyaShrVisitExtension.closeOtpRecord]: consent.otpRecord })
        : await save(
            context,
            { [KenyaShrVisitExtension.endDate]: consent.endDate ?? new Date().toISOString().slice(0, 10) },
            [KenyaShrVisitExtension.consentToken]
          );
      break;
    }
    case 'verify-close': {
      const closeOtpRecord = need(value(shr, KenyaShrVisitExtension.closeOtpRecord), 'A pending visit closure');
      const consent = await callHie(() =>
        verifyKenyaShrConsent(credentials, need(consentId, 'A consent request'), {
          otpRecord: closeOtpRecord,
          otp: need(params.otp, 'otp'),
        })
      );
      result = publicConsent(consent);
      updated = await save(
        context,
        { [KenyaShrVisitExtension.endDate]: consent.endDate ?? new Date().toISOString().slice(0, 10) },
        [KenyaShrVisitExtension.consentToken, KenyaShrVisitExtension.closeOtpRecord]
      );
      break;
    }
    case 'records': {
      const resources = (Array.isArray(params.resources) ? params.resources : [params.resources ?? ''])
        .flatMap((r) => r.split(','))
        .map((r) => r.trim())
        .filter(Boolean);
      result = await callHie(async () =>
        getKenyaShrPatientRecords(credentials, requireToken(), {
          crId: patientCrId,
          practitionerId: need(await practitionerPuid(params), 'practitionerId (DHA PUID)'),
          resources,
          ...(params.pageToken ? { pageToken: params.pageToken } : {}),
        })
      );
      break;
    }
    case 'observations':
      result = await callHie(async () =>
        getKenyaShrObservations(credentials, requireToken(), {
          crId: patientCrId,
          practitionerId: need(await practitionerPuid(params), 'practitionerId (DHA PUID)'),
          ...(params.pageToken ? { pageToken: params.pageToken } : {}),
        })
      );
      break;
    case 'referrals': {
      const direction = params.direction === 'outgoing' ? 'outgoing' : 'incoming';
      result = await callHie(() =>
        getKenyaShrReferrals(credentials, {
          direction,
          facilityFrCode: requireFacility(),
          ...(params.status ? { status: params.status } : {}),
          ...(params.count !== undefined ? { count: params.count } : {}),
          ...(params.pageToken ? { pageToken: params.pageToken } : {}),
        })
      );
      break;
    }
    case 'labels':
      result = await callHie(() =>
        getKenyaShrSecurityLabels(credentials, {
          ...(params.resourceName ? { resourceName: params.resourceName } : {}),
          ...(params.code ? { code: params.code } : {}),
        })
      );
      break;
    case 'publish': {
      const bundle = need(params.bundle, 'bundle');
      checkPatient(bundle, patientCrId);
      result = await callHie(() =>
        submitKenyaShrBundle(credentials, requireToken(), bundle as unknown as Record<string, unknown>)
      );
      break;
    }
  }

  return [
    allOk,
    buildOutputParameters(kenyaShrOperation, {
      result: JSON.stringify(result ?? null),
      ...(updated ? { encounter: createReference(updated as Encounter & { id: string }) } : {}),
    }),
  ];
}
