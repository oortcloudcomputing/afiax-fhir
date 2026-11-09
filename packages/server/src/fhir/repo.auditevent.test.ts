// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { AuditEvent, Patient } from '@medplum/fhirtypes';
import { initAppServices, shutdownApp } from '../app';
import { getConfig, loadTestConfig } from '../config/loader';
import { createTestProject, withTestContext } from '../test.setup';
import { getProjectSystemRepo } from './repo';

describe('Saved AuditEvents', () => {
  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);
  });

  afterAll(async () => {
    getConfig().saveAuditEvents = undefined;
    await shutdownApp();
  });

  test("A read-only user's reads are audited, though they cannot write AuditEvent", () =>
    withTestContext(async () => {
      getConfig().saveAuditEvents = true;
      const {
        project,
        repo: reader,
        client,
      } = await createTestProject({
        withClient: true,
        withRepo: true,
        accessPolicy: { resource: [{ resourceType: 'Patient', readonly: true }] },
      });
      const systemRepo = getProjectSystemRepo(project);
      const patient = await systemRepo.createResource<Patient>({
        resourceType: 'Patient',
        meta: { project: project.id },
        name: [{ family: 'Audit' }],
      });

      await reader.readResource('Patient', patient.id);
      await expect(reader.createResource<AuditEvent>({ resourceType: 'AuditEvent' } as AuditEvent)).rejects.toThrow(
        'Forbidden'
      );

      let events: AuditEvent[] = [];
      for (let i = 0; i < 50 && events.length === 0; i++) {
        await new Promise((resolve) => {
          setTimeout(resolve, 100);
        });
        events = await systemRepo.searchResources<AuditEvent>({
          resourceType: 'AuditEvent',
          filters: [{ code: 'entity', operator: 'eq' as never, value: `Patient/${patient.id}` }],
        });
      }
      const read = events.find((e) => e.subtype?.some((s) => s.code === 'read'));
      expect(read).toBeDefined();
      expect(read?.agent?.[0]?.who?.reference).toBe(`ClientApplication/${client.id}`);
      expect(read?.meta?.project).toBe(project.id);
    }));
});
