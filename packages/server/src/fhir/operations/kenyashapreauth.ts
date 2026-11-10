// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA preauthorizations on an Encounter (Kenya). See country-pack/kenya/hie-preauths.ts for the DHA
// sources this follows and where they disagree.
//
// - Normal preauth: the SHA visit is started ($kenya-start-visit); its consent token is used.
// - Elective preauth (needsManualPreauthApproval): before any visit, the patient consents to a
//   pre-visit authorization (OTP from $kenya-visit-consent send-otp, or fingerprints). DHA returns
//   it AUTHORIZED_PENDING_VISIT, and its token is used. On the visit day the visit is started with
//   a fresh OTP or this authorization's GUID.
// The authorization and the preauth are recorded on the encounter (extension kenya-sha-preauth).
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
import type { KenyaHiePreauth, KenyaPreauthDoctor, KenyaPreauthForm } from '../../country-pack/kenya/hie-preauths';
import {
  cancelKenyaHiePreauth,
  createKenyaHiePreauth,
  getKenyaHiePreauth,
  removeKenyaHiePreauthDiagnosis,
  removeKenyaHiePreauthDoctor,
} from '../../country-pack/kenya/hie-preauths';
import type { KenyaHieAuthorization } from '../../country-pack/kenya/hie-visit';
import {
  createKenyaHieBiometricsAuthorization,
  createKenyaHieOtpAuthorization,
  getKenyaHieAuthorizations,
} from '../../country-pack/kenya/hie-visit';
import { loadAttachment } from './kenyashaclaim';
import type { VisitContext } from './kenyashavisit';
import {
  callHie,
  getExistingVisit,
  KenyaShaVisitExtension,
  loadVisitContext,
  resolveFacility,
  withConsentToken,
} from './kenyashavisit';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

export const KenyaShaPreauthExtension = {
  url: 'https://afiax.africa/fhir/StructureDefinition/kenya-sha-preauth',
  authorizationToken: 'authorizationToken',
  authorizationGuid: 'authorizationGuid',
  authorizationStatus: 'authorizationStatus',
  serviceType: 'serviceType',
  interventionCode: 'interventionCode',
  elective: 'elective',
  preauthId: 'preauthId',
  preauthStatus: 'preauthStatus',
  updatedAt: 'updatedAt',
} as const;

const Actions = [
  'authorize-otp',
  'authorize-biometrics',
  'authorization-status',
  'create',
  'status',
  'cancel',
  'remove-diagnosis',
  'remove-doctor',
] as const;

const Forms = ['normal', 'surgical', 'renal', 'oncology', 'optical', 'imaging'] as const;

const str = (name: string, documentation?: string): OperationDefinitionParameter => ({
  use: 'in',
  name,
  type: 'string',
  min: 0,
  max: '1',
  ...(documentation ? { documentation } : {}),
});

