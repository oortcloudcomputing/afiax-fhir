// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA emergency case claims (ECCIF, DHA Scenarios 7 and 8) on an Encounter (Kenya). See
// country-pack/kenya/hie-emergency.ts for the DHA sources this follows.
//
// The case is recorded on the encounter's kenya-sha-visit extension with claimType
// "emergency-case", so the consent token and the original case fields (needed again to identify an
// unknown patient) stay with the encounter. Ordinary claim actions ($kenya-sha-claim) are refused on
// it, except preview.
import { allOk, badRequest, createReference, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Encounter,
  Extension,
  OperationDefinition,
  OperationDefinitionParameter,
  Reference,
} from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import type { KenyaHieAttachmentFile, KenyaHiePractitioner } from '../../country-pack/kenya/hie-claims';
import type { KenyaEmergencyCase } from '../../country-pack/kenya/hie-emergency';
import {
  addKenyaHieEmergencyDoctor,
  addKenyaHieEmergencyProtocol,
  createKenyaHieEmergencyClaim,
  getKenyaHieEmergencyProtocols,
  identifyKenyaHieEmergencyPatient,
  removeKenyaHieEmergencyDoctor,
  requireEmergencyIntervention,
  submitKenyaHieEmergencyClaim,
} from '../../country-pack/kenya/hie-emergency';
import { sendKenyaHieVisitOtp } from '../../country-pack/kenya/hie-visit';
import { loadAttachment } from './kenyashaclaim';
import type { VisitContext } from './kenyashavisit';
import {
  callHie,
  getExistingVisit,
  KenyaShaVisitClaimIdSystem,
  KenyaShaVisitExtension,
  loadVisitContext,
  parsePractitioner,
  withConsentToken,
} from './kenyashavisit';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const KenyaEmergencyCaseClaimType = 'emergency-case';

const Actions = [
  'send-otp',
  'create',
  'protocols',
  'add-protocol',
  'identify',
  'add-doctor',
  'remove-doctor',
  'submit',
] as const;

const str = (name: string): OperationDefinitionParameter => ({ use: 'in', name, type: 'string', min: 0, max: '1' });
const code = (name: string, documentation?: string): OperationDefinitionParameter => ({
  use: 'in',
  name,
  type: 'code',
  min: 0,
  max: '1',
  ...(documentation ? { documentation } : {}),
});

export const kenyaShaEmergencyOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'encounter-kenya-sha-emergency',
  name: 'KenyaShaEmergency',
  title: 'SHA emergency case claim (ECCIF) for an encounter (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-sha-emergency',
  resource: ['Encounter'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    code('action', Actions.join(' | ')),
    str('interventionCode'),
    code('modeOfArrival', 'AMBULANCE | WALK-IN | OTHER'),
    code('broughtBy', 'RELATIVE | UNKNOWN | SAMARITAN | PARAMEDICS'),
    str('referenceNumber'),
    str('notes'),
    str('otp'),
    str('contactId'),
    { use: 'in', name: 'otpContactId', type: 'integer', min: 0, max: '1' },
    str('practitionerIdentificationType'),
    str('practitionerIdentificationNumber'),
    code('practitionerRegulator'),
    str('protocolCode'),
    { use: 'in', name: 'unitPrice', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'quantity', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'icdCode', type: 'string', min: 0, max: '*', documentation: 'ICD-11' },
    {
      use: 'in',
      name: 'attachment',
      min: 0,
      max: '*',
      part: [
        { use: 'in', name: 'document', type: 'Reference', min: 1, max: '1' },
        { use: 'in', name: 'documentType', type: 'code', min: 1, max: '1' },
      ],
    },
    str('invoiceNumber'),
    code('dischargeReason', 'RECOVERED | REFERRED | ABSCONDED | OTHER'),
    code('reasonForUnknownPatient', 'SHA_UNREGISTERED | DECEASED'),
    { use: 'out', name: 'result', type: 'string', min: 1, max: '1', documentation: 'The DHA result, as JSON.' },
    { use: 'out', name: 'encounter', type: 'Reference', min: 0, max: '1' },
  ],
};

interface EmergencyParameters {
  readonly action: string;
  readonly interventionCode?: string;
  readonly modeOfArrival?: string;
  readonly broughtBy?: string;
  readonly referenceNumber?: string;
  readonly notes?: string;
  readonly otp?: string;
  readonly contactId?: string;
  readonly otpContactId?: number;
  readonly practitionerIdentificationType?: string;
  readonly practitionerIdentificationNumber?: string;
  readonly practitionerRegulator?: string;
  readonly protocolCode?: string;
  readonly unitPrice?: number;
  readonly quantity?: number;
  readonly icdCode?: string[] | string;
  readonly attachment?: { readonly document: Reference; readonly documentType: string }[];
  readonly invoiceNumber?: string;
  readonly dischargeReason?: string;
  readonly reasonForUnknownPatient?: string;
}

