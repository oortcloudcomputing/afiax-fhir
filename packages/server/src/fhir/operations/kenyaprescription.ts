// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { allOk, badRequest, getReferenceString, Operator, OperationOutcomeError } from '@medplum/core';
import type { FhirRequest, FhirResponse } from '@medplum/fhir-router';
import type { Binary, Encounter, MedicationRequest, Organization, Patient, Practitioner } from '@medplum/fhirtypes';
import { getAuthenticatedContext } from '../../context';
import {
  buildKenyaPrescriptionDocument,
  isPrintableKenyaPrescription,
} from '../../country-pack/kenya/prescription-pdf';
import { getProjectCountryPack } from '../../country-pack/registry';
import { createPdf } from '../../util/pdf';

/**
 * Handles GET Encounter/:id/$kenya-prescription: the printed prescription for a visit, as a PDF.
 * Lists the visit's active prescriptions, each with its prescription code and QR code. Reads with
 * the caller's repository, so access policies apply. With `?medicationRequest=<id>` it prints one.
 * A browser or any non-FHIR Accept header gets the PDF itself; FHIR JSON gets a Binary.
 * @param req - The FHIR request.
 * @returns A Binary holding the PDF.
 */
export async function kenyaPrescriptionHandler(req: FhirRequest): Promise<FhirResponse> {
  const ctx = getAuthenticatedContext();
  if (getProjectCountryPack(ctx.project)?.id !== 'kenya') {
    throw new OperationOutcomeError(badRequest('This operation requires the Kenya country pack.'));
  }
  const encounter = await ctx.repo.readResource<Encounter>('Encounter', req.params.id);
  if (!encounter.subject?.reference?.startsWith('Patient/')) {
    throw new OperationOutcomeError(badRequest('The encounter has no patient'));
  }
  const patient = await ctx.repo.readReference<Patient>(encounter.subject as { reference: string });

  const only = req.query.medicationRequest ? String(req.query.medicationRequest) : undefined;
  const requests = (
    await ctx.repo.searchResources<MedicationRequest>({
      resourceType: 'MedicationRequest',
      filters: [
        { code: 'encounter', operator: Operator.EQUALS, value: getReferenceString(encounter) },
        ...(only ? [{ code: '_id', operator: Operator.EQUALS, value: only }] : []),
      ],
      sortRules: [{ code: '_lastUpdated' }],
      count: 100,
    })
  ).filter(isPrintableKenyaPrescription);
  if (requests.length === 0) {
    throw new OperationOutcomeError(badRequest('This visit has no active prescriptions with a prescription code'));
  }

  const prescribers: Record<string, Practitioner | undefined> = {};
  for (const ref of new Set(requests.map((r) => r.requester?.reference).filter((r) => r?.startsWith('Practitioner/')))) {
    prescribers[ref as string] = await ctx.repo
      .readReference<Practitioner>({ reference: ref as string })
      .catch(() => undefined);
  }
  const facility = encounter.serviceProvider?.reference
    ? await ctx.repo.readReference<Organization>(encounter.serviceProvider).catch(() => undefined)
    : undefined;

  const pdf = await createPdf(
    buildKenyaPrescriptionDocument({
      encounter,
      patient,
      requests,
      prescribers,
      facility,
      printedAt: new Date().toISOString(),
    })
  );
  const binary: Binary = {
    resourceType: 'Binary',
    contentType: 'application/pdf',
    data: pdf.toString('base64'),
  };
  return [allOk, binary];
}
