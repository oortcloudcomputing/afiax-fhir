// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Condition, Project } from '@medplum/fhirtypes';
import { allOk } from '@medplum/core';
import { maybeAutoTriggerIdsr } from './auto-idsr';
import type { FhirResponse } from '@medplum/fhir-router';

// Mock the heavy IDSR handler — tests for that logic are in idsr.test.ts
jest.mock('./idsr', () => ({
  handleKenyaIdsrNotification: jest.fn(async () => ({
    status: 'pending',
    correlationId: 'corr-1',
    conditionCode: 'A00',
    conditionDisplay: 'Cholera',
    message: 'Task created',
    notifiedAt: '2026-06-15T00:00:00Z',
  })),
  applyIdsrNotificationExtension: jest.fn((condition: Condition) => condition),
}));

const { handleKenyaIdsrNotification, applyIdsrNotificationExtension } = jest.requireMock('./idsr');

function makeCtx(countryPack = 'kenya'): any {
  return {
    project: {
      resourceType: 'Project',
      id: 'proj-1',
      setting: [{ name: 'countryPack', valueString: countryPack }],
    } as Project,
    profile: { reference: 'Practitioner/dr-1' },
    systemRepo: {
      readResource: jest.fn(async (type: string, id: string) => ({ resourceType: type, id })),
      updateResource: jest.fn(async (r: any) => r),
    },
  };
}

function notifiableCondition(id = 'cond-1'): Condition & { id: string } {
  return {
    resourceType: 'Condition',
    id,
    subject: { reference: 'Patient/p-1' },
    code: {
      coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'A00' }],
    },
  };
}

function nonNotifiableCondition(): Condition & { id: string } {
  return {
    resourceType: 'Condition',
    id: 'cond-2',
    subject: { reference: 'Patient/p-1' },
    code: {
      coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'J00' }],
    },
  };
}

function alreadyNotifiedCondition(): Condition & { id: string } {
  return {
    ...notifiableCondition('cond-3'),
    extension: [
      {
        url: 'https://afiax.africa/fhir/StructureDefinition/kenya-idsr-notification',
        extension: [
          { url: 'status', valueCode: 'pending' },
          { url: 'conditionCode', valueString: 'A00' },
          { url: 'notifiedAt', valueDateTime: '2026-06-15T00:00:00Z' },
          { url: 'correlationId', valueString: 'existing-corr' },
        ],
      },
    ],
  };
}

describe('maybeAutoTriggerIdsr', () => {
  beforeEach(() => {
    handleKenyaIdsrNotification.mockClear();
    applyIdsrNotificationExtension.mockClear();
  });

  test('does not trigger on GET', () => {
    const ctx = makeCtx();
    const result: FhirResponse = [allOk, notifiableCondition()];
    maybeAutoTriggerIdsr(ctx, 'GET', result);
    expect(handleKenyaIdsrNotification).not.toHaveBeenCalled();
  });

  test('does not trigger for non-Kenya projects', () => {
    const ctx = makeCtx('other');
    const result: FhirResponse = [allOk, notifiableCondition()];
    maybeAutoTriggerIdsr(ctx, 'POST', result);
    expect(handleKenyaIdsrNotification).not.toHaveBeenCalled();
  });

  test('does not trigger for non-notifiable Condition codes', () => {
    const ctx = makeCtx();
    const result: FhirResponse = [allOk, nonNotifiableCondition()];
    maybeAutoTriggerIdsr(ctx, 'POST', result);
    expect(handleKenyaIdsrNotification).not.toHaveBeenCalled();
  });

  test('does not trigger for non-Condition resources', () => {
    const ctx = makeCtx();
    const result: FhirResponse = [allOk, { resourceType: 'Observation', id: 'obs-1' } as any];
    maybeAutoTriggerIdsr(ctx, 'POST', result);
    expect(handleKenyaIdsrNotification).not.toHaveBeenCalled();
  });

  test('does not re-trigger when IDSR extension already present', () => {
    const ctx = makeCtx();
    const result: FhirResponse = [allOk, alreadyNotifiedCondition()];
    maybeAutoTriggerIdsr(ctx, 'POST', result);
    expect(handleKenyaIdsrNotification).not.toHaveBeenCalled();
  });

  test('does not trigger for result with no resource (outcome-only)', () => {
    const ctx = makeCtx();
    const result: FhirResponse = [allOk];
    maybeAutoTriggerIdsr(ctx, 'POST', result);
    expect(handleKenyaIdsrNotification).not.toHaveBeenCalled();
  });

  test('triggers on POST with notifiable Condition', async () => {
    const ctx = makeCtx();
    const result: FhirResponse = [allOk, notifiableCondition()];
    maybeAutoTriggerIdsr(ctx, 'POST', result);
    // Allow the async fire-and-forget to settle
    await new Promise((r) => setTimeout(r, 10));
    expect(handleKenyaIdsrNotification).toHaveBeenCalledWith(
      expect.objectContaining({ condition: notifiableCondition(), correlationId: expect.any(String) })
    );
  });

  test('triggers on PUT (update) with notifiable Condition', async () => {
    const ctx = makeCtx();
    const result: FhirResponse = [allOk, notifiableCondition()];
    maybeAutoTriggerIdsr(ctx, 'PUT', result);
    await new Promise((r) => setTimeout(r, 10));
    expect(handleKenyaIdsrNotification).toHaveBeenCalled();
  });

  test('stamps extension on Condition after successful notification', async () => {
    const ctx = makeCtx();
    const condition = notifiableCondition();
    const result: FhirResponse = [allOk, condition];
    maybeAutoTriggerIdsr(ctx, 'POST', result);
    await new Promise((r) => setTimeout(r, 10));
    expect(ctx.systemRepo.readResource).toHaveBeenCalledWith('Condition', condition.id);
    expect(applyIdsrNotificationExtension).toHaveBeenCalled();
    expect(ctx.systemRepo.updateResource).toHaveBeenCalled();
  });
});
