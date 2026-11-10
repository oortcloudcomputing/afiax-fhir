// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, KenyaClientRegistryIdSystem } from '@medplum/core';
import type { Binary, Encounter, Extension, Parameters, Patient, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import { getKenyaAfyaLinkCredentials } from '../../country-pack/kenya/afyalink';
import {
  addKenyaHieClaimAttachment,
  addKenyaHieClaimLine,
  dischargeKenyaHiePatient,
  finalizeKenyaHiePartialClaim,
  previewKenyaHieClaim,
  sendKenyaHieDischargeOtp,
  submitKenyaHieClaim,
} from '../../country-pack/kenya/hie-claims';
import { addTestUser, withTestContext } from '../../test.setup';
import { getProjectSystemRepo } from '../repo';
import { KenyaShaVisitExtension } from './kenyashavisit';

jest.mock('../../country-pack/kenya/afyalink', () => ({
  ...jest.requireActual('../../country-pack/kenya/afyalink'),
  getKenyaAfyaLinkCredentials: jest.fn(),
}));

jest.mock('../../country-pack/kenya/hie-claims', () => ({
  ...jest.requireActual('../../country-pack/kenya/hie-claims'),
  addKenyaHieClaimLine: jest.fn(),
  addKenyaHieClaimAttachment: jest.fn(),
  previewKenyaHieClaim: jest.fn(),
  sendKenyaHieDischargeOtp: jest.fn(),
  submitKenyaHieClaim: jest.fn(),
  finalizeKenyaHiePartialClaim: jest.fn(),
  dischargeKenyaHiePatient: jest.fn(),
}));

const app = express();
const credentials = { baseUrl: 'https://hie.example', clientId: 'id', clientSecret: 'secret' };
const CrId = 'CR9795515286992-5';

describe('Encounter SHA claim operation (Kenya)', () => {
  let project: WithId<Project>;
  let token: string;
  let patient: WithId<Patient>;

  const visitExtension = (serviceType: string, extra: Extension[] = []): Extension => ({
    url: KenyaShaVisitExtension.url,
    extension: [
      { url: KenyaShaVisitExtension.consentToken, valueString: 'K5HLPJVDNV' },
      { url: KenyaShaVisitExtension.serviceType, valueCode: serviceType },
      { url: KenyaShaVisitExtension.interventionCode, valueString: 'SHA-09-021' },
      ...extra,
    ],
  });

  const newEncounter = (extension?: Extension, classCode = 'AMB'): Promise<WithId<Encounter>> =>
    withTestContext(() =>
      getProjectSystemRepo(project).createResource<Encounter>({
        resourceType: 'Encounter',
        meta: { project: project.id },
        status: 'in-progress',
        class: { code: classCode },
        subject: createReference(patient),
        ...(extension ? { extension: [extension] } : {}),
      })
    );

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    const registered = await withTestContext(() =>
      registerNew({
        firstName: 'Claims',
        lastName: 'Admin',
        projectName: 'Kenya SHA Claim Project',
        email: `claim${randomUUID()}@example.com`,
        password: 'password!@#',
      })
    );
    project = await withTestContext(() =>
      getProjectSystemRepo(registered.project).updateResource<Project>({
        ...registered.project,
        setting: [{ name: 'countryPack', valueString: 'kenya' }],
      })
    );
    (getKenyaAfyaLinkCredentials as jest.Mock).mockReturnValue(credentials);
    patient = await withTestContext(() =>
      getProjectSystemRepo(project).createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        name: [{ family: 'Otieno' }],
        identifier: [{ system: KenyaClientRegistryIdSystem, value: CrId }],
      })
    );
    const clinician = await withTestContext(() =>
      addTestUser(project, {
        resourceType: 'AccessPolicy',
        resource: [
          { resourceType: 'Encounter' },
          { resourceType: 'Patient' },
          { resourceType: 'Organization' },
          { resourceType: 'Binary' },
          { resourceType: 'DocumentReference' },
        ],
      })
    );
    token = clinician.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const call = (id: string, parameter: Parameters['parameter']): request.Test =>
    request(app)
      .post(`/fhir/R4/Encounter/${id}/$kenya-sha-claim`)
      .set('Authorization', 'Bearer ' + token)
      .send({ resourceType: 'Parameters', parameter });

  const out = (res: request.Response, name: string): any =>
    res.body.parameter?.find((p: { name: string }) => p.name === name);

  test('needs a started SHA visit', async () => {
    const encounter = await newEncounter();
    const res = await call(encounter.id, [{ name: 'action', valueCode: 'preview' }]);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toContain('$kenya-start-visit');
  });

  test('bills a line with the consent token from the encounter', async () => {
    const encounter = await newEncounter(visitExtension('OUTPATIENT'));
    (addKenyaHieClaimLine as jest.Mock).mockResolvedValueOnce({ id: 'line-1' });
    const res = await call(encounter.id, [
      { name: 'action', valueCode: 'add-line' },
      { name: 'interventionCode', valueString: 'SHA-09-021' },
      { name: 'unitPrice', valueDecimal: 300 },
      { name: 'quantity', valueDecimal: 1 },
      { name: 'practitionerIdentificationNumber', valueString: 'A00000' },
      { name: 'practitionerRegulator', valueCode: 'KMPDC' },
    ]);
    expect(res.status).toBe(200);
    expect(addKenyaHieClaimLine).toHaveBeenCalledWith(credentials, 'K5HLPJVDNV', {
      interventionCode: 'SHA-09-021',
      unitPrice: 300,
      quantity: 1,
      practitioner: { identificationType: 'registration_number', identificationNumber: 'A00000', regulator: 'KMPDC' },
      attachments: [],
    });
  });

  test('sends a PDF Binary as an attachment, named by its document type', async () => {
    const encounter = await newEncounter(visitExtension('OUTPATIENT'));
    const upload = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + token)
      .set('Content-Type', 'application/pdf')
      .send(Buffer.from('%PDF-1.4 invoice'));
    expect(upload.status).toBe(201);
    const binary = upload.body as WithId<Binary>;
    (addKenyaHieClaimAttachment as jest.Mock).mockResolvedValueOnce({ id: 'att-1' });

    const res = await call(encounter.id, [
      { name: 'action', valueCode: 'add-attachment' },
      { name: 'interventionCode', valueString: 'SHA-09-021' },
      { name: 'documentType', valueCode: 'invoice' },
      { name: 'attachment', valueReference: { reference: `Binary/${binary.id}` } },
    ]);
    expect(res.status).toBe(200);
    const [, , interventionCode, file] = (addKenyaHieClaimAttachment as jest.Mock).mock.calls[0];
    expect(interventionCode).toBe('SHA-09-021');
    expect(file).toMatchObject({ documentType: 'INVOICE', filename: 'INVOICE.pdf', contentType: 'application/pdf' });
    expect(file.data.toString()).toBe('%PDF-1.4 invoice');
  });

  test('refuses an attachment type DHA cannot read', async () => {
    const encounter = await newEncounter(visitExtension('OUTPATIENT'));
    const upload = await request(app)
      .post('/fhir/R4/Binary')
      .set('Authorization', 'Bearer ' + token)
      .set('Content-Type', 'text/plain')
      .send('notes');
    const res = await call(encounter.id, [
      { name: 'action', valueCode: 'add-attachment' },
      { name: 'interventionCode', valueString: 'SHA-09-021' },
      { name: 'documentType', valueCode: 'CASE_NOTE' },
      { name: 'attachment', valueReference: { reference: `Binary/${upload.body.id}` } },
    ]);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('The attachment must be a PDF, JPEG or PNG file');
  });

  test('sends the discharge OTP to the patient by Client Registry ID', async () => {
    const encounter = await newEncounter(visitExtension('OUTPATIENT'));
    (sendKenyaHieDischargeOtp as jest.Mock).mockResolvedValueOnce({ message: 'OTP sent' });
    const res = await call(encounter.id, [{ name: 'action', valueCode: 'send-discharge-otp' }]);
    expect(res.status).toBe(200);
    expect(sendKenyaHieDischargeOtp).toHaveBeenCalledWith(credentials, 'K5HLPJVDNV', CrId);
  });

  test('submits an outpatient claim, records it, then refuses billing', async () => {
    const encounter = await newEncounter(visitExtension('OUTPATIENT'));
    (submitKenyaHieClaim as jest.Mock).mockResolvedValueOnce({
      id: 'claim-1',
      workflow_state: 'SUBMITTED',
      invoices: [{ invoice_number: 'OPD/1/23' }],
    });
    const res = await call(encounter.id, [
      { name: 'action', valueCode: 'submit' },
      { name: 'invoiceNumber', valueString: 'OPD/1/23' },
      { name: 'dischargeReason', valueCode: 'RECOVERED' },
      { name: 'otp', valueString: '123456' },
    ]);
    expect(res.status).toBe(200);
    expect(submitKenyaHieClaim).toHaveBeenCalledWith(credentials, 'K5HLPJVDNV', {
      invoiceNumber: 'OPD/1/23',
      dischargeReason: 'RECOVERED',
      consent: { otp: '123456' },
    });

    const updated = (
      await request(app)
        .get(`/fhir/R4/${out(res, 'encounter').valueReference.reference}`)
        .set('Authorization', 'Bearer ' + token)
    ).body as Encounter;
    const visit = updated.extension?.find((e) => e.url === KenyaShaVisitExtension.url);
    const value = (url: string): Extension | undefined => visit?.extension?.find((e) => e.url === url);
    expect(value(KenyaShaVisitExtension.dispatch)?.valueCode).toBe('submitted');
    expect(value(KenyaShaVisitExtension.invoiceNumber)?.valueString).toBe('OPD/1/23');
    expect(value(KenyaShaVisitExtension.workflowState)?.valueString).toBe('SUBMITTED');
    expect(value(KenyaShaVisitExtension.consentToken)?.valueString).toBe('K5HLPJVDNV');

    const again = await call(encounter.id, [
      { name: 'action', valueCode: 'add-line' },
      { name: 'interventionCode', valueString: 'SHA-09-021' },
      { name: 'unitPrice', valueDecimal: 300 },
      { name: 'quantity', valueDecimal: 1 },
    ]);
    expect(again.status).toBe(400);
    expect(again.body.issue[0].details.text).toBe('The SHA claim for this encounter is already submitted.');

    (previewKenyaHieClaim as jest.Mock).mockResolvedValueOnce({ id: 'claim-1', workflow_state: 'SUBMITTED' });
    const preview = await call(encounter.id, [{ name: 'action', valueCode: 'preview' }]);
    expect(preview.status).toBe(200);
    expect(JSON.parse(out(preview, 'result').valueString)).toMatchObject({ claimId: 'claim-1' });
  });

  test('a partial discharge can be finalised once', async () => {
    const encounter = await newEncounter(visitExtension('OUTPATIENT'));
    (submitKenyaHieClaim as jest.Mock).mockResolvedValueOnce({ workflow_state: 'DISCHARGED' });
    const partial = await call(encounter.id, [
      { name: 'action', valueCode: 'submit' },
      { name: 'invoiceNumber', valueString: 'OPD/2' },
      { name: 'dischargeReason', valueCode: 'RECOVERED' },
      { name: 'otp', valueString: '123456' },
      { name: 'dischargeStatus', valueCode: 'partial' },
    ]);
    expect(partial.status).toBe(200);

    const resubmit = await call(encounter.id, [
      { name: 'action', valueCode: 'submit' },
      { name: 'invoiceNumber', valueString: 'OPD/2' },
      { name: 'dischargeReason', valueCode: 'RECOVERED' },
      { name: 'otp', valueString: '123456' },
    ]);
    expect(resubmit.status).toBe(400);

    (finalizeKenyaHiePartialClaim as jest.Mock).mockResolvedValueOnce({ workflow_state: 'SUBMITTED' });
    const final = await call(encounter.id, [{ name: 'action', valueCode: 'finalize' }]);
    expect(final.status).toBe(200);
    expect(finalizeKenyaHiePartialClaim).toHaveBeenCalledWith(credentials, 'K5HLPJVDNV');
  });

  test('inpatients are discharged, outpatients submitted', async () => {
    const outpatient = await newEncounter(visitExtension('OUTPATIENT'));
    const wrong = await call(outpatient.id, [
      { name: 'action', valueCode: 'discharge' },
      { name: 'invoiceNumber', valueString: 'IP/1' },
      { name: 'dischargeReason', valueCode: 'RECOVERED' },
      { name: 'dischargeDate', valueDateTime: '2026-11-10T10:00:00+03:00' },
      { name: 'otp', valueString: '1' },
    ]);
    expect(wrong.status).toBe(400);

    const inpatient = await newEncounter(visitExtension('INPATIENT'), 'IMP');
    const submit = await call(inpatient.id, [
      { name: 'action', valueCode: 'submit' },
      { name: 'invoiceNumber', valueString: 'IP/1' },
      { name: 'dischargeReason', valueCode: 'RECOVERED' },
      { name: 'otp', valueString: '1' },
    ]);
    expect(submit.status).toBe(400);
    expect(submit.body.issue[0].details.text).toBe('An inpatient claim is dispatched with discharge, not submit.');

    (dischargeKenyaHiePatient as jest.Mock).mockResolvedValueOnce({ workflow_state: 'SUBMITTED' });
    const discharge = await call(inpatient.id, [
      { name: 'action', valueCode: 'discharge' },
      { name: 'invoiceNumber', valueString: 'IP/1' },
      { name: 'dischargeReason', valueCode: 'RECOVERED' },
      { name: 'dischargeDate', valueDateTime: '2026-11-10T10:00:00+03:00' },
      { name: 'dischargeAuthorizationGuid', valueString: 'guid-1' },
    ]);
    expect(discharge.status).toBe(200);
    expect(dischargeKenyaHiePatient).toHaveBeenCalledWith(credentials, 'K5HLPJVDNV', {
      invoiceNumber: 'IP/1',
      dischargeReason: 'RECOVERED',
      dischargeDate: '2026-11-10T10:00:00+03:00',
      consent: { dischargeAuthorizationGuid: 'guid-1' },
    });
  });

  test('reports a missing parameter', async () => {
    const encounter = await newEncounter(visitExtension('OUTPATIENT'));
    const res = await call(encounter.id, [{ name: 'action', valueCode: 'remove-line' }]);
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toBe('lineId is required for this action');
  });
});
