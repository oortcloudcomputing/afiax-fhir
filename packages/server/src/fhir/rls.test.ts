// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Patient } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { initAppServices, shutdownApp } from '../app';
import { loadTestConfig } from '../config/loader';
import { closeDatabase, DatabaseMode, getDatabasePool, initDatabase } from '../database';
import { createTestProject, withTestContext } from '../test.setup';
import type { Repository } from './repo';
import { disableRowLevelSecurity, initRowLevelSecurity, isRowLevelSecurityEnabled, rlsScopeStatement } from './rls';

// The local test database connects as a superuser, which PostgreSQL exempts from RLS. Like
// production (Patroni medplum_app), the server must connect as a non-superuser role for RLS to apply.
const RLS_ROLE = 'medplum_rls_app';

describe('PostgreSQL row-level security', () => {
  let repoA: Repository;
  let repoB: Repository;
  let patientA: Patient & { id: string };

  beforeAll(async () => {
    const config = await loadTestConfig();
    await initAppServices(config);

    const admin = getDatabasePool(DatabaseMode.WRITER);
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${RLS_ROLE}') THEN
        CREATE ROLE ${RLS_ROLE} LOGIN PASSWORD '${RLS_ROLE}' NOSUPERUSER NOBYPASSRLS;
      END IF;
    END $$`);
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${RLS_ROLE}`);
    await admin.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${RLS_ROLE}`);
    await admin.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${RLS_ROLE}`);
    await expect(initRowLevelSecurity(admin)).rejects.toThrow('superuser or has BYPASSRLS');
    await initRowLevelSecurity(admin, { allowBypassRole: true });

    // Reconnect the server pools as the non-superuser role
    await closeDatabase();
    const asApp = { ...config.database, username: RLS_ROLE, password: RLS_ROLE };
    await initDatabase({ ...config, database: asApp, readonlyDatabase: asApp });

    repoA = (await createTestProject({ withRepo: true })).repo;
    repoB = (await createTestProject({ withRepo: true })).repo;
    patientA = await withTestContext(() =>
      repoA.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Achieng' }] })
    );
  });

  afterAll(async () => {
    const config = await loadTestConfig();
    await closeDatabase();
    await initDatabase(config);
    await disableRowLevelSecurity(getDatabasePool(DatabaseMode.WRITER));
    await shutdownApp();
  });

  function rawClient(repo: Repository, mode: DatabaseMode = DatabaseMode.READER): Pool | PoolClient {
    return repo.getDatabaseClient(mode);
  }

  test('is enabled and installs policies on resource tables', async () => {
    expect(isRowLevelSecurityEnabled()).toBe(true);
    const result = await getDatabasePool(DatabaseMode.WRITER).query(
      `SELECT relrowsecurity, relforcerowsecurity FROM pg_class WHERE relname = 'Patient'`
    );
    expect(result.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  test('normal FHIR operations work inside the caller project', () =>
    withTestContext(async () => {
      const read = await repoA.readResource<Patient>('Patient', patientA.id);
      expect(read.id).toBe(patientA.id);
      const updated = await repoA.updateResource<Patient>({ ...read, gender: 'female' });
      expect(updated.gender).toBe('female');
      const patched = await repoA.patchResource<Patient>('Patient', patientA.id, [
        { op: 'add', path: '/birthDate', value: '1990-01-01' },
      ]);
      expect(patched.birthDate).toBe('1990-01-01');
      const history = await repoA.readHistory('Patient', patientA.id);
      expect(history.entry?.length).toBe(3);
      const found = await repoA.searchResources<Patient>({ resourceType: 'Patient' });
      expect(found.map((p) => p.id)).toContain(patientA.id);
    }));

  test('raw SQL through another project cannot see the row', () =>
    withTestContext(async () => {
      const sql = 'SELECT id FROM "Patient" WHERE id = $1';
      expect((await rawClient(repoB).query(sql, [patientA.id])).rows).toHaveLength(0);
      expect((await rawClient(repoA).query(sql, [patientA.id])).rows).toHaveLength(1);
      // The system pool (no RLS context) still sees it
      expect((await getDatabasePool(DatabaseMode.WRITER).query(sql, [patientA.id])).rows).toHaveLength(1);
    }));

  test('raw SQL through another project cannot modify the row', () =>
    withTestContext(async () => {
      const result = await rawClient(repoB, DatabaseMode.WRITER).query(
        'UPDATE "Patient" SET "deleted" = true WHERE id = $1',
        [patientA.id]
      );
      expect(result.rowCount).toBe(0);
      expect((await repoA.readResource<Patient>('Patient', patientA.id)).id).toBe(patientA.id);
    }));

  test('another project cannot insert rows into this project', () =>
    withTestContext(async () => {
      const projectA = repoA.currentProject()?.id;
      await expect(
        rawClient(repoB, DatabaseMode.WRITER).query(
          `INSERT INTO "Patient" (id, "lastUpdated", deleted, "projectId", content, "__version")
           VALUES ($1, now(), false, $2, '{}', 1)`,
          [randomUUID(), projectA]
        )
      ).rejects.toThrow('row-level security');
    }));

  test('explicit transactions are scoped too', () =>
    withTestContext(async () => {
      const rows = await repoB.withTransaction(async (conn) => {
        const result = await conn.query('SELECT id FROM "Patient" WHERE id = $1', [patientA.id]);
        return result.rows;
      });
      expect(rows).toHaveLength(0);
    }));

  test('rejects non-UUID project ids in the scope statement', () => {
    expect(() => rlsScopeStatement(['x\'); DROP TABLE "Patient"; --'])).toThrow('Invalid project id');
  });
});
