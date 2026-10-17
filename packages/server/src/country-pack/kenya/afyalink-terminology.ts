// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import type { KenyaAfyaLinkCredentials } from './afyalink';
import { getAfyaLinkToken } from './afyalink';

export interface AfyaLinkTerminologyResponse<T> {
  readonly status?: string;
  readonly message?: string;
  readonly data?: T;
  readonly raw: unknown;
}

export interface ShaInterventionData {
  readonly code: string | null;
  readonly description: string | null;
  readonly packageCode: string | null;
  readonly packageName: string | null;
  readonly tariffKes: number | null;
  readonly requiresPreauth: boolean;
  readonly combinationRule: string | null;
  readonly category: string | null;
}

export interface Icd11Data {
  readonly code: string | null;
  readonly title: string | null;
  readonly definition: string | null;
  readonly parentCodes: readonly string[];
  readonly system: 'http://id.who.int/icd/release/11/mms';
}

export interface LoincData {
  readonly code: string | null;
  readonly display: string | null;
  readonly component: string | null;
  readonly property: string | null;
  readonly timeAspect: string | null;
  readonly system: string | null;
  readonly scaleType: string | null;
  readonly longCommonName: string | null;
  readonly status: string | null;
}

export interface IchiData {
  readonly code: string | null;
  readonly title: string | null;
  readonly definition: string | null;
  readonly targetEntity: string | null;
  readonly system: 'https://mitel.dimi.uniud.it/ichi/#';
}

