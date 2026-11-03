// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import { normalizeErrorString } from '@medplum/core';
import type { AuditEvent } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import { isAppendOnlyResourceType } from './append-only';
import type { Repository } from './repo';

describe('Append-only resources', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    await shutdownApp();
  });

  test('AuditEvent is append-only, Patient is not', () => {
    expect(isAppendOnlyResourceType('AuditEvent')).toBe(true);
    expect(isAppendOnlyResourceType('Patient')).toBe(false);
  });

  describe.each([
    ['project admin', { membership: { admin: true } }],
    ['super admin', { superAdmin: true }],
  ])('as %s', (_label, options) => {
    let repo: Repository;
    let auditEvent: WithId<AuditEvent>;

    beforeAll(async () => {
      ({ repo } = await createTestProject({ withRepo: true, ...options }));
      auditEvent = await repo.createResource<AuditEvent>({
        resourceType: 'AuditEvent',
        type: { system: 'http://dicom.nema.org/resources/ontology/DCM', code: '110110' },
        recorded: new Date().toISOString(),
        agent: [{ requestor: true, who: { display: 'Test user' } }],
        source: { observer: { display: 'Test' } },
      });
    });

    test('cannot update', () =>
      withTestContext(async () => {
        await expect(repo.updateResource({ ...auditEvent, outcomeDesc: 'changed' })).rejects.toThrow(
          'AuditEvent resources are append-only and cannot be updated'
        );
      }));

    test('cannot patch', () =>
      withTestContext(async () => {
        await expect(
          repo.patchResource('AuditEvent', auditEvent.id, [{ op: 'add', path: '/outcomeDesc', value: 'changed' }])
        ).rejects.toThrow('AuditEvent resources are append-only and cannot be updated');
      }));

    test('cannot delete', () =>
      withTestContext(async () => {
        await expect(repo.deleteResource('AuditEvent', auditEvent.id)).rejects.toThrow(
          'AuditEvent resources are append-only and cannot be deleted'
        );
        const stillThere = await repo.readResource<AuditEvent>('AuditEvent', auditEvent.id);
        expect(stillThere.meta?.versionId).toBe(auditEvent.meta?.versionId);
      }));

    test('cannot expunge', () =>
      withTestContext(async () => {
        try {
          await repo.expungeResource('AuditEvent', auditEvent.id);
          throw new Error('Expected expunge to fail');
        } catch (err) {
          expect(normalizeErrorString(err)).toContain('append-only and cannot be expunged');
        }
      }));
  });
});
