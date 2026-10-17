// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Field-level encryption of stored FHIR resource bodies (envelope encryption with Vault Transit).
 *
 * The JSON body of each resource of a configured type is encrypted with AES-256-GCM before it is
 * written to the resource table, the history table and the Redis cache. The data encryption key
 * (DEK) comes from Vault Transit (`datakey/plaintext/<key>`); only its Vault-wrapped form is stored,
 * inside every encrypted value, so any server instance can decrypt by asking Vault to unwrap it.
 * Unwrapped DEKs are cached in memory and the active DEK is rotated periodically.
 *
 * Stored format: `enc:v1:<b64url wrapped DEK>:<b64url resource ref>:<b64url iv>.<b64url ciphertext>.<b64url tag>`
 * The resource ref (`ResourceType/id`) is authenticated as AAD and checked after decryption, so an
 * encrypted body cannot be moved to another row undetected. Values without the prefix are plaintext
 * (written before encryption was enabled, or of a type that is not encrypted) and are read as-is.
 *
 * Search index columns (names, identifiers, dates, codes) are not encrypted: they are needed to
 * evaluate FHIR searches in PostgreSQL. They are protected by volume encryption at rest.
 */

import fetch from 'node-fetch';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { MedplumFieldEncryptionConfig } from '../config/types';
import { getLogger } from '../logger';

const PREFIX = 'enc:v1:';
const LOCAL_WRAPPED_KEY = 'local';
const KUBERNETES_TOKEN_PATH = '/var/run/secrets/kubernetes.io/serviceaccount/token';

/** Resource types encrypted when `fieldEncryption.resourceTypes` is not set: clinical, identity and payment data. */
export const DefaultEncryptedResourceTypes: readonly string[] = [
  'AllergyIntolerance',
  'CarePlan',
  'Claim',
  'ClaimResponse',
  'ClinicalImpression',
  'Communication',
  'Composition',
  'Condition',
  'Consent',
  'Coverage',
  'DetectedIssue',
  'DiagnosticReport',
  'DocumentReference',
  'Encounter',
  'EpisodeOfCare',
  'ExplanationOfBenefit',
  'FamilyMemberHistory',
  'Flag',
  'ImagingStudy',
  'Immunization',
  'MedicationAdministration',
  'MedicationDispense',
  'MedicationRequest',
  'MedicationStatement',
  'Observation',
  'Patient',
  'PaymentNotice',
  'Procedure',
  'QuestionnaireResponse',
  'RelatedPerson',
  'RiskAssessment',
  'ServiceRequest',
  'Specimen',
];

interface DataKey {
  readonly plaintext: Buffer;
  readonly wrapped: string;
}

interface EncryptionState {
  config: MedplumFieldEncryptionConfig;
  resourceTypes: Set<string>;
  active: DataKey;
  unwrapped: Map<string, Buffer>;
  vaultToken?: string;
  rotationTimer?: NodeJS.Timeout;
}

let state: EncryptionState | undefined;

/**
 * Initialises field-level encryption. Called once at server startup when `fieldEncryption.enabled` is set.
 * @param config - The field encryption configuration.
 */
export async function initFieldEncryption(config: MedplumFieldEncryptionConfig): Promise<void> {
  await shutdownFieldEncryption();
  if (!config.enabled) {
    return;
  }
  if (!config.vault && !config.localKey) {
    throw new Error('fieldEncryption requires either vault or localKey');
  }

  const newState: EncryptionState = {
    config,
    resourceTypes: new Set(config.resourceTypes ?? DefaultEncryptedResourceTypes),
    active: { plaintext: Buffer.alloc(0), wrapped: '' },
    unwrapped: new Map(),
  };
  state = newState;
  newState.active = await generateDataKey(newState);

  const rotationHours = config.rotationHours ?? 24;
  if (config.vault && rotationHours > 0) {
    newState.rotationTimer = setInterval(() => {
      generateDataKey(newState)
        .then((key) => {
          newState.active = key;
        })
        .catch((err) => getLogger().error('Field encryption key rotation failed', err as Error));
    }, rotationHours * 3_600_000);
    newState.rotationTimer.unref();
  }
  getLogger().info('Field-level encryption enabled', {
    mode: config.vault ? 'vault-transit' : 'local',
    resourceTypes: newState.resourceTypes.size,
  });
}

/** Stops key rotation and drops all key material from memory. */
export async function shutdownFieldEncryption(): Promise<void> {
  if (state?.rotationTimer) {
    clearInterval(state.rotationTimer);
  }
  state?.unwrapped.forEach((key) => key.fill(0));
  state?.active.plaintext.fill(0);
  state = undefined;
}

/**
 * Returns true if resources of this type are encrypted at rest.
 * @param resourceType - The FHIR resource type.
 * @returns True if the type is encrypted.
 */
export function isEncryptedResourceType(resourceType: string): boolean {
  return !!state?.resourceTypes.has(resourceType);
}

/**
 * Encrypts a serialised resource body for storage, if its type is configured for encryption.
 * @param resourceType - The FHIR resource type.
 * @param id - The resource id.
 * @param content - The serialised resource JSON.
 * @returns The value to store: encrypted, or the original content if the type is not encrypted.
 */