export const kenyaShaPreauthOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'encounter-kenya-sha-preauth',
  name: 'KenyaShaPreauth',
  title: 'SHA preauthorization for an encounter: pre-visit authorization, create, status, cancel (Kenya)',
  status: 'active',
  kind: 'operation',
  code: 'kenya-sha-preauth',
  resource: ['Encounter'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'action', type: 'code', min: 1, max: '1', documentation: Actions.join(' | ') },
    str('interventionCode'),
    { use: 'in', name: 'serviceType', type: 'code', min: 0, max: '1', documentation: 'OUTPATIENT | INPATIENT' },
    str('otp'),
    str('workStationId'),
    str('agentId'),
    str('deviceOs'),
    str('facilityFrCode'),
    { use: 'in', name: 'form', type: 'code', min: 0, max: '1', documentation: Forms.join(' | ') },
    { use: 'in', name: 'serviceStart', type: 'dateTime', min: 0, max: '1' },
    { use: 'in', name: 'serviceEnd', type: 'dateTime', min: 0, max: '1' },
    {
      use: 'in',
      name: 'expectedServiceStartDate',
      type: 'dateTime',
      min: 0,
      max: '1',
      documentation: 'Elective only',
    },
    { use: 'in', name: 'unitPrice', type: 'decimal', min: 0, max: '*' },
    { use: 'in', name: 'icdCode', type: 'string', min: 0, max: '*', documentation: 'ICD-11' },
    {
      use: 'in',
      name: 'doctor',
      min: 0,
      max: '*',
      part: [
        { use: 'in', name: 'identificationNumber', type: 'string', min: 1, max: '1' },
        { use: 'in', name: 'identificationType', type: 'string', min: 0, max: '1' },
        { use: 'in', name: 'regulator', type: 'code', min: 1, max: '1' },
        { use: 'in', name: 'primary', type: 'boolean', min: 0, max: '1' },
      ],
    },
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
    str('providerNotificationEmail'),
    // Surgical
    str('chiefComplaint'),
    str('vitalSigns'),
    str('historyOfPresentIllness'),
    str('physicalExamination'),
    str('investigationReportDetails'),
    { use: 'in', name: 'typeOfAnaesthesia', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'surgeryDate', type: 'dateTime', min: 0, max: '1' },
    // Renal and oncology
    { use: 'in', name: 'numberOfSessionsRequired', type: 'integer', min: 0, max: '1' },
    { use: 'in', name: 'costPerSession', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'frequencyOfSessions', type: 'code', min: 0, max: '1' },
    str('clinicalIndications'),
    { use: 'in', name: 'startDate', type: 'dateTime', min: 0, max: '1' },
    { use: 'in', name: 'isCoInsured', type: 'boolean', min: 0, max: '1' },
    { use: 'in', name: 'carcinomaStaging', type: 'code', min: 0, max: '1' },
    str('comorbidity'),
    { use: 'in', name: 'treatmentSetting', type: 'code', min: 0, max: '*' },
    { use: 'in', name: 'metastases', type: 'code', min: 0, max: '*' },
    // Optical
    str('necessityOfService'),
    { use: 'in', name: 'lensPrescription', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'lensAmount', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'eyeExaminationAmount', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'frameAmount', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'newOrReplacement', type: 'code', min: 0, max: '1' },
    // Removing
    str('registrationNumber', 'The doctor to remove'),
    { use: 'out', name: 'result', type: 'string', min: 1, max: '1', documentation: 'The DHA result, as JSON.' },
    { use: 'out', name: 'encounter', type: 'Reference', min: 0, max: '1' },
  ],
};

interface DoctorPart {
  readonly identificationNumber: string;
  readonly identificationType?: string;
  readonly regulator: string;
  readonly primary?: boolean;
}

interface PreauthParameters {
  readonly action: string;
  readonly interventionCode?: string;
  readonly serviceType?: string;
  readonly otp?: string;
  readonly workStationId?: string;
  readonly agentId?: string;
  readonly deviceOs?: string;
  readonly facilityFrCode?: string;
  readonly form?: string;
  readonly serviceStart?: string;
  readonly serviceEnd?: string;
  readonly expectedServiceStartDate?: string;
  readonly unitPrice?: number[] | number;
  readonly icdCode?: string[] | string;
  readonly doctor?: DoctorPart[];
  readonly attachment?: { readonly document: Reference; readonly documentType: string }[];
  readonly providerNotificationEmail?: string;
  readonly chiefComplaint?: string;
  readonly vitalSigns?: string;
  readonly historyOfPresentIllness?: string;
  readonly physicalExamination?: string;
  readonly investigationReportDetails?: string;
  readonly typeOfAnaesthesia?: string;
  readonly surgeryDate?: string;
  readonly numberOfSessionsRequired?: number;
  readonly costPerSession?: number;
  readonly frequencyOfSessions?: string;
  readonly clinicalIndications?: string;
  readonly startDate?: string;
  readonly isCoInsured?: boolean;
  readonly carcinomaStaging?: string;
  readonly comorbidity?: string;
  readonly treatmentSetting?: string[] | string;
  readonly metastases?: string[] | string;
  readonly necessityOfService?: string;
  readonly lensPrescription?: string;
  readonly lensAmount?: number;
  readonly eyeExaminationAmount?: number;
  readonly frameAmount?: number;
  readonly newOrReplacement?: string;
  readonly registrationNumber?: string;
}

