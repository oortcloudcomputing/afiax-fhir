// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

export interface ErpnextConfig {
  readonly baseUrl?: string;
  readonly authHeader?: string;
  readonly redirectUrl?: string;
  readonly leadSource: string;
  readonly leadStatus?: string;
}

interface FrappeResponse<T> {
  readonly data?: T;
  readonly message?: T;
  readonly exc?: string;
  readonly exc_type?: string;
  readonly _server_messages?: string;
}

export function getErpnextConfig(): ErpnextConfig {
  const explicitHeader = process.env.ERPNEXT_AUTHORIZATION_HEADER?.trim();
  const apiKey = process.env.ERPNEXT_API_KEY?.trim();
  const apiSecret = process.env.ERPNEXT_API_SECRET?.trim();

  return {
    baseUrl: process.env.ERPNEXT_API_BASE_URL?.trim().replace(/\/$/, ''),
    authHeader: explicitHeader || (apiKey && apiSecret ? `token ${apiKey}:${apiSecret}` : undefined),
    redirectUrl: process.env.ERPNEXT_SIGNUP_URL?.trim() || process.env.NEXT_PUBLIC_ERPNEXT_SIGNUP_URL?.trim(),
    leadSource: process.env.ERPNEXT_LEAD_SOURCE?.trim() || 'Website',
    leadStatus: process.env.ERPNEXT_LEAD_STATUS?.trim(),
  };
}

export function getErpnextMissingEnv(config: ErpnextConfig): string[] {
  const missing: string[] = [];

  if (!config.baseUrl) {
    missing.push('ERPNEXT_API_BASE_URL');
  }

  if (!config.authHeader) {
    missing.push('ERPNEXT_AUTHORIZATION_HEADER or ERPNEXT_API_KEY + ERPNEXT_API_SECRET');
  }

  return missing;
}

function getDefaultHeaders(config: ErpnextConfig): HeadersInit {
  return {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: config.authHeader as string,
  };
}

export async function postErpnextResource<T>(
  config: ErpnextConfig,
  doctype: string,
  payload: Record<string, unknown>
): Promise<FrappeResponse<T>> {
  const response = await fetch(`${config.baseUrl}/api/resource/${encodeURIComponent(doctype)}`, {
    method: 'POST',
    headers: getDefaultHeaders(config),
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  return parseFrappeResponse<T>(response);
}

export function getErpnextLeadUrl(config: ErpnextConfig, leadName: string): string | undefined {
  if (!config.baseUrl || !leadName) {
    return undefined;
  }

  return `${config.baseUrl}/app/lead/${encodeURIComponent(leadName)}`;
}

async function parseFrappeResponse<T>(response: Response): Promise<FrappeResponse<T>> {
  const text = await response.text();

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    if (!response.ok) {
      throw new Error(`ERPNext returned status ${response.status}: ${text}`);
    }

    return { message: text as T };
  }

  if (!response.ok) {
    throw new Error(getFrappeErrorMessage(payload, `ERPNext returned status ${response.status}.`));
  }

  return payload as FrappeResponse<T>;
}

function getFrappeErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== 'object') {
    return fallback;
  }

  const response = payload as Record<string, unknown>;
  if (typeof response.message === 'string' && response.message.trim()) {
    return response.message;
  }

  if (typeof response.exc_type === 'string' && response.exc_type.trim()) {
    return response.exc_type;
  }

  if (typeof response._server_messages === 'string' && response._server_messages.trim()) {
    return response._server_messages;
  }

  return fallback;
}