export function encryptStoredContent(resourceType: string, id: string | undefined, content: string): string {
  if (!state || !id || !state.resourceTypes.has(resourceType)) {
    return content;
  }
  const ref = `${resourceType}/${id}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', state.active.plaintext, iv);
  cipher.setAAD(Buffer.from(ref));
  const ciphertext = Buffer.concat([cipher.update(content, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [b64(state.active.wrapped), b64(ref), [b64(iv), b64(ciphertext), b64(tag)].join('.')].join(':');
}

/**
 * Returns true if a stored value is encrypted.
 * @param stored - The stored value.
 * @returns True if the value has the encryption prefix.
 */
export function isEncryptedContent(stored: string | undefined): boolean {
  return !!stored?.startsWith(PREFIX);
}

/**
 * Decrypts a stored value. Plaintext values are returned unchanged.
 * @param stored - The stored value.
 * @returns The serialised JSON.
 */
export async function decryptStoredContent(stored: string): Promise<string> {
  if (!stored.startsWith(PREFIX)) {
    return stored;
  }
  const parts = stored.slice(PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted content');
  }
  const wrapped = unb64(parts[0]).toString('utf8');
  const ref = unb64(parts[1]).toString('utf8');
  const [iv, ciphertext, tag] = parts[2].split('.').map(unb64);
  if (!iv || !ciphertext || !tag) {
    throw new Error('Malformed encrypted content');
  }

  const key = await getDataKey(wrapped);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(Buffer.from(ref));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/**
 * Parses a stored resource body, decrypting it first if needed, and checks that an encrypted body
 * belongs to the resource it is stored under.
 * @param stored - The stored value.
 * @returns The parsed resource.
 */
export async function parseStoredResource<T>(stored: string): Promise<T> {
  const encrypted = isEncryptedContent(stored);
  const resource = JSON.parse(await decryptStoredContent(stored)) as T & { resourceType?: string; id?: string };
  if (encrypted) {
    const claimed = unb64(stored.slice(PREFIX.length).split(':')[1]).toString('utf8');
    if (claimed !== `${resource.resourceType}/${resource.id}`) {
      throw new Error('Encrypted content does not match its resource reference');
    }
  }
  return resource;
}

async function getDataKey(wrapped: string): Promise<Buffer> {
  const current = state;
  if (!current) {
    throw new Error('Encrypted content found but field encryption is not enabled');
  }
  if (wrapped === current.active.wrapped) {
    return current.active.plaintext;
  }
  const cached = current.unwrapped.get(wrapped);
  if (cached) {
    return cached;
  }
  if (wrapped === LOCAL_WRAPPED_KEY) {
    throw new Error('Content was encrypted with a local key that is not configured');
  }
  const response = await vaultRequest<{ plaintext: string }>(current, `decrypt/${keyName(current)}`, {
    ciphertext: wrapped,
  });
  const key = Buffer.from(response.plaintext, 'base64');
  current.unwrapped.set(wrapped, key);
  return key;
}

async function generateDataKey(current: EncryptionState): Promise<DataKey> {
  if (!current.config.vault) {
    const plaintext = Buffer.from(current.config.localKey ?? '', 'base64');
    if (plaintext.length !== 32) {
      throw new Error('fieldEncryption.localKey must be 32 bytes, base64 encoded');
    }
    return { plaintext, wrapped: LOCAL_WRAPPED_KEY };
  }
  const response = await vaultRequest<{ plaintext: string; ciphertext: string }>(
    current,
    `datakey/plaintext/${keyName(current)}`,
    { bits: 256 }
  );
  const key = { plaintext: Buffer.from(response.plaintext, 'base64'), wrapped: response.ciphertext };
  current.unwrapped.set(key.wrapped, key.plaintext);
  return key;
}

function keyName(current: EncryptionState): string {
  return current.config.vault?.keyName ?? 'afiax-fhir';
}

async function vaultRequest<T>(current: EncryptionState, path: string, body: object, retry = true): Promise<T> {
  const vault = current.config.vault;
  if (!vault) {
    throw new Error('Vault is not configured for field encryption');
  }
  const token = await getVaultToken(current);
  const url = `${vault.address.replace(/\/+$/, '')}/v1/${vault.transitMount ?? 'transit'}/${path}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'X-Vault-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (response.status === 403 && retry && !vault.token) {
    current.vaultToken = undefined;
    return vaultRequest(current, path, body, false);
  }
  if (!response.ok) {
    throw new Error(`Vault Transit ${path.split('/')[0]} failed (${response.status})`);
  }
  const json = (await response.json()) as { data?: T };
  if (!json.data) {
    throw new Error(`Vault Transit ${path.split('/')[0]} returned no data`);
  }
  return json.data;
}

async function getVaultToken(current: EncryptionState): Promise<string> {
  const vault = current.config.vault;
  if (vault?.token) {
    return vault.token;
  }
  if (current.vaultToken) {
    return current.vaultToken;
  }
  if (!vault?.kubernetesRole) {
    throw new Error('fieldEncryption.vault requires token or kubernetesRole');
  }
  const jwt = (await readFile(vault.kubernetesTokenPath ?? KUBERNETES_TOKEN_PATH, 'utf8')).trim();
  const response = await fetch(
    `${vault.address.replace(/\/+$/, '')}/v1/auth/${vault.kubernetesAuthMount ?? 'kubernetes'}/login`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: vault.kubernetesRole, jwt }),
    }
  );
  if (!response.ok) {
    throw new Error(`Vault Kubernetes login failed (${response.status})`);
  }
  const json = (await response.json()) as { auth?: { client_token?: string } };
  const token = json.auth?.client_token;
  if (!token) {
    throw new Error('Vault Kubernetes login returned no token');
  }
  current.vaultToken = token;
  return token;
}

function b64(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

function unb64(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