function list<T>(value: T[] | T | undefined): T[] {
  if (value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function need<T>(value: T | undefined, name: string): T {
  if (value === undefined || (typeof value === 'string' && !value.trim())) {
    throw new OperationOutcomeError(badRequest(`${name} is required for this action`));
  }
  return value;
}

function getPreauthExtension(encounter: Encounter): Extension | undefined {
  return encounter.extension?.find((e) => e.url === KenyaShaPreauthExtension.url);
}

function value(extension: Extension | undefined, url: string): string | undefined {
  const v = extension?.extension?.find((e) => e.url === url);
  if (v?.valueBoolean !== undefined) {
    return String(v.valueBoolean);
  }
  return v?.valueString ?? v?.valueCode;
}

function buildForm(params: PreauthParameters): KenyaPreauthForm {
  const kind = (params.form?.trim().toLowerCase() ?? 'normal') as (typeof Forms)[number];
  if (!Forms.includes(kind)) {
    throw new OperationOutcomeError(badRequest(`form must be one of ${Forms.join(', ')}`));
  }
  switch (kind) {
    case 'normal':
      return { kind };
    case 'surgical':
      return {
        kind,
        chiefComplaint: need(params.chiefComplaint, 'chiefComplaint'),
        vitalSigns: need(params.vitalSigns, 'vitalSigns'),
        historyOfPresentIllness: need(params.historyOfPresentIllness, 'historyOfPresentIllness'),
        physicalExamination: need(params.physicalExamination, 'physicalExamination'),
        investigationReportDetails: need(params.investigationReportDetails, 'investigationReportDetails'),
        typeOfAnaesthesia: need(params.typeOfAnaesthesia, 'typeOfAnaesthesia'),
        surgeryDate: need(params.surgeryDate, 'surgeryDate'),
      };
    case 'renal':
      return {
        kind,
        numberOfSessionsRequired: need(params.numberOfSessionsRequired, 'numberOfSessionsRequired'),
        costPerSession: need(params.costPerSession, 'costPerSession'),
        frequencyOfSessions: need(params.frequencyOfSessions, 'frequencyOfSessions'),
        clinicalIndications: need(params.clinicalIndications, 'clinicalIndications'),
        ...(params.startDate ? { startDate: params.startDate } : {}),
        ...(params.isCoInsured !== undefined ? { isCoInsured: params.isCoInsured } : {}),
      };
    case 'oncology':
      return {
        kind,
        carcinomaStaging: need(params.carcinomaStaging, 'carcinomaStaging'),
        comorbidity: need(params.comorbidity, 'comorbidity'),
        treatmentSetting: list(params.treatmentSetting),
        numberOfSessionsRequired: need(params.numberOfSessionsRequired, 'numberOfSessionsRequired'),
        costPerSession: need(params.costPerSession, 'costPerSession'),
        metastases: list(params.metastases),
        ...(params.startDate ? { startDate: params.startDate } : {}),
        ...(params.isCoInsured !== undefined ? { isCoInsured: params.isCoInsured } : {}),
      };
    case 'optical':
      return {
        kind,
        necessityOfService: need(params.necessityOfService, 'necessityOfService'),
        lensPrescription: need(params.lensPrescription, 'lensPrescription'),
        lensAmount: need(params.lensAmount, 'lensAmount'),
        eyeExaminationAmount: need(params.eyeExaminationAmount, 'eyeExaminationAmount'),
        frameAmount: need(params.frameAmount, 'frameAmount'),
        newOrReplacement: need(params.newOrReplacement, 'newOrReplacement'),
      };
    case 'imaging':
      return { kind, clinicalIndications: need(params.clinicalIndications, 'clinicalIndications') };
  }
  throw new OperationOutcomeError(badRequest('Unknown preauth form'));
}

function buildDoctors(parts: DoctorPart[] | undefined): KenyaPreauthDoctor[] {
  const doctors = list(parts);
  if (!doctors.length) {
    throw new OperationOutcomeError(badRequest('At least one doctor is required for a preauth'));
  }
  const result = doctors.map((d): KenyaPreauthDoctor => {
    const regulator = d.regulator?.trim().toUpperCase();
    if (regulator !== 'KMPDC' && regulator !== 'COC' && regulator !== 'NCK' && regulator !== 'PPB') {
      throw new OperationOutcomeError(badRequest('doctor.regulator must be KMPDC, COC, NCK or PPB'));
    }
    const identificationType = d.identificationType?.trim() || 'registration_number';
    if (!['registration_number', 'National ID', 'Alien ID', 'Refugee ID'].includes(identificationType)) {
      throw new OperationOutcomeError(
        badRequest('doctor.identificationType must be registration_number, National ID, Alien ID or Refugee ID')
      );
    }
    return {
      identificationNumber: need(d.identificationNumber, 'doctor.identificationNumber').trim(),
      identificationType: identificationType as KenyaHiePractitioner['identificationType'],
      regulator: regulator,
      isPrimary: d.primary === true,
    };
  });
  // DHA's example sends a single doctor with is_primary true; a lone doctor is the primary one.
  if (result.length === 1) {
    return [{ ...result[0], isPrimary: true }];
  }
  return result;
}

async function save(
  context: VisitContext,
  previous: Extension | undefined,
  values: Record<string, string | boolean | null | undefined>
): Promise<Encounter> {
  const keep = (previous?.extension ?? []).filter((e) => !(e.url in values));
  const next: Extension[] = [...keep];
  for (const [url, v] of Object.entries(values)) {
    if (v === undefined || v === null || v === '') {
      continue;
    }
    next.push(typeof v === 'boolean' ? { url, valueBoolean: v } : { url, valueString: v });
  }
  next.push({ url: KenyaShaPreauthExtension.updatedAt, valueString: new Date().toISOString() });
  const encounter = context.encounter;
  const others = (encounter.extension ?? []).filter((e) => e.url !== KenyaShaPreauthExtension.url);
  const ctx = getAuthenticatedContext();
  // As the caller, failing if the encounter changed since it was read.
  return ctx.repo.updateResource<Encounter>(
    {
      ...encounter,
      identifier: withConsentToken(
        encounter.identifier,
        typeof values[KenyaShaPreauthExtension.authorizationToken] === 'string'
          ? (values[KenyaShaPreauthExtension.authorizationToken] as string)
          : undefined
      ),
      extension: [...others, { url: KenyaShaPreauthExtension.url, extension: next }],
    },
    { ifMatch: encounter.meta?.versionId }
  );
}

function authorizationValues(auth: KenyaHieAuthorization): Record<string, string | null> {
  return {
    [KenyaShaPreauthExtension.authorizationToken]: auth.token,
    [KenyaShaPreauthExtension.authorizationGuid]: auth.guid,
    [KenyaShaPreauthExtension.authorizationStatus]: auth.status,
  };
}

/**
 * Handles POST Encounter/:id/$kenya-sha-preauth. One action per call:
 * - authorize-otp / authorize-biometrics: elective pre-visit authorization (before the visit)
 * - authorization-status: refresh the pre-visit authorization (fingerprint capture)
 * - create: the preauth (normal on a started visit, elective on a pre-visit authorization)
 * - status, cancel, remove-diagnosis, remove-doctor: on that preauth
 * @param req - The FHIR request.
 * @returns The DHA result as JSON, and the encounter when it was updated.
 */
export async function kenyaShaPreauthHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<PreauthParameters>(kenyaShaPreauthOperation, req);
  const action = params.action as (typeof Actions)[number];
  if (!Actions.includes(action)) {
    throw new OperationOutcomeError(badRequest(`action must be one of ${Actions.join(', ')}`));
  }
  const context = await loadVisitContext(req);
  const { credentials, encounter, patientCrId } = context;
  const visit = getExistingVisit(encounter);
  if (visit?.extension?.some((e) => e.url === KenyaShaVisitExtension.claimType && e.valueString === 'emergency-case')) {
    // DHA: emergency claims need no preauth; the doctor's consent is requested instead.
    throw new OperationOutcomeError(badRequest('Emergency case claims do not take a preauth.'));
  }
  const visitToken = visit?.extension?.find((e) => e.url === KenyaShaVisitExtension.consentToken)?.valueString;
  const preauth = getPreauthExtension(encounter);
  const storedIntervention = value(preauth, KenyaShaPreauthExtension.interventionCode);

  // The token the preauth was (or will be) created with: the started visit's for a normal
  // preauth, else the pre-visit authorization's for an elective one.
  const elective = !visitToken;
  const preauthToken = visitToken ?? value(preauth, KenyaShaPreauthExtension.authorizationToken);

  let result: unknown;
  let updated: Encounter | undefined;
  switch (action) {
    case 'authorize-otp':
    case 'authorize-biometrics': {
      if (visitToken) {
        throw new OperationOutcomeError(
          badRequest('The SHA visit is already started: a preauth uses its consent, no pre-visit authorization.')
        );
      }
      const serviceType = need(params.serviceType, 'serviceType').trim().toUpperCase();
      if (serviceType !== 'OUTPATIENT' && serviceType !== 'INPATIENT') {
        throw new OperationOutcomeError(badRequest('serviceType must be OUTPATIENT or INPATIENT'));
      }
      const interventionCode = need(params.interventionCode, 'interventionCode').trim();
      let auth: KenyaHieAuthorization;
      if (action === 'authorize-otp') {
        auth = await callHie(() =>
          createKenyaHieOtpAuthorization(credentials, {
            patientId: patientCrId,
            serviceType,
            interventionCodes: [interventionCode],
            otp: need(params.otp, 'otp'),
          })
        );
      } else {
        const facility = await resolveFacility(context, params.facilityFrCode);
        auth = await callHie(() =>
          createKenyaHieBiometricsAuthorization(credentials, {
            patientId: patientCrId,
            serviceType,
            interventionCodes: [interventionCode],
            agentId: params.agentId ?? '',
            workStationId: params.workStationId ?? '',
            deviceOs: params.deviceOs ?? '',
            facilityFrCode: facility.frCode,
            facilityName: facility.name,
          })
        );
      }
      result = auth;
      updated = await save(context, preauth, {
        ...authorizationValues(auth),
        [KenyaShaPreauthExtension.serviceType]: serviceType,
        [KenyaShaPreauthExtension.interventionCode]: interventionCode,
        [KenyaShaPreauthExtension.elective]: true,
      });
      break;
    }
    case 'authorization-status': {
      const guid = value(preauth, KenyaShaPreauthExtension.authorizationGuid);
      const token = value(preauth, KenyaShaPreauthExtension.authorizationToken);
      if (!guid && !token) {
        throw new OperationOutcomeError(badRequest('No pre-visit authorization on this encounter.'));
      }
      const [auth] = await callHie(() =>
        getKenyaHieAuthorizations(credentials, guid ? { guid } : { token: token as string })
      );
      if (!auth) {
        throw new OperationOutcomeError(badRequest('DHA returned no authorization.'));
      }
      result = auth;
      updated = await save(context, preauth, authorizationValues(auth));
      break;
    }
    case 'create': {
      if (!preauthToken) {
        throw new OperationOutcomeError(
          badRequest('Start the SHA visit (normal preauth) or create a pre-visit authorization (elective) first.')
        );
      }
      if (value(preauth, KenyaShaPreauthExtension.preauthId)) {
        throw new OperationOutcomeError(badRequest('A preauth has already been created for this encounter.'));
      }
      if (elective && value(preauth, KenyaShaPreauthExtension.authorizationStatus) !== 'AUTHORIZED_PENDING_VISIT') {
        throw new OperationOutcomeError(
          badRequest('The pre-visit authorization is not AUTHORIZED_PENDING_VISIT yet; refresh authorization-status.')
        );
      }
      const interventionCode = need(params.interventionCode, 'interventionCode').trim();
      if (elective && storedIntervention && storedIntervention !== interventionCode) {
        throw new OperationOutcomeError(
          badRequest(`The pre-visit authorization is for ${storedIntervention}, not ${interventionCode}.`)
        );
      }
      const attachments: KenyaHieAttachmentFile[] = [];
      for (const a of list(params.attachment)) {
        attachments.push(await loadAttachment(need(a.document, 'attachment.document'), a.documentType ?? ''));
      }
      const created: KenyaHiePreauth = await callHie(() =>
        createKenyaHiePreauth(
          credentials,
          preauthToken,
          {
            interventionCode,
            serviceStart: need(params.serviceStart, 'serviceStart'),
            serviceEnd: need(params.serviceEnd, 'serviceEnd'),
            unitPrices: list(params.unitPrice),
            icdCodes: list(params.icdCode),
            doctors: buildDoctors(params.doctor),
            attachments,
            providerNotificationEmail: need(params.providerNotificationEmail, 'providerNotificationEmail'),
            ...(params.expectedServiceStartDate ? { expectedServiceStartDate: params.expectedServiceStartDate } : {}),
            form: buildForm(params),
          },
          elective
        )
      );
      result = created;
      updated = await save(context, preauth, {
        [KenyaShaPreauthExtension.interventionCode]: interventionCode,
        [KenyaShaPreauthExtension.elective]: elective,
        [KenyaShaPreauthExtension.preauthId]: created.id ?? created.guid,
        [KenyaShaPreauthExtension.preauthStatus]: created.status,
      });
      break;
    }
    case 'status': {
      if (!preauthToken) {
        throw new OperationOutcomeError(badRequest('No preauth on this encounter.'));
      }
      const current = await callHie(() => getKenyaHiePreauth(credentials, preauthToken));
      result = current;
      updated = await save(context, preauth, {
        [KenyaShaPreauthExtension.preauthStatus]: current.status,
        [KenyaShaPreauthExtension.preauthId]: current.id ?? current.guid,
      });
      break;
    }
    case 'cancel':
    case 'remove-diagnosis':
    case 'remove-doctor': {
      if (!preauthToken) {
        throw new OperationOutcomeError(badRequest('No preauth on this encounter.'));
      }
      const interventionCode = params.interventionCode?.trim() || storedIntervention;
      const code = need(interventionCode, 'interventionCode');
      if (action === 'cancel') {
        result = await callHie(() => cancelKenyaHiePreauth(credentials, preauthToken, code));
        updated = await save(context, preauth, { [KenyaShaPreauthExtension.preauthStatus]: 'CANCELLED' });
      } else if (action === 'remove-diagnosis') {
        const icdCode = need(list(params.icdCode)[0], 'icdCode');
        result = await callHie(() =>
          removeKenyaHiePreauthDiagnosis(credentials, preauthToken, { interventionCode: code, icdCode })
        );
      } else {
        result = await callHie(() =>
          removeKenyaHiePreauthDoctor(credentials, preauthToken, {
            interventionCode: code,
            registrationNumber: need(params.registrationNumber, 'registrationNumber'),
          })
        );
      }
      break;
    }
  }

  return [
    allOk,
    buildOutputParameters(kenyaShaPreauthOperation, {
      result: JSON.stringify(result ?? null),
      ...(updated ? { encounter: createReference(updated as Encounter & { id: string }) } : {}),
    }),
  ];
}
