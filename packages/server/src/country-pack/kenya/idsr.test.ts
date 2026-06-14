// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Condition, Project, Task } from '@medplum/fhirtypes';
import { handleKenyaIdsrNotification, applyIdsrNotificationExtension } from './idsr';

jest.mock('../../util/auditevent', () => ({
  ...jest.requireActual('../../util/auditevent'),
  createAuditEvent: jest.fn(() => ({ resourceType: 'AuditEvent', entity: [] })),
  AuditEventOutcome: { Success: '0', MajorFailure: '12' },
  RestfulOperationType: { code: 'rest', system: 'http://terminology.hl7.org/CodeSystem/audit-event-type' },
  OperationInteraction: { code: 'operation', system: 'http://hl7.org/fhir/restful-interaction' },
}));

describe('handleKenyaIdsrNotification', () => {
  const mockProject: Project = {
    resourceType: 'Project',
    id: 'project-1',
    setting: [{ name: 'countryPack', valueString: 'kenya' }],
  };

  const mockProfile = { resourceType: 'Practitioner', reference: 'Practitioner/prac-1' } as any;

  function buildCtx(createResource?: jest.Mock): any {
    return {
      project: mockProject,
      profile: mockProfile,
      systemRepo: {
        createResource:
          createResource ??
          jest.fn(async (resource: any) => ({ ...resource, id: 'task-1' })),
      },
    };
  }

  function buildCondition(codes: Array<{ system?: string; code: string }>): Condition & { id: string } {
    return {
      resourceType: 'Condition',
      id: 'cond-1',
      subject: { reference: 'Patient/test-patient' },
      code: {
        coding: codes.map((c) => ({ system: c.system ?? 'http://hl7.org/fhir/sid/icd-10', code: c.code })),
      },
    };
  }

  test('creates a pending Task for an immediately notifiable condition', async () => {
    const createResource = jest.fn(async (resource: any) => ({ ...resource, id: 'task-1' }));
    const ctx = buildCtx(createResource);
    const condition = buildCondition([{ code: 'A00' }]); // Cholera

    const result = await handleKenyaIdsrNotification({ ctx, condition, correlationId: 'corr-1' });

    expect(result.status).toBe('pending');
    expect(result.conditionCode).toBe('A00');
    expect(result.conditionDisplay).toBe('Cholera');
    expect(result.task?.reference).toMatch(/^Task\//);
    expect(createResource).toHaveBeenCalledTimes(2); // Task + AuditEvent

    const taskArg = createResource.mock.calls[0][0] as Task;
    expect(taskArg.resourceType).toBe('Task');
    expect(taskArg.code?.text).toBe('idsr-immediate-notification');
    expect(taskArg.identifier?.[0]?.value).toBe('corr-1');
    // 24-hour restriction
    expect(taskArg.restriction?.period?.start).toBeDefined();
    expect(taskArg.restriction?.period?.end).toBeDefined();
  });

  test('returns error when condition has no IDSR code', async () => {
    const ctx = buildCtx();
    const condition = buildCondition([{ code: 'J45' }]); // Asthma — not notifiable

    const result = await handleKenyaIdsrNotification({ ctx, condition, correlationId: 'corr-2' });

    expect(result.status).toBe('error');
    expect(result.conditionCode).toBe('');
    expect(result.message).toContain('IDSR');
  });

  test('returns error and creates AuditEvent when Task creation fails', async () => {
    const createResource = jest
      .fn()
      .mockRejectedValueOnce(new Error('DB write failed'))
      .mockResolvedValueOnce({ resourceType: 'AuditEvent', id: 'ae-1' }); // AuditEvent succeeds
    const ctx = buildCtx(createResource);
    const condition = buildCondition([{ code: 'B05' }]); // Measles

    const result = await handleKenyaIdsrNotification({ ctx, condition, correlationId: 'corr-3' });

    expect(result.status).toBe('error');
    expect(result.message).toContain('DB write failed');
    expect(createResource).toHaveBeenCalledTimes(2); // failed Task + AuditEvent
  });

  test('picks the first matching IDSR code when condition has multiple codings', async () => {
    const ctx = buildCtx();
    const condition = buildCondition([
      { code: 'J45' },    // Asthma — not notifiable
      { code: 'A39' },   // Meningococcal disease — notifiable
    ]);

    const result = await handleKenyaIdsrNotification({ ctx, condition, correlationId: 'corr-4' });

    expect(result.status).toBe('pending');
    expect(result.conditionCode).toBe('A39');
    expect(result.conditionDisplay).toBe('Meningococcal disease');
  });
});

describe('applyIdsrNotificationExtension', () => {
  test('adds IDSR notification extension to condition', () => {
    const condition: Condition & { id: string } = {
      resourceType: 'Condition',
      id: 'cond-1',
      subject: { reference: 'Patient/test-patient' },
    };

    const result = applyIdsrNotificationExtension(condition, {
      status: 'pending',
      conditionCode: 'A00',
      conditionDisplay: 'Cholera',
      notifiedAt: '2026-06-14T10:00:00Z',
      correlationId: 'corr-1',
      message: 'Task created',
      task: { reference: 'Task/task-1' },
    });

    expect(result.extension).toHaveLength(1);
    const ext = result.extension?.[0];
    expect(ext?.url).toBe('https://afiax.africa/fhir/StructureDefinition/kenya-idsr-notification');
    const children = ext?.extension ?? [];
    expect(children.find((e) => e.url === 'status')?.valueCode).toBe('pending');
    expect(children.find((e) => e.url === 'conditionCode')?.valueCode).toBe('A00');
  });

  test('replaces an existing IDSR extension rather than appending', () => {
    const condition: Condition & { id: string } = {
      resourceType: 'Condition',
      id: 'cond-1',
      subject: { reference: 'Patient/test-patient' },
      extension: [
        {
          url: 'https://afiax.africa/fhir/StructureDefinition/kenya-idsr-notification',
          extension: [{ url: 'status', valueCode: 'pending' }],
        },
      ],
    };

    const result = applyIdsrNotificationExtension(condition, {
      status: 'reported',
      conditionCode: 'A00',
      conditionDisplay: 'Cholera',
      notifiedAt: '2026-06-14T12:00:00Z',
      correlationId: 'corr-2',
      message: 'Reported',
    });

    expect(result.extension).toHaveLength(1);
    expect(result.extension?.[0]?.extension?.find((e) => e.url === 'status')?.valueCode).toBe('reported');
  });
});