export interface ProductData {
  readonly code: string | null;
  readonly productName: string | null;
  readonly genericName: string | null;
  readonly dosageForm: string | null;
  readonly strength: string | null;
  readonly manufacturer: string | null;
  readonly priceKes: number | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function afyaLinkTerminologyGet(
  credentials: KenyaAfyaLinkCredentials,
  path: string,
  params: Record<string, string>
): Promise<unknown> {
  const token = await getAfyaLinkToken(credentials);
  const url = `${credentials.baseUrl}${path}?${new URLSearchParams(params)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  const body = await response.text();

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`AfyaLink terminology lookup failed (${response.status}): ${body}`);
  }

  return tryParseJson(body);
}

function normalizePreauthField(payload: Record<string, unknown>): boolean {
  // Check multiple possible field names for pre-authorization requirement
  const candidates = [payload.requires_preauth, payload.preauth_required, payload.pre_auth];
  for (const val of candidates) {
    if (typeof val === 'boolean') {
      return val;
    }
    if (typeof val === 'string') {
      const normalized = val.trim().toLowerCase();
      if (normalized === 'true' || normalized === 'yes' || normalized === '1') {
        return true;
      }
      if (normalized === 'false' || normalized === 'no' || normalized === '0') {
        return false;
      }
    }
    if (typeof val === 'number') {
      return val !== 0;
    }
  }
  return false;
}

function normalizeCombinationRule(payload: Record<string, unknown>): string | null {
  if (typeof payload.combination_rule === 'string' && payload.combination_rule.trim()) {
    return payload.combination_rule.trim();
  }
  // alone_only: true is semantically equivalent to combinationRule = 'ALONE'
  if (payload.alone_only === true || payload.alone_only === 'true') {
    return 'ALONE';
  }
  return null;
}

function normalizeTariff(val: unknown): number | null {
  if (typeof val === 'number') {
    return val;
  }
  if (typeof val === 'string') {
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeParentCodes(val: unknown): readonly string[] {
  if (Array.isArray(val)) {
    return val.filter((v): v is string => typeof v === 'string');
  }
  if (typeof val === 'string' && val.trim()) {
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * Returns the first of `keys` whose value in `payload` is a string.
 * @param payload - The response object.
 * @param keys - Field names to try, in order of preference.
 * @returns The first string value, or null when none is a string.
 */
function firstString(payload: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === 'string') {
      return value;
    }
  }
  return null;
}

export async function lookupShaIntervention(
  credentials: KenyaAfyaLinkCredentials,
  code: string
): Promise<AfyaLinkTerminologyResponse<ShaInterventionData>> {
  const raw = await afyaLinkTerminologyGet(credentials, '/terminology/v1/sha-intervention', { code });

  if (raw === null) {
    return { message: 'Not found', data: undefined, raw: null };
  }

  if (!isRecord(raw)) {
    return { data: undefined, raw };
  }

  const status = typeof raw.status === 'string' ? raw.status : undefined;
  const message = typeof raw.message === 'string' ? raw.message : undefined;

  // Prefer nested data field (new format), fall back to root-level fields (legacy)
  const payload = isRecord(raw.data) ? raw.data : raw;

  const data: ShaInterventionData = {
    code: typeof payload.code === 'string' ? payload.code : null,
    description: typeof payload.description === 'string' ? payload.description : null,
    packageCode: firstString(payload, 'packageCode', 'package_code'),
    packageName: firstString(payload, 'packageName', 'package_name'),
    tariffKes: normalizeTariff(payload.tariffKes ?? payload.tariff_kes ?? payload.tariff),
    requiresPreauth: normalizePreauthField(payload),
    combinationRule: normalizeCombinationRule(payload),
    category: typeof payload.category === 'string' ? payload.category : null,
  };

  return { status, message, data, raw };
}

export async function lookupIcd11Code(
  credentials: KenyaAfyaLinkCredentials,
  code: string
): Promise<AfyaLinkTerminologyResponse<Icd11Data>> {
  const raw = await afyaLinkTerminologyGet(credentials, '/terminology/v1/icd11', { code });

  if (raw === null) {
    return { message: 'Not found', data: undefined, raw: null };
  }

  if (!isRecord(raw)) {
    return { data: undefined, raw };
  }

  const status = typeof raw.status === 'string' ? raw.status : undefined;
  const message = typeof raw.message === 'string' ? raw.message : undefined;

  const payload = isRecord(raw.data) ? raw.data : raw;

  const data: Icd11Data = {
    code: typeof payload.code === 'string' ? payload.code : null,
    title: firstString(payload, 'title', 'display'),
    definition: typeof payload.definition === 'string' ? payload.definition : null,
    parentCodes: normalizeParentCodes(payload.parentCodes ?? payload.parent_codes),
    system: 'http://id.who.int/icd/release/11/mms',
  };

  return { status, message, data, raw };
}

export async function lookupLoincCode(
  credentials: KenyaAfyaLinkCredentials,
  code: string
): Promise<AfyaLinkTerminologyResponse<LoincData>> {
  const raw = await afyaLinkTerminologyGet(credentials, '/terminology/v1/loinc', { code });

  if (raw === null) {
    return { message: 'Not found', data: undefined, raw: null };
  }

  if (!isRecord(raw)) {
    return { data: undefined, raw };
  }

  const status = typeof raw.status === 'string' ? raw.status : undefined;
  const message = typeof raw.message === 'string' ? raw.message : undefined;

  const payload = isRecord(raw.data) ? raw.data : raw;

  // LOINC APIs may use ALL_CAPS field names (LOINC database column names) or camelCase
  const data: LoincData = {
    code: firstString(payload, 'code', 'LOINC_NUM'),
    display: firstString(payload, 'display', 'LONG_COMMON_NAME'),
    component: firstString(payload, 'component', 'COMPONENT'),
    property: firstString(payload, 'property', 'PROPERTY'),
    timeAspect: firstString(payload, 'timeAspect', 'TIME_ASPCT'),
    system: firstString(payload, 'system', 'SYSTEM'),
    scaleType: firstString(payload, 'scaleType', 'SCALE_TYP'),
    longCommonName: firstString(payload, 'longCommonName', 'LONG_COMMON_NAME'),
    status: firstString(payload, 'status', 'STATUS'),
  };

  return { status, message, data, raw };
}

export async function lookupIchiCode(
  credentials: KenyaAfyaLinkCredentials,
  code: string
): Promise<AfyaLinkTerminologyResponse<IchiData>> {
  const raw = await afyaLinkTerminologyGet(credentials, '/terminology/v1/ichi', { code });

  if (raw === null) {
    return { message: 'Not found', data: undefined, raw: null };
  }

  if (!isRecord(raw)) {
    return { data: undefined, raw };
  }

  const status = typeof raw.status === 'string' ? raw.status : undefined;
  const message = typeof raw.message === 'string' ? raw.message : undefined;

  const payload = isRecord(raw.data) ? raw.data : raw;

  const data: IchiData = {
    code: typeof payload.code === 'string' ? payload.code : null,
    title: typeof payload.title === 'string' ? payload.title : null,
    definition: typeof payload.definition === 'string' ? payload.definition : null,
    targetEntity: firstString(payload, 'targetEntity', 'target_entity'),
    system: 'https://mitel.dimi.uniud.it/ichi/#',
  };

  return { status, message, data, raw };
}

export async function lookupProductCode(
  credentials: KenyaAfyaLinkCredentials,
  code: string
): Promise<AfyaLinkTerminologyResponse<ProductData>> {
  const raw = await afyaLinkTerminologyGet(credentials, '/terminology/v1/product', { code });

  if (raw === null) {
    return { message: 'Not found', data: undefined, raw: null };
  }

  if (!isRecord(raw)) {
    return { data: undefined, raw };
  }

  const status = typeof raw.status === 'string' ? raw.status : undefined;
  const message = typeof raw.message === 'string' ? raw.message : undefined;

  const payload = isRecord(raw.data) ? raw.data : raw;

  const data: ProductData = {
    code: typeof payload.code === 'string' ? payload.code : null,
    productName: firstString(payload, 'productName', 'product_name'),
    genericName: firstString(payload, 'genericName', 'generic_name'),
    dosageForm: firstString(payload, 'dosageForm', 'dosage_form'),
    strength: typeof payload.strength === 'string' ? payload.strength : null,
    manufacturer: typeof payload.manufacturer === 'string' ? payload.manufacturer : null,
    priceKes: normalizeTariff(payload.priceKes ?? payload.price_kes ?? payload.price),
  };

  return { status, message, data, raw };
}
