// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Receives DHA HIE status callbacks (see country-pack/kenya/hie-callbacks.ts for DHA's rules).
//
// POST /kenya/hie/callbacks/{projectId}/{secret}/{entity}-status
// - The path carries a per-project secret (DHA's auth_type none with "a secret path"); it is
//   compared in constant time and a wrong or unknown one gets a plain 404.
// - Each event is durably accepted as a Communication (identifier = entity:subject_guid:to_state, so
//   DHA's retries are de-duplicated), then acknowledged with 200 before any processing (DHA: reply
//   inside timeout_ms, process afterwards).
// - Processing never trusts the payload for state: it finds the encounter by consent token and
//   re-reads the claim, preauth or authorization from DHA, and records what DHA says. If DHA cannot
//   be read, nothing changes and the Communication says why.
import type { WithId } from '@medplum/core';
import { createReference, normalizeErrorString, Operator } from '@medplum/core';
import type { Communication, Encounter, Extension, Project } from '@medplum/fhirtypes';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getKenyaAfyaLinkCredentials } from '../country-pack/kenya/afyalink';
import type { KenyaHieCallback } from '../country-pack/kenya/hie-callbacks';
import { getKenyaHieCallbackEventKey, parseKenyaHieCallback } from '../country-pack/kenya/hie-callbacks';
import { previewKenyaHieClaim, summarizeKenyaHieClaim } from '../country-pack/kenya/hie-claims';
import { getKenyaHiePreauth } from '../country-pack/kenya/hie-preauths';
import { getKenyaHieAuthorizations } from '../country-pack/kenya/hie-visit';
import { getProjectCountryPack } from '../country-pack/registry';
import { KenyaShaPreauthExtension } from '../fhir/operations/kenyashapreauth';
import { KenyaShaConsentTokenSystem, KenyaShaVisitExtension } from '../fhir/operations/kenyashavisit';
import { getGlobalSystemRepo, getProjectSystemRepo } from '../fhir/repo';
import { getLogger } from '../logger';

/** Project system secret holding the callback path secret. */
export const KenyaHieCallbackSecretName = 'kenyaHieCallbackSecret';
export const KenyaHieCallbackEventSystem = 'https://afiax.africa/kenya/identifier/dha-hie-callback-event';
export const KenyaHieCallbackCategory = {
  system: 'https://afiax.africa/fhir/CodeSystem/kenya-communication-category',
  code: 'dha-hie-status-callback',
  display: 'DHA HIE status callback',
};

function sameSecret(expected: string | undefined, given: string): boolean {
  if (!expected) {
    return false;
  }
  const a = createHash('sha256').update(expected).digest();
  const b = createHash('sha256').update(given).digest();
  return timingSafeEqual(a, b);
}

async function loadProject(projectId: string): Promise<WithId<Project> | undefined> {
  try {
    return await getGlobalSystemRepo().readResource<Project>('Project', projectId);
  } catch {
    return undefined;
  }
}

function setValues(extension: Extension | undefined, url: string, values: Record<string, string>): Extension {
  const keep = (extension?.extension ?? []).filter((e) => !(e.url in values));
  return { url, extension: [...keep, ...Object.entries(values).map(([k, v]) => ({ url: k, valueString: v }))] };
}

async function note(
  project: WithId<Project>,
  communication: WithId<Communication>,
  text: string,
  encounter?: WithId<Encounter>
): Promise<void> {
  await getProjectSystemRepo(project).updateResource<Communication>({
    ...communication,
    ...(encounter ? { encounter: createReference(encounter) } : {}),
    note: [...(communication.note ?? []), { time: new Date().toISOString(), text }],
  });
}

/**
 * Processes an accepted callback: finds the encounter by consent token and re-reads the entity
 * from DHA, recording DHA's state on the encounter.
 * @param project - The project.
 * @param callback - The parsed callback.
 * @param communication - The stored callback.
 */
