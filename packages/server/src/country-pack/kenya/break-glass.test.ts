// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Flag, Patient, Project } from '@medplum/fhirtypes';
import { handleBreakGlassAccess } from './break-glass';

jest.mock('../../util/auditevent', () => ({
  ...jest.requireActual('../../util/auditevent'),
  createAuditEvent: jest.fn(() => ({ resourceType: 'AuditEvent', entity: [], purposeOfEvent: [] })),
  AuditEventOutcome: { Success: '0', MajorFailure: '12' },
  RestfulOperationType: { code: 'rest', system: 'http://terminology.hl7.org/CodeSystem/audit-event-type' },
  OperationInteraction: { code: 'operation', system: 'http://hl7.org/fhir/restful-interaction' },
}));

jest.mock('../../email/email', () => ({
  sendEmail: jest.fn(async () => undefined),
}));

import { sendEmail } from '../../email/email';

const mockPatient: Patient & { id: string } = {
  resourceType: 'Patient',
  id: 'patient-1',
  name: [{ family: 'Kamau', given: ['John'] }],
};

const mockProject: Project = {
  resourceType: 'Project',
  id: 'project-1',
  name: 'Test Clinic',
  setting: [{ name: 'countryPack', valueString: 'kenya' }],
};

function buildCtx(overrides?: Partial<{
  createResource: jest.Mock;
  updateResource: jest.Mock;
  readResource: jest.Mock;
}>): any {
  return {
    project: mockProject,
    profile: { reference: 'Practitioner/prac-1' },
    logger: { warn: jest.fn() },
    repo: {},
    systemRepo: {
      createResource: overrides?.createResource ?? jest.fn(async (r: any) => ({ ...r, id: `${r.resourceType}-1`.toLowerCase() })),
      updateResource: overrides?.updateResource ?? jest.fn(async (r: any) => r),
      readResource: overrides?.readResource ?? jest.fn(async () => mockProject),
    },
  };
}

describe('handleBreakGlassAccess', () => {
  beforeEach(() => (sendEmail as jest.Mock).mockClear());

  test('creates Flag, persists extension on Patient, and sends alert email', async () => {
    const createResource = jest.fn(async (r: any) => ({ ...r, id: 'res-1' }));
    const updateResource = jest.fn(async (r: any) => r);
    const ctx = buildCtx({ createResource, updateResource });

    const result = await handleBreakGlassAccess({
      ctx,
      patient: mockPatient,
      reason: 'Unconscious patient — emergency treatment required',
      durationHours: 4,
      correlationId: 'corr-1',
    });

    expect(result.status).toBe('active');
    expect(result.correlationId).toBe('corr-1');
    expect(result.durationHours).toBe(4);
    expect(result.flag?.reference).toMatch(/^Flag\//);
    expect(result.alertSent).toBe(true);

    // Flag created
    const flagCall = createResource.mock.calls.find((c) => c[0].resourceType === 'Flag');
    expect(flagCall).toBeDefined();
    const flag = flagCall[0] as Flag;
    expect(flag.status).toBe('active');
    expect(flag.code?.coding?.[0]?.code).toBe('break-glass-access');
    expect(flag.period?.start).toBeDefined();
    expect(flag.period?.end).toBeDefined();

    // Patient updated with break-glass extension
    const patientUpdate = updateResource.mock.calls.find((c) => c[0].resourceType === 'Patient');
    expect(patientUpdate).toBeDefined();
    const updatedPatient = patientUpdate[0] as Patient;
    const bgExt = updatedPatient.extension?.find(
      (e) => e.url === 'https://afiax.africa/fhir/StructureDefinition/kenya-break-glass'
    );
    expect(bgExt).toBeDefined();
    expect(bgExt?.extension?.find((e) => e.url === 'reason')?.valueString).toBe(
      'Unconscious patient — emergency treatment required'
    );

    // Alert email sent
    expect(sendEmail).toHaveBeenCalledTimes(1);
    const emailCall = (sendEmail as jest.Mock).mock.calls[0][1];
    expect(emailCall.subject).toContain('Break-glass');
    expect(emailCall.text).toContain('Kamau');
    expect(emailCall.text).toContain('corr-1');
    expect(emailCall.to).toBe('security@afiax.africa');
  });

  test('clamps durationHours to 24-hour maximum', async () => {
    const ctx = buildCtx();
    const result = await handleBreakGlassAccess({
      ctx,
      patient: mockPatient,
      reason: 'Emergency',
      durationHours: 999,
      correlationId: 'corr-2',
    });
    expect(result.durationHours).toBe(24);
    const start = new Date(result.declaredAt).getTime();
    const end = new Date(result.expiresAt).getTime();
    expect(end - start).toBe(24 * 3600 * 1000);
  });

  test('defaults to 4-hour duration when not specified', async () => {
    const ctx = buildCtx();
    const result = await handleBreakGlassAccess({
      ctx,
      patient: mockPatient,
      reason: 'Emergency',
      correlationId: 'corr-3',
    });
    expect(result.durationHours).toBe(4);
  });

  test('returns error and does not send alert when Flag creation fails', async () => {
    const createResource = jest.fn()
      .mockRejectedValueOnce(new Error('DB write failed'))
      .mockResolvedValue({ resourceType: 'AuditEvent', id: 'ae-1' });
    const ctx = buildCtx({ createResource });

    const result = await handleBreakGlassAccess({
      ctx,
      patient: mockPatient,
      reason: 'Emergency',
      correlationId: 'corr-4',
    });

    expect(result.status).toBe('error');
    expect(result.message).toContain('DB write failed');
    expect(result.alertSent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  test('succeeds even when alert email fails — break-glass must not block emergency access', async () => {
    (sendEmail as jest.Mock).mockRejectedValueOnce(new Error('SMTP down'));
    const ctx = buildCtx();

    const result = await handleBreakGlassAccess({
      ctx,
      patient: mockPatient,
      reason: 'Emergency',
      correlationId: 'corr-5',
    });

    expect(result.status).toBe('active');
    expect(result.alertSent).toBe(false); // email failed
    expect(result.flag).toBeDefined(); // but flag still created
  });

  test('uses custom security alert email from project setting', async () => {
    const ctx = buildCtx();
    ctx.systemRepo.readResource = jest.fn(async () => ({
      ...mockProject,
      setting: [
        { name: 'countryPack', valueString: 'kenya' },
        { name: 'kenyaSecurityAlertEmail', valueString: 'privacy@clinic.ke' },
      ],
    }));

    await handleBreakGlassAccess({
      ctx,
      patient: mockPatient,
      reason: 'Emergency',
      correlationId: 'corr-6',
    });

    const emailCall = (sendEmail as jest.Mock).mock.calls[0][1];
    expect(emailCall.to).toBe('privacy@clinic.ke');
  });
});
