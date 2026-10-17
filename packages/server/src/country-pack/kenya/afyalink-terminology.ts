// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import fetch from 'node-fetch';
import { getAfyaLinkToken, type KenyaAfyaLinkCredentials } from './afyalink';

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
    return val.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
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
    packageCode: typeof payload.packageCode === 'string' ? payload.packageCode
      : typeof payload.package_code === 'string' ? payload.package_code : null,
    packageName: typeof payload.packageName === 'string' ? payload.packageName
      : typeof payload.package_name === 'string' ? payload.package_name : null,
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
    title: typeof payload.title === 'string' ? payload.title
      : typeof payload.display === 'string' ? payload.display : null,
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
    code: typeof payload.code === 'string' ? payload.code
      : typeof payload.LOINC_NUM === 'string' ? payload.LOINC_NUM : null,
    display: typeof payload.display === 'string' ? payload.display
      : typeof payload.LONG_COMMON_NAME === 'string' ? payload.LONG_COMMON_NAME : null,
    component: typeof payload.component === 'string' ? payload.component
      : typeof payload.COMPONENT === 'string' ? payload.COMPONENT : null,
    property: typeof payload.property === 'string' ? payload.property
      : typeof payload.PROPERTY === 'string' ? payload.PROPERTY : null,
    timeAspect: typeof payload.timeAspect === 'string' ? payload.timeAspect
      : typeof payload.TIME_ASPCT === 'string' ? payload.TIME_ASPCT : null,
    system: typeof payload.system === 'string' ? payload.system
      : typeof payload.SYSTEM === 'string' ? payload.SYSTEM : null,
    scaleType: typeof payload.scaleType === 'string' ? payload.scaleType
      : typeof payload.SCALE_TYP === 'string' ? payload.SCALE_TYP : null,
    longCommonName: typeof payload.longCommonName === 'string' ? payload.longCommonName
      : typeof payload.LONG_COMMON_NAME === 'string' ? payload.LONG_COMMON_NAME : null,
    status: typeof payload.status === 'string' ? payload.status
      : typeof payload.STATUS === 'string' ? payload.STATUS : null,
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
    targetEntity: typeof payload.targetEntity === 'string' ? payload.targetEntity
      : typeof payload.target_entity === 'string' ? payload.target_entity : null,
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
    productName: typeof payload.productName === 'string' ? payload.productName
      : typeof payload.product_name === 'string' ? payload.product_name : null,
    genericName: typeof payload.genericName === 'string' ? payload.genericName
      : typeof payload.generic_name === 'string' ? payload.generic_name : null,
    dosageForm: typeof payload.dosageForm === 'string' ? payload.dosageForm
      : typeof payload.dosage_form === 'string' ? payload.dosage_form : null,
    strength: typeof payload.strength === 'string' ? payload.strength : null,
    manufacturer: typeof payload.manufacturer === 'string' ? payload.manufacturer : null,
    priceKes: normalizeTariff(payload.priceKes ?? payload.price_kes ?? payload.price),
  };

  return { status, message, data, raw };
}
