// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// SHA claim billing and dispatch on an Encounter whose SHA visit was started with
// $kenya-start-visit (Kenya). The consent token comes from the encounter, never from the caller.
// See country-pack/kenya/hie-claims.ts for the DHA flow these actions follow.
import { allOk, badRequest, createReference, OperationOutcomeError, parseReference } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type {
  Binary,
  DocumentReference,
  Encounter,
  Extension,
  OperationDefinition,
  Reference,
} from '@medplum/fhirtypes';
import type { Readable } from 'node:stream';
import { getAuthenticatedContext } from '../../context';
import type { KenyaHieAttachmentFile } from '../../country-pack/kenya/hie-claims';
import {
  addKenyaHieClaimAttachment,
  addKenyaHieClaimDiagnosis,
  addKenyaHieClaimLine,
  closeKenyaHieClaim,
  dischargeKenyaHiePatient,
  finalizeKenyaHiePartialClaim,
  getKenyaHiePayerClaim,
  previewKenyaHieClaim,
  removeKenyaHieClaimAttachment,
  removeKenyaHieClaimDiagnosis,
  removeKenyaHieClaimLine,
  sendKenyaHieDischargeOtp,
  submitKenyaHieClaim,
  summarizeKenyaHieClaim,
} from '../../country-pack/kenya/hie-claims';
import { getBinaryStorage } from '../../storage/loader';
import {
  callHie,
  getExistingVisit,
  KenyaShaVisitExtension,
  loadVisitContext,
  parsePractitioner,
} from './kenyashavisit';
import { buildOutputParameters, parseInputParameters } from './utils/parameters';

/** Our own upload limit for one attachment (DHA does not publish one). */
export const KenyaShaMaxAttachmentBytes = 10 * 1024 * 1024;

/** DHA infers the file type from the extension, so only types with a known extension are sent. */
const AttachmentExtensions: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const BillingActions = [
  'add-line',
  'remove-line',
  'add-diagnosis',
  'remove-diagnosis',
  'add-attachment',
  'remove-attachment',
  'send-discharge-otp',
] as const;
const DispatchActions = ['submit', 'discharge', 'close'] as const;
const Actions = [...BillingActions, ...DispatchActions, 'finalize', 'preview', 'payer-preview'] as const;

export const kenyaShaClaimOperation: OperationDefinition = {
  resourceType: 'OperationDefinition',
  id: 'encounter-kenya-sha-claim',
  name: 'KenyaShaClaim',
  title: "Bill and dispatch the encounter's SHA visit claim (Kenya)",
  status: 'active',
  kind: 'operation',
  code: 'kenya-sha-claim',
  resource: ['Encounter'],
  system: false,
  type: false,
  instance: true,
  affectsState: true,
  parameter: [
    { use: 'in', name: 'action', type: 'code', min: 1, max: '1', documentation: Actions.join(' | ') },
    { use: 'in', name: 'interventionCode', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'unitPrice', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'quantity', type: 'decimal', min: 0, max: '1' },
    { use: 'in', name: 'serviceName', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'serviceIdentifier', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'lineId', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'icdCode', type: 'string', min: 0, max: '1', documentation: 'ICD-11' },
    {
      use: 'in',
      name: 'attachment',
      type: 'Reference',
      min: 0,
      max: '1',
      documentation: 'A Binary or DocumentReference (PDF, JPEG or PNG)',
    },
    { use: 'in', name: 'documentType', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'attachmentId', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'invoiceNumber', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'dischargeReason', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'dischargeDate', type: 'dateTime', min: 0, max: '1' },
    { use: 'in', name: 'dischargeStatus', type: 'code', min: 0, max: '1', documentation: 'FULL | PARTIAL' },
    { use: 'in', name: 'otp', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'dischargeAuthorizationGuid', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'contactId', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'notes', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'cancelReasonType', type: 'code', min: 0, max: '1' },
    { use: 'in', name: 'cancelReasonText', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'practitionerIdentificationType', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'practitionerIdentificationNumber', type: 'string', min: 0, max: '1' },
    { use: 'in', name: 'practitionerRegulator', type: 'code', min: 0, max: '1' },
    { use: 'out', name: 'result', type: 'string', min: 1, max: '1', documentation: 'The DHA result, as JSON.' },
    { use: 'out', name: 'encounter', type: 'Reference', min: 0, max: '1' },
  ],
};

