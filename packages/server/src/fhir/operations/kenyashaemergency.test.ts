// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { createReference, KenyaClientRegistryIdSystem } from '@medplum/core';
import type { Encounter, Extension, Parameters, Patient, Project } from '@medplum/fhirtypes';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { initApp, shutdownApp } from '../../app';
import { registerNew } from '../../auth/register';
import { loadTestConfig } from '../../config/loader';
import { getKenyaAfyaLinkCredentials } from '../../country-pack/kenya/afyalink';
import {
  addKenyaHieEmergencyProtocol,
  createKenyaHieEmergencyClaim,
  getKenyaHieEmergencyProtocols,
  identifyKenyaHieEmergencyPatient,
  submitKenyaHieEmergencyClaim,
} from '../../country-pack/kenya/hie-emergency';
import { addTestUser, withTestContext } from '../../test.setup';
import { getProjectSystemRepo } from '../repo';
import { KenyaShaVisitExtension } from './kenyashavisit';

jest.mock('../../country-pack/kenya/afyalink', () => ({
  ...jest.requireActual('../../country-pack/kenya/afyalink'),
  getKenyaAfyaLinkCredentials: jest.fn(),
}));

jest.mock('../../country-pack/kenya/hie-emergency', () => ({
  ...jest.requireActual('../../country-pack/kenya/hie-emergency'),
  createKenyaHieEmergencyClaim: jest.fn(),
  getKenyaHieEmergencyProtocols: jest.fn(),
  addKenyaHieEmergencyProtocol: jest.fn(),
  identifyKenyaHieEmergencyPatient: jest.fn(),
  submitKenyaHieEmergencyClaim: jest.fn(),
}));

const app = express();
const credentials = { baseUrl: 'https://hie.example', clientId: 'id', clientSecret: 'secret' };

