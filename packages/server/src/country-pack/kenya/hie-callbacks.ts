// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// DHA HIE status callbacks: registering our receiving endpoint with DHA, and reading the payloads
// DHA posts to it.
//
// Built against DHA's own sources, checked 2026-11-10 (pages last modified 2026-09-28): the Status
// Callbacks guide (docs/claims/guides/status-callbacks), Status Callbacks Process Overview, Register
// a Callback Endpoint, Register a Callback Operation, Manage Callback Endpoints, Authorization Status
// Callbacks, and the eClaims Status Callbacks API reference.
//
// What DHA specifies:
// - Two calls per entity type: POST /tenants/{tenant}/endpoints (the path value may be the tenant
//   ID or the tenant code, "normally the same value as your client ID"), then
//   POST /tenants/{facility FR code}/endpoints/{endpoint_id}/operations with action status_changed.
//   Set facility_fr_code at creation so the second call's path segment is harmless.
// - entity_type is exactly claim, preauth or authorization; environment production or sandbox.
// - auth_type none is the only self-service option; it fits an endpoint protected by "a secret
//   path rather than a header". Every other auth_type needs a secret_ref arranged with DHA.
// - The payload: subject_guid, from_state, to_state, entity_type, timestamp, facility_fr_code are
//   always present; provider_claim_no, tenant_code, consent_token, notes, authorization_reason are
//   conditional and may be empty strings.
// - Acknowledge with any 2xx once durably accepted; process afterwards. Retries mean duplicates:
//   the same event is subject_guid + to_state. No ordering guarantee: if from_state does not match
//   what you hold, re-read the entity rather than applying the change.
// - The state vocabularies differ per entity type, so never read to_state without entity_type.
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { requestKenyaHie } from './afyalink';
import { KenyaHieRequestError } from './hie-visit';

export const KenyaHieCallbackEntityTypes = ['claim', 'preauth', 'authorization'] as const;
export type KenyaHieCallbackEntityType = (typeof KenyaHieCallbackEntityTypes)[number];

export interface KenyaHieCallback {
  readonly subjectGuid: string;
  readonly fromState: string;
  readonly toState: string;
  readonly entityType: KenyaHieCallbackEntityType;
  readonly timestamp: string;
  readonly facilityFrCode: string;
  readonly providerClaimNo?: string;
  readonly tenantCode?: string;
  readonly consentToken?: string;
  readonly notes?: string;
  readonly authorizationReason?: string;
}