export async function processKenyaHieCallback(
  project: WithId<Project>,
  callback: KenyaHieCallback,
  communication: WithId<Communication>
): Promise<void> {
  const repo = getProjectSystemRepo(project);
  const token = callback.consentToken;
  if (!token) {
    await note(project, communication, 'No consent token in the callback: not linked to an encounter.');
    return;
  }
  const encounter = await repo.searchOne<Encounter>({
    resourceType: 'Encounter',
    filters: [
      // The system repo searches across projects: confine it to this one.
      { code: '_project', operator: Operator.EQUALS, value: project.id },
      { code: 'identifier', operator: Operator.EQUALS, value: `${KenyaShaConsentTokenSystem}|${token}` },
    ],
  });
  if (!encounter) {
    await note(project, communication, 'No encounter holds this consent token.');
    return;
  }

  let state: string | null = null;
  try {
    const credentials = getKenyaAfyaLinkCredentials(project);
    if (callback.entityType === 'claim') {
      state = summarizeKenyaHieClaim(await previewKenyaHieClaim(credentials, token)).workflowState;
    } else if (callback.entityType === 'preauth') {
      state = (await getKenyaHiePreauth(credentials, token)).status;
    } else {
      state = (await getKenyaHieAuthorizations(credentials, { token }))[0]?.status ?? null;
    }
  } catch (err) {
    await note(
      project,
      communication,
      `Could not re-read the ${callback.entityType} from DHA, so nothing was changed: ${normalizeErrorString(err)}`,
      encounter
    );
    return;
  }
  if (!state) {
    await note(
      project,
      communication,
      `DHA returned no state for the ${callback.entityType}; nothing was changed.`,
      encounter
    );
    return;
  }

  const now = new Date().toISOString();
  const extensions = encounter.extension ?? [];
  const find = (url: string): Extension | undefined => extensions.find((e) => e.url === url);
  let updated: Extension | undefined;
  if (callback.entityType === 'claim') {
    updated = setValues(find(KenyaShaVisitExtension.url), KenyaShaVisitExtension.url, {
      [KenyaShaVisitExtension.workflowState]: state,
      lastStatusCallbackAt: now,
    });
  } else {
    const preauth = find(KenyaShaPreauthExtension.url);
    const isPreauthAuthorization =
      callback.entityType === 'authorization' &&
      preauth?.extension?.some((e) => e.url === KenyaShaPreauthExtension.authorizationToken && e.valueString === token);
    if (callback.entityType === 'preauth' || isPreauthAuthorization) {
      updated = setValues(preauth, KenyaShaPreauthExtension.url, {
        [callback.entityType === 'preauth'
          ? KenyaShaPreauthExtension.preauthStatus
          : KenyaShaPreauthExtension.authorizationStatus]: state,
        [KenyaShaPreauthExtension.updatedAt]: now,
      });
    }
  }
  if (updated) {
    const others = extensions.filter((e) => e.url !== updated.url);
    await repo.updateResource<Encounter>(
      { ...encounter, extension: [...others, updated] },
      { ifMatch: encounter.meta?.versionId }
    );
  }
  const reported =
    state === callback.toState ? 'matches the callback' : `differs from the callback's ${callback.toState}`;
  await note(
    project,
    communication,
    `DHA confirms the ${callback.entityType} is ${state} (${reported})${updated ? '; recorded on the encounter' : ''}.`,
    encounter
  );
}

/**
 * Handles POST /kenya/hie/callbacks/:projectId/:secret/:kind.
 * @param req - The request.
 * @param res - The response.
 */
export async function kenyaHieCallbackHandler(req: Request, res: Response): Promise<void> {
  const project = await loadProject(String(req.params.projectId));
  if (
    !project ||
    getProjectCountryPack(project)?.id !== 'kenya' ||
    !sameSecret(
      project.systemSecret?.find((s) => s.name === KenyaHieCallbackSecretName)?.valueString,
      String(req.params.secret)
    )
  ) {
    res.status(404).json({ error: 'Not found' });
    return;
  }

  let callback: KenyaHieCallback;
  try {
    callback = parseKenyaHieCallback(req.body);
  } catch (err) {
    res.status(400).json({ error: normalizeErrorString(err) });
    return;
  }
  if (req.params.kind !== `${callback.entityType}-status`) {
    res.status(400).json({ error: 'The callback entity_type does not match this endpoint' });
    return;
  }

  const repo = getProjectSystemRepo(project);
  const key = getKenyaHieCallbackEventKey(callback);
  const existing = await repo.searchOne<Communication>({
    resourceType: 'Communication',
    filters: [
      { code: '_project', operator: Operator.EQUALS, value: project.id },
      { code: 'identifier', operator: Operator.EQUALS, value: `${KenyaHieCallbackEventSystem}|${key}` },
    ],
  });
  if (existing) {
    // A DHA retry of an event already accepted.
    res.status(200).json({ received: true, duplicate: true });
    return;
  }
  const communication = await repo.createResource<Communication>({
    resourceType: 'Communication',
    // The project system repo does not stamp the project: set it so the project's users see it.
    meta: { project: project.id },
    status: 'completed',
    identifier: [{ system: KenyaHieCallbackEventSystem, value: key }],
    category: [{ coding: [KenyaHieCallbackCategory] }],
    sender: { display: 'DHA Health Information Exchange' },
    sent: callback.timestamp,
    received: new Date().toISOString(),
    payload: [{ contentString: JSON.stringify(req.body) }],
  });
  res.status(200).json({ received: true });

  processKenyaHieCallback(project, callback, communication).catch((err) =>
    getLogger().error('Kenya HIE callback processing failed', {
      project: project.id,
      key,
      error: normalizeErrorString(err),
    })
  );
}

export const kenyaHieRouter = Router();
kenyaHieRouter.post('/callbacks/:projectId/:secret/:kind', kenyaHieCallbackHandler);