describe('Encounter SHA emergency case operation (Kenya)', () => {
  let project: WithId<Project>;
  let token: string;

  beforeAll(async () => {
    const config = await loadTestConfig();
    await withTestContext(() => initApp(app, config));
    const registered = await withTestContext(() =>
      registerNew({
        firstName: 'Emergency',
        lastName: 'Admin',
        projectName: 'Kenya SHA Emergency Project',
        email: `emergency${randomUUID()}@example.com`,
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
    const clinician = await withTestContext(() =>
      addTestUser(project, {
        resourceType: 'AccessPolicy',
        resource: [{ resourceType: 'Encounter' }, { resourceType: 'Patient' }, { resourceType: 'Organization' }],
      })
    );
    token = clinician.accessToken;
  });

  afterAll(async () => {
    await shutdownApp();
  });

  const repo = (): ReturnType<typeof getProjectSystemRepo> => getProjectSystemRepo(project);

  const newCase = async (crId?: string): Promise<{ patient: WithId<Patient>; encounter: WithId<Encounter> }> => {
    const patient = await withTestContext(() =>
      repo().createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        name: [{ text: crId ? 'Juma Otieno' : 'Unknown male' }],
        ...(crId ? { identifier: [{ system: KenyaClientRegistryIdSystem, value: crId }] } : {}),
      })
    );
    const encounter = await withTestContext(() =>
      repo().createResource<Encounter>({
        resourceType: 'Encounter',
        meta: { project: project.id },
        status: 'in-progress',
        class: { code: 'EMER' },
        subject: createReference(patient),
      })
    );
    return { patient, encounter };
  };

  const call = (id: string, operation: string, parameter: Parameters['parameter']): request.Test =>
    request(app)
      .post(`/fhir/R4/Encounter/${id}/$${operation}`)
      .set('Authorization', 'Bearer ' + token)
      .send({ resourceType: 'Parameters', parameter });

  const createParams: Parameters['parameter'] = [
    { name: 'action', valueCode: 'create' },
    { name: 'interventionCode', valueString: 'SHA-01-005' },
    { name: 'modeOfArrival', valueCode: 'AMBULANCE' },
    { name: 'broughtBy', valueCode: 'PARAMEDICS' },
    { name: 'referenceNumber', valueString: 'EMG/1/2026' },
    { name: 'practitionerIdentificationNumber', valueString: 'A00000' },
    { name: 'practitionerRegulator', valueCode: 'KMPDC' },
  ];

  const visitValue = async (id: string, url: string): Promise<Extension | undefined> => {
    const enc = (
      await request(app)
        .get(`/fhir/R4/Encounter/${id}`)
        .set('Authorization', 'Bearer ' + token)
    ).body as Encounter;
    return enc.extension?.find((e) => e.url === KenyaShaVisitExtension.url)?.extension?.find((e) => e.url === url);
  };

  test('unidentified patient: create, bill a protocol, identify, submit', async () => {
    const { patient, encounter } = await newCase();
    (createKenyaHieEmergencyClaim as jest.Mock).mockResolvedValueOnce({
      claimId: 'c1',
      consentToken: 'EMGTOKEN',
      workflowState: 'OPEN',
    });
    const created = await call(encounter.id, 'kenya-sha-emergency', createParams);
    expect(created.status).toBe(200);
    const [, emergencyCase, consent] = (createKenyaHieEmergencyClaim as jest.Mock).mock.calls[0];
    expect(consent).toBeUndefined();
    expect(emergencyCase).toMatchObject({ interventionCode: 'SHA-01-005', referenceNumber: 'EMG/1/2026' });
    expect((await visitValue(encounter.id, KenyaShaVisitExtension.identified))?.valueBoolean).toBe(false);
    expect((await visitValue(encounter.id, KenyaShaVisitExtension.claimType))?.valueString).toBe('emergency-case');

    // Protocols: only approved ones, within the tariff
    (getKenyaHieEmergencyProtocols as jest.Mock).mockResolvedValue([
      {
        protocolCode: 'P-001',
        name: 'Chest X-Ray',
        applicableTariff: 2500,
        status: 'ACTIVE',
        applicableDocumentTypes: [],
      },
    ]);
    const tooMuch = await call(encounter.id, 'kenya-sha-emergency', [
      { name: 'action', valueCode: 'add-protocol' },
      { name: 'protocolCode', valueString: 'P-001' },
      { name: 'unitPrice', valueDecimal: 3000 },
      { name: 'quantity', valueDecimal: 1 },
    ]);
    expect(tooMuch.status).toBe(400);
    expect(tooMuch.body.issue[0].details.text).toContain('above the approved tariff');
    const unknown = await call(encounter.id, 'kenya-sha-emergency', [
      { name: 'action', valueCode: 'add-protocol' },
      { name: 'protocolCode', valueString: 'P-999' },
      { name: 'unitPrice', valueDecimal: 100 },
      { name: 'quantity', valueDecimal: 1 },
    ]);
    expect(unknown.status).toBe(400);
    (addKenyaHieEmergencyProtocol as jest.Mock).mockResolvedValueOnce({ id: 'line-1' });
    const billed = await call(encounter.id, 'kenya-sha-emergency', [
      { name: 'action', valueCode: 'add-protocol' },
      { name: 'protocolCode', valueString: 'P-001' },
      { name: 'unitPrice', valueDecimal: 2500 },
      { name: 'quantity', valueDecimal: 1 },
      { name: 'icdCode', valueString: 'NE00' },
    ]);
    expect(billed.status).toBe(200);
    expect(addKenyaHieEmergencyProtocol).toHaveBeenCalledWith(credentials, 'EMGTOKEN', {
      protocolCode: 'P-001',
      interventionCode: 'SHA-01-005',
      unitPrice: 2500,
      quantity: 1,
      icdCodes: ['NE00'],
      attachments: [],
    });

    // Ordinary claim and preauth actions are refused on an emergency case
    const line = await call(encounter.id, 'kenya-sha-claim', [{ name: 'action', valueCode: 'remove-line' }]);
    expect(line.status).toBe(400);
    expect(line.body.issue[0].details.text).toBe('This is an emergency case claim: use $kenya-sha-emergency.');
    const preauth = await call(encounter.id, 'kenya-sha-preauth', [{ name: 'action', valueCode: 'status' }]);
    expect(preauth.status).toBe(400);

    // Unidentified submission needs the reason
    (submitKenyaHieEmergencyClaim as jest.Mock).mockImplementationOnce(
      jest.requireActual('../../country-pack/kenya/hie-emergency').submitKenyaHieEmergencyClaim
    );
    const noReason = await call(encounter.id, 'kenya-sha-emergency', [
      { name: 'action', valueCode: 'submit' },
      { name: 'invoiceNumber', valueString: 'EMG/INV/1' },
      { name: 'dischargeReason', valueCode: 'RECOVERED' },
    ]);
    expect(noReason.status).toBe(400);
    expect(noReason.body.issue[0].details.text).toContain('SHA_UNREGISTERED, DECEASED');

    // Identify: needs the CR ID on the patient, then sends the stored case fields
    const noCr = await call(encounter.id, 'kenya-sha-emergency', [
      { name: 'action', valueCode: 'identify' },
      { name: 'otp', valueString: '123456' },
    ]);
    expect(noCr.status).toBe(400);
    await withTestContext(() =>
      repo().updateResource<Patient>({
        ...patient,
        identifier: [{ system: KenyaClientRegistryIdSystem, value: 'CR555' }],
      })
    );
    (identifyKenyaHieEmergencyPatient as jest.Mock).mockResolvedValueOnce({ workflowState: 'OPEN' });
    const identified = await call(encounter.id, 'kenya-sha-emergency', [
      { name: 'action', valueCode: 'identify' },
      { name: 'otp', valueString: '123456' },
    ]);
    expect(identified.status).toBe(200);
    expect(identifyKenyaHieEmergencyPatient).toHaveBeenCalledWith(
      credentials,
      'EMGTOKEN',
      {
        interventionCode: 'SHA-01-005',
        modeOfArrival: 'AMBULANCE',
        broughtBy: 'PARAMEDICS',
        referenceNumber: 'EMG/1/2026',
        practitioner: { identificationNumber: 'A00000', identificationType: 'registration_number', regulator: 'KMPDC' },
      },
      { crId: 'CR555', otp: '123456' }
    );

    (submitKenyaHieEmergencyClaim as jest.Mock).mockResolvedValueOnce({ workflowState: 'SUBMITTED' });
    const submitted = await call(encounter.id, 'kenya-sha-emergency', [
      { name: 'action', valueCode: 'submit' },
      { name: 'invoiceNumber', valueString: 'EMG/INV/1' },
      { name: 'dischargeReason', valueCode: 'RECOVERED' },
    ]);
    expect(submitted.status).toBe(200);
    expect((submitKenyaHieEmergencyClaim as jest.Mock).mock.calls.at(-1)[3]).toBe(true);
    expect((await visitValue(encounter.id, KenyaShaVisitExtension.dispatch))?.valueString).toBe('submitted');

    const after = await call(encounter.id, 'kenya-sha-emergency', [{ name: 'action', valueCode: 'protocols' }]);
    expect(after.status).toBe(400);
  });

  test('identified patient: the OTP and CR ID go with the create', async () => {
    const { encounter } = await newCase('CR777');
    (createKenyaHieEmergencyClaim as jest.Mock).mockResolvedValueOnce({ claimId: 'c2', consentToken: 'T2' });
    const res = await call(encounter.id, 'kenya-sha-emergency', [
      ...(createParams ?? []),
      { name: 'otp', valueString: '111222' },
    ]);
    expect(res.status).toBe(200);
    expect((createKenyaHieEmergencyClaim as jest.Mock).mock.calls.at(-1)[2]).toEqual({ crId: 'CR777', otp: '111222' });
    expect((await visitValue(encounter.id, KenyaShaVisitExtension.identified))?.valueBoolean).toBe(true);

    const twice = await call(encounter.id, 'kenya-sha-emergency', createParams);
    expect(twice.status).toBe(400);
  });

  test('needs the attending doctor', async () => {
    const { encounter } = await newCase();
    const res = await call(
      encounter.id,
      'kenya-sha-emergency',
      (createParams ?? []).filter((p) => !p.name.startsWith('practitioner'))
    );
    expect(res.status).toBe(400);
    expect(res.body.issue[0].details.text).toContain('attending doctor');
  });
});
