// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * PostgreSQL row-level security (RLS) for project isolation.
 *
 * Medplum already restricts every query to the caller's projects in the query builder
 * (Repository.addProjectFilters). RLS adds the same rule inside PostgreSQL as a backstop, so a
 * query-builder bug or a missing filter cannot return or modify another tenant's rows.
 *
 * Every table with a "projectId" column gets ENABLE + FORCE ROW LEVEL SECURITY and one policy:
 * a row is visible and writable only if its projectId is in the session setting
 * `medplum.project_ids`, whenever `medplum.rls_enforce` is 'on'.
 *
 * Repositories acting for a user or client set both settings with SET LOCAL semantics
 * (set_config(..., true)) — at the start of explicit transactions, and around single queries via
 * RlsScopedPool. System repositories (migrations, workers, seeding, super admin) do not set
 * `medplum.rls_enforce`, so internal jobs are unaffected.
 *
 * Tables without "projectId" (history, lookup and reference tables) are only ever reached together
 * with, or after, a projectId-filtered read of the owning resource.
 */

import type { Pool, PoolClient, QueryConfig, QueryResult } from 'pg';
import { getLogger } from '../logger';

const POLICY_NAME = 'medplum_project_isolation';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let enabled = false;

/**
 * Returns true if row-level security is active on this server.
 * @returns True when RLS policies are installed and enforced for user repositories.
 */
export function isRowLevelSecurityEnabled(): boolean {
  return enabled;
}

/**
 * Installs (idempotently) the RLS policies on all tables that have a "projectId" column, and turns
 * on enforcement for user repositories. Requires the connecting role to own the tables.
 *
 * PostgreSQL never applies RLS to superusers or roles with BYPASSRLS, so startup fails if the
 * server connects as one — otherwise RLS would appear enabled while enforcing nothing.
 * @param pool - The writer pool.
 * @param options - Options.
 * @param options.allowBypassRole - Install policies even though the current role bypasses them
 *   (used when policies are installed by an administrator role and the server connects as another role).
 * @returns The number of tables protected.
 */
export async function initRowLevelSecurity(pool: Pool, options?: { allowBypassRole?: boolean }): Promise<number> {
  const role = await pool.query<{ rolsuper: boolean; rolbypassrls: boolean; rolname: string }>(
    'SELECT rolname, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user'
  );
  const current = role.rows[0];
  if (!options?.allowBypassRole && (current?.rolsuper || current?.rolbypassrls)) {
    throw new Error(
      `rowLevelSecurity is enabled but database role "${current.rolname}" is a superuser or has BYPASSRLS, ` +
        'so PostgreSQL would not enforce the policies. Connect as a non-superuser role without BYPASSRLS.'
    );
  }

  const tables = await pool.query<{ table_name: string }>(
    `SELECT c.table_name FROM information_schema.columns c
     JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
     WHERE c.table_schema = current_schema() AND c.column_name = 'projectId' AND t.table_type = 'BASE TABLE'`
  );
  const condition = `(current_setting('medplum.rls_enforce', true) IS DISTINCT FROM 'on'
    OR "projectId" = ANY (string_to_array(nullif(current_setting('medplum.project_ids', true), ''), ',')::uuid[]))`;

  for (const { table_name: table } of tables.rows) {
    const ident = `"${table.replaceAll('"', '""')}"`;
    await pool.query(`ALTER TABLE ${ident} ENABLE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${ident} FORCE ROW LEVEL SECURITY`);
    await pool.query(`DROP POLICY IF EXISTS ${POLICY_NAME} ON ${ident}`);
    await pool.query(`CREATE POLICY ${POLICY_NAME} ON ${ident} USING ${condition} WITH CHECK ${condition}`);
  }
  enabled = true;
  getLogger().info('Row-level security enabled', { tables: tables.rows.length });
  return tables.rows.length;
}

/**
 * Removes the RLS policies and stops enforcement.
 * @param pool - The writer pool.
 */
export async function disableRowLevelSecurity(pool: Pool): Promise<void> {
  const tables = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_policies WHERE schemaname = current_schema() AND policyname = $1`,
    [POLICY_NAME]
  );
  for (const { tablename } of tables.rows) {
    const ident = `"${tablename.replaceAll('"', '""')}"`;
    await pool.query(`DROP POLICY IF EXISTS ${POLICY_NAME} ON ${ident}`);
    await pool.query(`ALTER TABLE ${ident} NO FORCE ROW LEVEL SECURITY`);
    await pool.query(`ALTER TABLE ${ident} DISABLE ROW LEVEL SECURITY`);
  }
  enabled = false;
}

/**
 * Stops enforcement for this process (used on shutdown). Installed policies stay in place and are
 * inert until a session sets `medplum.rls_enforce`.
 */
export function resetRowLevelSecurity(): void {
  enabled = false;
}

/**
 * Builds the statement that scopes the current transaction to the given projects.
 * Project ids are validated as UUIDs before being embedded, so the statement is injection-safe.
 * @param projectIds - The project ids the caller may access.
 * @returns A SELECT that sets the transaction-local RLS settings.
 */
export function rlsScopeStatement(projectIds: string[]): string {
  for (const id of projectIds) {
    if (!UUID_PATTERN.test(id)) {
      throw new Error(`Invalid project id for row-level security: ${id}`);
    }
  }
  return `SELECT set_config('medplum.rls_enforce', 'on', true), set_config('medplum.project_ids', '${projectIds.join(',')}', true)`;
}

/**
 * A pool stand-in that runs each query in its own short transaction scoped to the caller's projects.
 * Used by user repositories outside explicit transactions.
 */
export class RlsScopedPool {
  private readonly pool: Pool;
  private readonly projectIds: string[];
  private readonly readOnly: boolean;

  constructor(pool: Pool, projectIds: string[], readOnly: boolean) {
    this.pool = pool;
    this.projectIds = projectIds;
    this.readOnly = readOnly;
  }

  async query(textOrConfig: string | QueryConfig, values?: unknown[]): Promise<QueryResult> {
    const client: PoolClient = await this.pool.connect();
    let failed: Error | undefined;
    try {
      await client.query(`BEGIN${this.readOnly ? ' READ ONLY' : ''}; ${rlsScopeStatement(this.projectIds)}`);
      const result = await client.query(textOrConfig as string, values);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      failed = err as Error;
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release(failed?.message.includes('Connection terminated') ? failed : undefined);
    }
  }
}