export interface KenyaHieCallbackRegistration {
  readonly entityType: KenyaHieCallbackEntityType;
  readonly endpointId: string | null;
  readonly operationId: string | null;
  /** The URL DHA will POST to: base_url + path. */
  readonly url: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/**
 * The same event, for de-duplication (DHA: subject_guid + to_state).
 * @param callback - The callback.
 * @returns The event key.
 */
export function getKenyaHieCallbackEventKey(callback: KenyaHieCallback): string {
  return `${callback.entityType}:${callback.subjectGuid}:${callback.toState}`;
}

/**
 * Reads a DHA status callback payload. Conditional fields are optional and empty strings count as
 * absent, as DHA says.
 * @param body - The posted JSON.
 * @returns The callback.
 */
export function parseKenyaHieCallback(body: unknown): KenyaHieCallback {
  if (!isRecord(body)) {
    throw new Error('The callback body must be a JSON object');
  }
  const requiredFields = ['subject_guid', 'from_state', 'to_state', 'entity_type', 'timestamp', 'facility_fr_code'];
  const missing = requiredFields.filter((f) => !text(body[f]));
  if (missing.length) {
    throw new Error(`The callback is missing ${missing.join(', ')}`);
  }
  const entityType = (body.entity_type as string).trim();
  if (!(KenyaHieCallbackEntityTypes as readonly string[]).includes(entityType)) {
    throw new Error('entity_type must be claim, preauth or authorization');
  }
  const optional: Record<string, string | undefined> = {
    providerClaimNo: text(body.provider_claim_no),
    tenantCode: text(body.tenant_code),
    consentToken: text(body.consent_token),
    notes: text(body.notes),
    authorizationReason: text(body.authorization_reason),
  };
  return {
    subjectGuid: (body.subject_guid as string).trim(),
    fromState: (body.from_state as string).trim(),
    toState: (body.to_state as string).trim(),
    entityType: entityType as KenyaHieCallbackEntityType,
    timestamp: (body.timestamp as string).trim(),
    facilityFrCode: (body.facility_fr_code as string).trim(),
    ...Object.fromEntries(Object.entries(optional).filter(([, v]) => v !== undefined)),
  };
}

/**
 * Registers our status-changed endpoint with DHA for each entity type: the endpoint, then its
 * status_changed operation. auth_type none: the receiving URL carries a secret path.
 * @param credentials - The HIE credentials (the client ID is the tenant code).
 * @param input - Where DHA should post, and for which facility.
 * @param input.baseUrl - Our receiving base URL, including the secret path.
 * @param input.facilityFrCode - The facility's FR code.
 * @param input.environment - sandbox (UAT) or production.
 * @param input.entityTypes - Which entity types to register; all three by default.
 * @returns The registrations.
 */
export async function registerKenyaHieCallbacks(
  credentials: KenyaAfyaLinkCredentials,
  input: {
    readonly baseUrl: string;
    readonly facilityFrCode: string;
    readonly environment: 'sandbox' | 'production';
    readonly entityTypes?: readonly KenyaHieCallbackEntityType[];
  }
): Promise<KenyaHieCallbackRegistration[]> {
  const baseUrl = input.baseUrl.replace(/\/+$/, '');
  if (!baseUrl.startsWith("https://")) {
    throw new Error('The callback base URL must be an absolute https URL');
  }
  const facility = input.facilityFrCode?.trim();
  if (!facility || !/^FID-[\w-]+$/i.test(facility)) {
    throw new Error("The facility's FR code (FID-...) is required to register callbacks");
  }
  const tenant = encodeURIComponent(credentials.clientId);
  const registrations: KenyaHieCallbackRegistration[] = [];
  for (const entityType of input.entityTypes ?? KenyaHieCallbackEntityTypes) {
    const endpoint = await requestKenyaHie(credentials, 'POST', `/tenants/${tenant}/endpoints`, {
      body: {
        name: `Afiax ${entityType} status`,
        entity_type: entityType,
        base_url: baseUrl,
        auth_type: 'none',
        environment: input.environment,
        tenant_code: credentials.clientId,
        facility_fr_code: facility,
      },
    });
    if (!endpoint.ok || !isRecord(endpoint.body)) {
      throw new KenyaHieRequestError(`register ${entityType} callback endpoint`, endpoint);
    }
    const endpointId = text(endpoint.body.endpoint_id) ?? null;
    if (!endpointId) {
      throw new Error(`DHA did not return an endpoint_id for the ${entityType} callback endpoint`);
    }
    const path = `/${entityType}-status`;
    const operation = await requestKenyaHie(
      credentials,
      'POST',
      `/tenants/${encodeURIComponent(facility)}/endpoints/${encodeURIComponent(endpointId)}/operations`,
      { body: { name: `Afiax ${entityType} status changed`, action: 'status_changed', method: 'POST', path } }
    );
    if (!operation.ok || !isRecord(operation.body)) {
      throw new KenyaHieRequestError(`register ${entityType} callback operation`, operation);
    }
    registrations.push({
      entityType,
      endpointId,
      operationId: text(operation.body.operation_id) ?? null,
      url: `${baseUrl}${path}`,
    });
  }
  return registrations;
}

/**
 * Lists the facility's active callback endpoints at DHA (GET /tenants/{FR code}/endpoints; the
 * path resolves a tenant ID or a facility FR code, not a tenant code).
 * @param credentials - The HIE credentials.
 * @param facilityFrCode - The facility's FR code.
 * @returns DHA's endpoint records, with their operations.
 */
export async function listKenyaHieCallbacks(
  credentials: KenyaAfyaLinkCredentials,
  facilityFrCode: string
): Promise<unknown> {
  const facility = facilityFrCode?.trim();
  if (!facility) {
    throw new Error("The facility's FR code is required");
  }
  const result = await requestKenyaHie(credentials, 'GET', `/tenants/${encodeURIComponent(facility)}/endpoints`);
  if (!result.ok) {
    throw new KenyaHieRequestError('list callback endpoints', result);
  }
  return result.body;
}
