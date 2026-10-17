// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Automatic IDSR trigger: fires when a Condition carrying a Kenya IDSR
// immediately-notifiable condition code (ICD-11 preferred, ICD-10 accepted)
// is created or updated via the FHIR API.
//
// Regulatory basis: Kenya Health Act 2017 s.57(1) — immediate notification
// (within 24 hours) to the County Director of Health is mandatory.
// The auto-trigger ensures no clinician-created Condition is silently missed.

import { getKenyaIdsrConditionCode, getKenyaIdsrNotificationSnapshot, getProjectSettingString } from '@medplum/core';
import type { FhirResponse } from '@medplum/fhir-router';
import type { Condition } from '@medplum/fhirtypes';
import { randomUUID } from 'node:crypto';
import type { AuthenticatedRequestContext } from '../../context';
import { applyIdsrNotificationExtension, handleKenyaIdsrNotification } from './idsr';

/**
 * Called in the FHIR write path after a successful Condition create or update.
 * If the Condition carries an IDSR-notifiable condition code (ICD-11 or ICD-10) and has not already
 * been notified, spawns an async notification (non-blocking — never delays the
 * HTTP response or fails the write).
 * @param ctx - The authenticated request context of the write.
 * @param method - The HTTP method of the write.
 * @param result - The FHIR response returned by the write.
 */
export function maybeAutoTriggerIdsr(ctx: AuthenticatedRequestContext, method: string, result: FhirResponse): void {
  // Only fire on write operations
  if (method !== 'POST' && method !== 'PUT' && method !== 'PATCH') {
    return;
  }
  // Result must carry a resource (2-tuple or 3-tuple)
  if (result.length < 2) {
    return;
  }
  const resource = result[1];
  if (resource?.resourceType !== 'Condition' || !resource.id) {
    return;
  }
  // Kenya country pack only
  if (getProjectSettingString(ctx.project, 'countryPack') !== 'kenya') {
    return;
  }
  // Skip if already notified (any status — avoids re-triggering on every update)
  if (getKenyaIdsrNotificationSnapshot(resource)) {
    return;
  }
  // Skip if not a notifiable condition code (ICD-11 or ICD-10)
  if (!getKenyaIdsrConditionCode(resource)) {
    return;
  }

  const condition = resource as Condition & { id: string };
  const correlationId = randomUUID();

  // Fire-and-forget: IDSR notification must not block the clinical write
  handleKenyaIdsrNotification({ ctx, condition, correlationId })
    .then(async (idsrResult) => {
      // Stamp the extension on the Condition so subsequent updates don't re-trigger.
      // Use systemRepo so this succeeds even when the caller's repo has limited scope.
      try {
        const fresh = await ctx.systemRepo.readResource<Condition>('Condition', condition.id);
        const stamped = applyIdsrNotificationExtension(fresh as Condition & { id: string }, idsrResult);
        await ctx.systemRepo.updateResource(stamped);
      } catch {
        // Extension stamping is best-effort. The Task has already been created,
        // which is the canonical record of the notification. A duplicate trigger
        // on the next update is acceptable.
      }
    })
    .catch(() => {
      // Errors are already logged inside handleKenyaIdsrNotification via AuditEvent.
    });
}
