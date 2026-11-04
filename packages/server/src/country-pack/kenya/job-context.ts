// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { getProjectSystemRepo } from '../../fhir/repo';

/**
 * The parts of a request context that Kenya surveillance and reporting code needs. Satisfied by
 * an authenticated request context, and by a system context for scheduled background jobs.
 */
export type KenyaContext = Pick<AuthenticatedRequestContext, 'project' | 'repo' | 'systemRepo' | 'profile'>;

/** Display name used as the requester of work done by scheduled jobs. */
export const KenyaSchedulerDisplay = 'Afiax surveillance scheduler';

/**
 * Builds a system context for a scheduled job acting on one project.
 * Searches through `repo` are not limited to the project, so callers must filter by `_project`.
 * @param project - The project the job acts on.
 * @returns The job context.
 */
export function buildKenyaJobContext(project: WithId<Project>): KenyaContext {
  const systemRepo = getProjectSystemRepo(project);
  return {
    project,
    repo: systemRepo,
    systemRepo,
    profile: { reference: `Project/${project.id}`, display: KenyaSchedulerDisplay },
  } as unknown as KenyaContext;
}