function need<T>(value: T | undefined, name: string): T {
  if (value === undefined || (typeof value === 'string' && !value.trim())) {
    throw new OperationOutcomeError(badRequest(`${name} is required for this action`));
  }
  return value;
}

function list<T>(value: T[] | T | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function get(visit: Extension | undefined, url: string): string | undefined {
  const v = visit?.extension?.find((e) => e.url === url);
  if (v?.valueBoolean !== undefined) {
    return String(v.valueBoolean);
  }
  return v?.valueString ?? v?.valueCode;
}

function requirePractitioner(params: EmergencyParameters): KenyaHiePractitioner {
  const practitioner = parsePractitioner(params);
  if (!practitioner) {
    throw new OperationOutcomeError(
      badRequest('The attending doctor (practitionerIdentificationNumber and practitionerRegulator) is required')
    );
  }
  return practitioner;
}

/**
 * The case fields stored at creation, sent again to identify an unknown patient (DHA).
 * @param visit - The encounter's kenya-sha-visit extension.
 * @returns The emergency case.
 */
function storedCase(visit: Extension): KenyaEmergencyCase {
  const fields = {
    interventionCode: get(visit, KenyaShaVisitExtension.interventionCode),
    modeOfArrival: get(visit, KenyaShaVisitExtension.modeOfArrival),
    broughtBy: get(visit, KenyaShaVisitExtension.broughtBy),
    referenceNumber: get(visit, KenyaShaVisitExtension.referenceNumber),
    identificationNumber: get(visit, KenyaShaVisitExtension.doctorIdentificationNumber),
    identificationType: get(visit, KenyaShaVisitExtension.doctorIdentificationType),
    regulator: get(visit, KenyaShaVisitExtension.doctorRegulator),
  };
  for (const [name, v] of Object.entries(fields)) {
    if (!v) {
      throw new OperationOutcomeError(badRequest(`The emergency case on this encounter has no ${name}.`));
    }
  }
  const notes = get(visit, KenyaShaVisitExtension.notes);
  return {
    interventionCode: fields.interventionCode as string,
    modeOfArrival: fields.modeOfArrival as string,
    broughtBy: fields.broughtBy as string,
    referenceNumber: fields.referenceNumber as string,
    practitioner: {
      identificationNumber: fields.identificationNumber as string,
      identificationType: fields.identificationType as KenyaHiePractitioner['identificationType'],
      regulator: fields.regulator as KenyaHiePractitioner['regulator'],
    },
    ...(notes ? { notes } : {}),
  };
}

async function saveVisit(
  context: VisitContext,
  values: Record<string, string | boolean | null | undefined>,
  identifier?: string | null
): Promise<Encounter> {
  const { encounter } = context;
  const previous = getExistingVisit(encounter);
  const next: Extension[] = (previous?.extension ?? []).filter((e) => !(e.url in values));
  for (const [url, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === '') {
      continue;
    }
    next.push(typeof v === 'boolean' ? { url, valueBoolean: v } : { url, valueString: v });
  }
  const others = (encounter.extension ?? []).filter((e) => e.url !== KenyaShaVisitExtension.url);
  const identifiers = encounter.identifier ?? [];
  const ctx = getAuthenticatedContext();
  // As the caller, failing if the encounter changed since it was read.
  return ctx.repo.updateResource<Encounter>(
    {
      ...encounter,
      identifier: withConsentToken(
        identifier && !identifiers.some((i) => i.system === KenyaShaVisitClaimIdSystem)
          ? [...identifiers, { system: KenyaShaVisitClaimIdSystem, value: identifier }]
          : identifiers,
        typeof values[KenyaShaVisitExtension.consentToken] === 'string'
          ? (values[KenyaShaVisitExtension.consentToken] as string)
          : undefined
      ),
      extension: [...others, { url: KenyaShaVisitExtension.url, extension: next }],
    },
    { ifMatch: encounter.meta?.versionId }
  );
}

/**
 * Handles POST Encounter/:id/$kenya-sha-emergency. One action per call:
 * - send-otp: the patient's consent OTP (identified patients)
 * - create: the emergency case claim; with otp the patient is identified, without it unidentified
 * - protocols: the approved protocols and tariffs for the case's intervention
 * - add-protocol: bill a protocol (within its tariff), optionally with ICD-11 diagnoses and attachments
 * - identify: link an unidentified case to the patient (their Client Registry ID and OTP)
 * - add-doctor, remove-doctor: change the attending doctor
 * - submit: send the claim to SHA (within 24 hours)
 * @param req - The FHIR request.
 * @returns The DHA result as JSON, and the encounter when it was updated.
 */
export async function kenyaShaEmergencyHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<EmergencyParameters>(kenyaShaEmergencyOperation, req);
  const action = params.action as (typeof Actions)[number];
  if (!Actions.includes(action)) {
    throw new OperationOutcomeError(badRequest(`action must be one of ${Actions.join(', ')}`));
  }
  const context = await loadVisitContext(req, { allowUnidentified: true });
  const { credentials, encounter, patientCrId } = context;
  const visit = getExistingVisit(encounter);
  const isEmergencyCase = get(visit, KenyaShaVisitExtension.claimType) === KenyaEmergencyCaseClaimType;
  const consentToken = get(visit, KenyaShaVisitExtension.consentToken);
  const identified = get(visit, KenyaShaVisitExtension.identified) === 'true';
  const dispatched = get(visit, KenyaShaVisitExtension.dispatch);
  const caseIntervention = get(visit, KenyaShaVisitExtension.interventionCode);

  if (action !== 'send-otp' && action !== 'create') {
    if (!visit || !isEmergencyCase || !consentToken) {
      throw new OperationOutcomeError(badRequest('Create the emergency case claim for this encounter first.'));
    }
    if (dispatched) {
      throw new OperationOutcomeError(badRequest(`The emergency claim for this encounter is already ${dispatched}.`));
    }
  }

  const requireCrId = (): string => {
    if (!patientCrId) {
      throw new OperationOutcomeError(
        badRequest('The patient has no DHA Client Registry ID. Look the patient up in the Client Registry first.')
      );
    }
    return patientCrId;
  };

  let result: unknown;
  let updated: Encounter | undefined;
  switch (action) {
    case 'send-otp': {
      const interventionCode = caseIntervention ?? need(params.interventionCode, 'interventionCode');
      result = await callHie(() =>
        sendKenyaHieVisitOtp(credentials, {
          patientId: requireCrId(),
          interventionCodes: [requireEmergencyIntervention(interventionCode)],
          ...(params.otpContactId !== undefined ? { contactId: params.otpContactId } : {}),
        })
      );
      break;
    }
    case 'create': {
      if (visit) {
        throw new OperationOutcomeError(
          badRequest('An SHA visit or emergency claim already exists for this encounter.')
        );
      }
      const practitioner = requirePractitioner(params);
      const emergencyCase: KenyaEmergencyCase = {
        interventionCode: need(params.interventionCode, 'interventionCode'),
        modeOfArrival: need(params.modeOfArrival, 'modeOfArrival'),
        broughtBy: need(params.broughtBy, 'broughtBy'),
        referenceNumber: need(params.referenceNumber, 'referenceNumber'),
        practitioner,
        ...(params.notes ? { notes: params.notes } : {}),
      };
      const otp = params.otp?.trim();
      const claim = await callHie(() =>
        createKenyaHieEmergencyClaim(credentials, emergencyCase, otp ? { crId: requireCrId(), otp } : undefined)
      );
      result = claim;
      updated = await saveVisit(
        context,
        {
          [KenyaShaVisitExtension.claimType]: KenyaEmergencyCaseClaimType,
          [KenyaShaVisitExtension.consentToken]: claim.consentToken,
          [KenyaShaVisitExtension.serviceType]: 'EMERGENCY',
          [KenyaShaVisitExtension.consentMethod]: otp ? 'otp' : 'none',
          [KenyaShaVisitExtension.identified]: !!otp,
          [KenyaShaVisitExtension.interventionCode]: requireEmergencyIntervention(emergencyCase.interventionCode),
          [KenyaShaVisitExtension.modeOfArrival]: emergencyCase.modeOfArrival.trim().toUpperCase(),
          [KenyaShaVisitExtension.broughtBy]: emergencyCase.broughtBy.trim().toUpperCase(),
          [KenyaShaVisitExtension.referenceNumber]: emergencyCase.referenceNumber.trim(),
          [KenyaShaVisitExtension.notes]: emergencyCase.notes,
          [KenyaShaVisitExtension.doctorIdentificationNumber]: practitioner.identificationNumber,
          [KenyaShaVisitExtension.doctorIdentificationType]: practitioner.identificationType,
          [KenyaShaVisitExtension.doctorRegulator]: practitioner.regulator,
          [KenyaShaVisitExtension.claimId]: claim.claimId,
          [KenyaShaVisitExtension.workflowState]: claim.workflowState,
          [KenyaShaVisitExtension.startedAt]: new Date().toISOString(),
        },
        claim.claimId
      );
      break;
    }
    case 'protocols':
      result = await callHie(() => getKenyaHieEmergencyProtocols(credentials, caseIntervention as string));
      break;
    case 'add-protocol': {
      const protocolCode = need(params.protocolCode, 'protocolCode').trim();
      const unitPrice = need(params.unitPrice, 'unitPrice');
      // DHA: bill only approved protocols, within the applicableTariff; attachments of the
      // intervention's applicableDocumentTypes.
      const protocols = await callHie(() => getKenyaHieEmergencyProtocols(credentials, caseIntervention as string));
      const protocol = protocols.find((p) => p.protocolCode === protocolCode);
      if (!protocol) {
        throw new OperationOutcomeError(
          badRequest(`Protocol ${protocolCode} is not an approved active protocol for ${caseIntervention}.`)
        );
      }
      if (protocol.applicableTariff !== null && unitPrice > protocol.applicableTariff) {
        throw new OperationOutcomeError(
          badRequest(`The unit price is above the approved tariff for ${protocolCode} (${protocol.applicableTariff}).`)
        );
      }
      const attachments: KenyaHieAttachmentFile[] = [];
      for (const a of list(params.attachment)) {
        const file = await loadAttachment(need(a.document, 'attachment.document'), a.documentType ?? '');
        if (protocol.applicableDocumentTypes.length && !protocol.applicableDocumentTypes.includes(file.documentType)) {
          throw new OperationOutcomeError(
            badRequest(
              `Document type ${file.documentType} is not accepted for ${caseIntervention}: ${protocol.applicableDocumentTypes.join(', ')}`
            )
          );
        }
        attachments.push(file);
      }
      result = await callHie(() =>
        addKenyaHieEmergencyProtocol(credentials, consentToken as string, {
          protocolCode,
          interventionCode: caseIntervention as string,
          unitPrice,
          quantity: need(params.quantity, 'quantity'),
          icdCodes: list(params.icdCode),
          attachments,
        })
      );
      break;
    }
    case 'identify': {
      if (identified) {
        throw new OperationOutcomeError(badRequest('The patient on this emergency claim is already identified.'));
      }
      const claim = await callHie(() =>
        identifyKenyaHieEmergencyPatient(credentials, consentToken as string, storedCase(visit as Extension), {
          crId: requireCrId(),
          otp: need(params.otp, 'otp'),
          ...(params.contactId ? { contactId: params.contactId } : {}),
        })
      );
      result = claim;
      updated = await saveVisit(context, {
        [KenyaShaVisitExtension.identified]: true,
        [KenyaShaVisitExtension.consentMethod]: 'otp',
        [KenyaShaVisitExtension.workflowState]: claim.workflowState,
      });
      break;
    }
    case 'add-doctor': {
      const practitioner = requirePractitioner(params);
      result = await callHie(() => addKenyaHieEmergencyDoctor(credentials, consentToken as string, practitioner));
      updated = await saveVisit(context, {
        [KenyaShaVisitExtension.doctorIdentificationNumber]: practitioner.identificationNumber,
        [KenyaShaVisitExtension.doctorIdentificationType]: practitioner.identificationType,
        [KenyaShaVisitExtension.doctorRegulator]: practitioner.regulator,
      });
      break;
    }
    case 'remove-doctor':
      result = (await callHie(() => removeKenyaHieEmergencyDoctor(credentials, consentToken as string))) ?? {
        removed: true,
      };
      break;
    case 'submit': {
      const submitted = await callHie(() =>
        submitKenyaHieEmergencyClaim(
          credentials,
          consentToken as string,
          {
            invoiceNumber: need(params.invoiceNumber, 'invoiceNumber'),
            dischargeReason: need(params.dischargeReason, 'dischargeReason'),
            ...(params.reasonForUnknownPatient ? { reasonForUnknownPatient: params.reasonForUnknownPatient } : {}),
          },
          identified
        )
      );
      result = submitted;
      updated = await saveVisit(context, {
        [KenyaShaVisitExtension.dispatch]: 'submitted',
        [KenyaShaVisitExtension.dispatchedAt]: new Date().toISOString(),
        [KenyaShaVisitExtension.invoiceNumber]: params.invoiceNumber?.trim(),
        [KenyaShaVisitExtension.workflowState]: submitted.workflowState,
      });
      break;
    }
  }

  return [
    allOk,
    buildOutputParameters(kenyaShaEmergencyOperation, {
      result: JSON.stringify(result ?? null),
      ...(updated ? { encounter: createReference(updated as Encounter & { id: string }) } : {}),
    }),
  ];
}