interface ShaClaimParameters {
  readonly action: string;
  readonly interventionCode?: string;
  readonly unitPrice?: number;
  readonly quantity?: number;
  readonly serviceName?: string;
  readonly serviceIdentifier?: string;
  readonly lineId?: string;
  readonly icdCode?: string;
  readonly attachment?: Reference;
  readonly documentType?: string;
  readonly attachmentId?: string;
  readonly invoiceNumber?: string;
  readonly dischargeReason?: string;
  readonly dischargeDate?: string;
  readonly dischargeStatus?: string;
  readonly otp?: string;
  readonly dischargeAuthorizationGuid?: string;
  readonly contactId?: string;
  readonly notes?: string;
  readonly cancelReasonType?: string;
  readonly cancelReasonText?: string;
  readonly practitionerIdentificationType?: string;
  readonly practitionerIdentificationNumber?: string;
  readonly practitionerRegulator?: string;
}

function visitValue(visit: Extension, url: string): string | undefined {
  const value = visit.extension?.find((e) => e.url === url);
  return value?.valueString ?? value?.valueCode;
}

function requireParam<T>(value: T | undefined, name: string): T {
  if (value === undefined || (typeof value === 'string' && !value.trim())) {
    throw new OperationOutcomeError(badRequest(`${name} is required for this action`));
  }
  return value;
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > KenyaShaMaxAttachmentBytes) {
      throw new OperationOutcomeError(badRequest('The attachment is larger than 10 MB'));
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

/**
 * Reads the attachment as the caller (their access policy applies): a Binary, or a
 * DocumentReference whose first content is a Binary.
 * @param reference - The Binary or DocumentReference.
 * @param documentType - DHA's document type for it.
 * @returns The file to send to DHA.
 */
export async function loadAttachment(reference: Reference, documentType: string): Promise<KenyaHieAttachmentFile> {
  const ctx = getAuthenticatedContext();
  const [resourceType] = parseReference(reference);
  let binaryReference: string | undefined;
  let title: string | undefined;
  if (resourceType === 'DocumentReference') {
    const doc = await ctx.repo.readReference<DocumentReference>(reference as Reference<DocumentReference>);
    binaryReference = doc.content?.[0]?.attachment?.url;
    title = doc.description ?? doc.content?.[0]?.attachment?.title;
  } else if (resourceType === 'Binary') {
    binaryReference = reference.reference;
  } else {
    throw new OperationOutcomeError(badRequest('attachment must reference a Binary or a DocumentReference'));
  }
  if (!binaryReference?.startsWith('Binary/')) {
    throw new OperationOutcomeError(badRequest('The DocumentReference has no Binary content'));
  }
  const binary = await ctx.repo.readReference<Binary>({ reference: binaryReference });
  const contentType = binary.contentType?.split(';')[0].trim().toLowerCase() ?? '';
  const extension = AttachmentExtensions[contentType];
  if (!extension) {
    throw new OperationOutcomeError(badRequest('The attachment must be a PDF, JPEG or PNG file'));
  }
  const type = documentType.trim().toUpperCase();
  const data = await readAll(await getBinaryStorage().readBinary(binary));
  return { documentType: type, title: title?.trim() || type, filename: `${type}.${extension}`, contentType, data };
}

/**
 * Handles POST Encounter/:id/$kenya-sha-claim. One action per call, on the visit claim:
 * - add-line, remove-line, add-diagnosis (ICD-11), remove-diagnosis, add-attachment,
 *   remove-attachment: billing, while the claim is open
 * - preview: the claim as the provider sees it; payer-preview: as SHA sees it, once submitted
 * - send-discharge-otp: the visit-end OTP
 * - submit (outpatient), discharge (inpatient), close (discard): dispatch, recorded on the
 *   encounter; finalize submits a claim discharged PARTIAL
 * @param req - The FHIR request.
 * @returns The DHA result as JSON, and the encounter after a dispatch.
 */
export async function kenyaShaClaimHandler(req: FhirRequest): Promise<FhirResponse> {
  const params = parseInputParameters<ShaClaimParameters>(kenyaShaClaimOperation, req);
  if (!(Actions as readonly string[]).includes(params.action)) {
    throw new OperationOutcomeError(badRequest(`action must be one of ${Actions.join(', ')}`));
  }
  // An emergency case may still be for an unidentified patient; only the discharge OTP needs the CR ID.
  const context = await loadVisitContext(req, { allowUnidentified: true });
  const { credentials, encounter, patientCrId } = context;
  const visit = getExistingVisit(encounter);
  const consentToken = visit && visitValue(visit, KenyaShaVisitExtension.consentToken);
  if (!visit || !consentToken) {
    throw new OperationOutcomeError(badRequest('Start the SHA visit for this encounter first ($kenya-start-visit).'));
  }
  const serviceType = visitValue(visit, KenyaShaVisitExtension.serviceType);
  const dispatched = visitValue(visit, KenyaShaVisitExtension.dispatch);
  const action = params.action as (typeof Actions)[number];

  const readOnly = action === 'preview' || action === 'payer-preview';
  // DHA bills emergency case claims by protocol and submits them in their own flow.
  if (visitValue(visit, KenyaShaVisitExtension.claimType) === 'emergency-case' && !readOnly) {
    throw new OperationOutcomeError(badRequest('This is an emergency case claim: use $kenya-sha-emergency.'));
  }
  if (dispatched === 'partial') {
    // The patient has left; the facility may still finish the documents, then finalize.
    if (!readOnly && action !== 'finalize' && !(BillingActions as readonly string[]).includes(action)) {
      throw new OperationOutcomeError(badRequest('The claim was discharged PARTIAL: use finalize to submit it.'));
    }
  } else if (dispatched && !readOnly) {
    throw new OperationOutcomeError(badRequest(`The SHA claim for this encounter is already ${dispatched}.`));
  }

  const consent = {
    ...(params.otp ? { otp: params.otp } : {}),
    ...(params.dischargeAuthorizationGuid ? { dischargeAuthorizationGuid: params.dischargeAuthorizationGuid } : {}),
    ...(params.contactId ? { contactId: params.contactId } : {}),
  };

  let result: unknown;
  let dispatch: string | undefined;
  switch (action) {
    case 'add-line': {
      const attachments = params.attachment
        ? [await loadAttachment(params.attachment, requireParam(params.documentType, 'documentType'))]
        : [];
      const practitioner = parsePractitioner(params);
      result = await callHie(() =>
        addKenyaHieClaimLine(credentials, consentToken, {
          interventionCode: requireParam(params.interventionCode, 'interventionCode'),
          unitPrice: requireParam(params.unitPrice, 'unitPrice'),
          quantity: requireParam(params.quantity, 'quantity'),
          ...(params.serviceName ? { serviceName: params.serviceName } : {}),
          ...(params.serviceIdentifier ? { serviceIdentifier: params.serviceIdentifier } : {}),
          ...(practitioner ? { practitioner } : {}),
          attachments,
        })
      );
      break;
    }
    case 'remove-line':
      result = await callHie(() =>
        removeKenyaHieClaimLine(credentials, consentToken, requireParam(params.lineId, 'lineId'))
      );
      break;
    case 'add-diagnosis': {
      const practitioner = parsePractitioner(params);
      result = await callHie(() =>
        addKenyaHieClaimDiagnosis(credentials, consentToken, {
          interventionCode: requireParam(params.interventionCode, 'interventionCode'),
          icdCode: requireParam(params.icdCode, 'icdCode'),
          ...(practitioner ? { practitioner } : {}),
        })
      );
      break;
    }
    case 'remove-diagnosis':
      result = await callHie(() =>
        removeKenyaHieClaimDiagnosis(credentials, consentToken, {
          interventionCode: requireParam(params.interventionCode, 'interventionCode'),
          icdCode: requireParam(params.icdCode, 'icdCode'),
        })
      );
      break;
    case 'add-attachment': {
      const interventionCode = requireParam(params.interventionCode, 'interventionCode');
      const file = await loadAttachment(
        requireParam(params.attachment, 'attachment'),
        requireParam(params.documentType, 'documentType')
      );
      result = await callHie(() => addKenyaHieClaimAttachment(credentials, consentToken, interventionCode, file));
      break;
    }
    case 'remove-attachment':
      result = await callHie(() =>
        removeKenyaHieClaimAttachment(credentials, consentToken, {
          attachmentId: requireParam(params.attachmentId, 'attachmentId'),
          interventionCode: requireParam(params.interventionCode, 'interventionCode'),
        })
      );
      break;
    case 'preview':
      result = summarizeKenyaHieClaim(await callHie(() => previewKenyaHieClaim(credentials, consentToken)));
      break;
    case 'payer-preview': {
      const invoiceNumber = params.invoiceNumber ?? visitValue(visit, KenyaShaVisitExtension.invoiceNumber);
      result = await callHie(() => getKenyaHiePayerClaim(credentials, requireParam(invoiceNumber, 'invoiceNumber')));
      break;
    }
    case 'send-discharge-otp':
      if (!patientCrId) {
        throw new OperationOutcomeError(badRequest('The patient has no DHA Client Registry ID.'));
      }
      result = await callHie(() => sendKenyaHieDischargeOtp(credentials, consentToken, patientCrId));
      break;
    case 'submit': {
      if (serviceType === 'INPATIENT') {
        throw new OperationOutcomeError(badRequest('An inpatient claim is dispatched with discharge, not submit.'));
      }
      const status = params.dischargeStatus?.trim().toUpperCase();
      if (status && status !== 'FULL' && status !== 'PARTIAL') {
        throw new OperationOutcomeError(badRequest('dischargeStatus must be FULL or PARTIAL'));
      }
      result = summarizeKenyaHieClaim(
        await callHie(() =>
          submitKenyaHieClaim(credentials, consentToken, {
            invoiceNumber: requireParam(params.invoiceNumber, 'invoiceNumber'),
            dischargeReason: requireParam(params.dischargeReason, 'dischargeReason'),
            consent,
            ...(status ? { dischargeStatus: status as 'FULL' | 'PARTIAL' } : {}),
            ...(params.notes ? { notes: params.notes } : {}),
          })
        )
      );
      dispatch = status === 'PARTIAL' ? 'partial' : 'submitted';
      break;
    }
    case 'finalize':
      if (dispatched !== 'partial') {
        throw new OperationOutcomeError(badRequest('Only a claim discharged PARTIAL can be finalised.'));
      }
      result = summarizeKenyaHieClaim(await callHie(() => finalizeKenyaHiePartialClaim(credentials, consentToken)));
      dispatch = 'submitted';
      break;
    case 'discharge':
      if (serviceType !== 'INPATIENT') {
        throw new OperationOutcomeError(
          badRequest('Only an inpatient claim is dispatched with discharge; use submit.')
        );
      }
      result = summarizeKenyaHieClaim(
        await callHie(() =>
          dischargeKenyaHiePatient(credentials, consentToken, {
            invoiceNumber: requireParam(params.invoiceNumber, 'invoiceNumber'),
            dischargeReason: requireParam(params.dischargeReason, 'dischargeReason'),
            dischargeDate: requireParam(params.dischargeDate, 'dischargeDate'),
            consent,
          })
        )
      );
      dispatch = 'discharged';
      break;
    case 'close':
      result = summarizeKenyaHieClaim(
        await callHie(() =>
          closeKenyaHieClaim(credentials, consentToken, {
            reasonType: requireParam(params.cancelReasonType, 'cancelReasonType'),
            reasonText: requireParam(params.cancelReasonText, 'cancelReasonText'),
          })
        )
      );
      dispatch = 'closed';
      break;
  }

  if (!dispatch) {
    return [allOk, buildOutputParameters(kenyaShaClaimOperation, { result: JSON.stringify(result) })];
  }

  // Record the dispatch on the encounter's SHA visit, as the caller, failing if it changed meanwhile.
  const summary = result as ReturnType<typeof summarizeKenyaHieClaim>;
  const replace = new Map<string, Extension>([
    [KenyaShaVisitExtension.dispatch, { url: KenyaShaVisitExtension.dispatch, valueCode: dispatch }],
    [
      KenyaShaVisitExtension.dispatchedAt,
      { url: KenyaShaVisitExtension.dispatchedAt, valueDateTime: new Date().toISOString() },
    ],
  ]);
  const invoiceNumber = params.invoiceNumber?.trim() || summary.invoiceNumber;
  if (invoiceNumber) {
    replace.set(KenyaShaVisitExtension.invoiceNumber, {
      url: KenyaShaVisitExtension.invoiceNumber,
      valueString: invoiceNumber,
    });
  }
  if (summary.workflowState) {
    replace.set(KenyaShaVisitExtension.workflowState, {
      url: KenyaShaVisitExtension.workflowState,
      valueString: summary.workflowState,
    });
  }
  const values = [...(visit.extension ?? []).filter((e) => !replace.has(e.url)), ...replace.values()];
  const ctx = getAuthenticatedContext();
  const updated = await ctx.repo.updateResource<Encounter>(
    {
      ...encounter,
      extension: (encounter.extension ?? []).map((e) =>
        e.url === KenyaShaVisitExtension.url ? { url: e.url, extension: values } : e
      ),
    },
    { ifMatch: encounter.meta?.versionId }
  );

  return [
    allOk,
    buildOutputParameters(kenyaShaClaimOperation, {
      result: JSON.stringify(result),
      encounter: createReference(updated),
    }),
  ];
}
