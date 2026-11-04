// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya surveillance scheduler (DHA REP-IDSR-001, REP-IMM-001):
//   - every Monday 06:00 EAT, submit last week's MOH 505 IDSR report to KHIS for every facility of
//     every Kenya project that has KHIS configured, skipping weeks already submitted;
//   - every hour, retry IDSR immediate notifications whose KHIS delivery failed.
// No per-project setup is needed: a project takes part once countryPack=kenya and its KHIS
// credentials and MOH 505 dataset UID are set.

import type { WithId } from '@medplum/core';
import { getProjectSettingString, Operator, toKhisWeekPeriod } from '@medplum/core';
import type { Project, Task } from '@medplum/fhirtypes';
import type { Job, QueueBaseOptions } from 'bullmq';
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { getKenyaFacilities } from '../country-pack/kenya/facility-attribution';
import { retryFailedKenyaIdsrDeliveries } from '../country-pack/kenya/idsr-delivery';
import { buildKenyaJobContext } from '../country-pack/kenya/job-context';
import { getKhisCredentials } from '../country-pack/kenya/khis';
import {
  getKhisWeeklyPeriodKey,
  handleKhisWeeklyExport,
  KenyaKhisWeeklyPeriodSystem,
} from '../country-pack/kenya/khis-export';
import { getGlobalSystemRepo } from '../fhir/repo';
import { globalLogger } from '../logger';
import type { WorkerInitializer, WorkerInitializerOptions } from './utils';
import { getBullmqRedisConnectionOptions, getWorkerBullmqConfig, queueRegistry } from './utils';

export type KenyaSurveillanceJobName = 'idsr-weekly' | 'idsr-retry';

export interface KenyaSurveillanceJobData {
  readonly job: KenyaSurveillanceJobName;
}

const queueName = 'KenyaSurveillanceQueue';

/** Monday 03:00 UTC = 06:00 EAT, after the reporting week (Monday-Sunday) has closed. */
export const KenyaIdsrWeeklyCron = '0 3 * * 1';
/** Every hour at quarter past. */
export const KenyaIdsrRetryCron = '15 * * * *';

export const initKenyaSurveillanceWorker: WorkerInitializer = (config, options?: WorkerInitializerOptions) => {
  const defaultOptions: QueueBaseOptions = { connection: getBullmqRedisConnectionOptions(config) };
  const queue = new Queue<KenyaSurveillanceJobData>(queueName, {
    ...defaultOptions,
    defaultJobOptions: { attempts: 1, removeOnComplete: { count: 50 }, removeOnFail: { count: 50 } },
  });

  let worker: Worker<KenyaSurveillanceJobData> | undefined;
  if (options?.workerEnabled !== false) {
    worker = new Worker<KenyaSurveillanceJobData>(queueName, execKenyaSurveillanceJob, {
      ...defaultOptions,
      ...getWorkerBullmqConfig(config, 'kenya-surveillance'),
    });
    worker.on('failed', (job, err) => globalLogger.error('Kenya surveillance job failed', { job: job?.name, err }));

    // Schedulers are keyed by id, so every server instance upserts the same two schedules
    Promise.all([
      queue.upsertJobScheduler(
        'kenya-idsr-weekly',
        { pattern: KenyaIdsrWeeklyCron },
        {
          name: 'idsr-weekly',
          data: { job: 'idsr-weekly' },
        }
      ),
      queue.upsertJobScheduler(
        'kenya-idsr-retry',
        { pattern: KenyaIdsrRetryCron },
        {
          name: 'idsr-retry',
          data: { job: 'idsr-retry' },
        }
      ),
    ]).catch((err) => globalLogger.error('Failed to schedule Kenya surveillance jobs', { err }));
  }

  return { queue, worker, name: queueName };
};

/**
 * Returns the Kenya surveillance queue (used by tests).
 * @returns The queue, if initialized.
 */
export function getKenyaSurveillanceQueue(): Queue<KenyaSurveillanceJobData> | undefined {
  return queueRegistry.get(queueName);
}

/**
 * Runs one scheduled Kenya surveillance job.
 * @param job - The BullMQ job.
 */
export async function execKenyaSurveillanceJob(job: Job<KenyaSurveillanceJobData>): Promise<void> {
  const projects = await getKenyaProjects();
  for (const project of projects) {
    try {
      if (job.data.job === 'idsr-weekly') {
        await runWeeklyIdsrForProject(project);
      } else {
        const result = await retryFailedKenyaIdsrDeliveries(buildKenyaJobContext(project));
        if (result.retried > 0) {
          globalLogger.info('IDSR delivery retry', { project: project.id, ...result });
        }
      }
    } catch (err) {
      globalLogger.error('Kenya surveillance job failed for project', { project: project.id, job: job.data.job, err });
    }
  }
}

async function getKenyaProjects(): Promise<WithId<Project>[]> {
  const projects = await getGlobalSystemRepo().searchResources<Project>({ resourceType: 'Project', count: 1000 });
  return projects.filter((p) => getProjectSettingString(p, 'countryPack') === 'kenya');
}

/**
 * Submits last week's MOH 505 report to KHIS for each facility (Organization with an MFL code) in
 * the project, unless that facility's week has already been exported successfully.
 * @param project - The Kenya project.
 * @param now - The current time (for tests).
 * @returns The facility ids submitted.
 */
export async function runWeeklyIdsrForProject(project: WithId<Project>, now: Date = new Date()): Promise<string[]> {
  try {
    getKhisCredentials(project);
  } catch (err) {
    globalLogger.info('Skipping weekly IDSR: KHIS not configured', { project: project.id, reason: String(err) });
    return [];
  }

  const ctx = buildKenyaJobContext(project);
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const period = toKhisWeekPeriod(lastWeek);

  const facilities = await getKenyaFacilities(ctx);

  const submitted: string[] = [];
  for (const facility of facilities) {
    const done = await ctx.systemRepo.searchOne<Task>({
      resourceType: 'Task',
      filters: [
        { code: '_project', operator: Operator.EQUALS, value: project.id },
        {
          code: 'identifier',
          operator: Operator.EQUALS,
          value: `${KenyaKhisWeeklyPeriodSystem}|${getKhisWeeklyPeriodKey(facility.id, period)}`,
        },
        { code: 'status', operator: Operator.EQUALS, value: 'completed' },
      ],
    });
    if (done) {
      continue;
    }
    const result = await handleKhisWeeklyExport({ ctx, period, facilityId: facility.id, correlationId: randomUUID() });
    globalLogger.info('Weekly IDSR submitted', {
      project: project.id,
      facility: facility.id,
      period,
      status: result.status,
    });
    submitted.push(facility.id);
  }
  return submitted;
}
