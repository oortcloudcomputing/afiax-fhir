// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaAfiaxPaySecretNames, normalizeErrorString } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import fetch from 'node-fetch';

export interface KenyaAfiaxPayCredentials {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly secretKey: string;
  readonly callbackUrl: string;
}

export interface AfiaxPayRequestResult {
  readonly paymentRequestId: string;
  readonly paymentUrl?: string;
  readonly status: string;
}

export interface AfiaxPayCallbackPayload {
  readonly paymentRequestId: string;
  readonly status: 'success' | 'failed' | 'cancelled';
  readonly amount?: number;
  readonly currency?: string;
  readonly transactionRef?: string;
  readonly paidAt?: string;
  readonly failureReason?: string;
}

function getProjectSystemSecret(project: Project, name: string): string | undefined {
  return project.systemSecret?.find((entry) => entry.name === name)?.valueString?.trim() || undefined;
}

function requireSystemSecret(project: Project, name: string): string {
  const value = getProjectSystemSecret(project, name);
  if (!value) {
    throw new Error(`Missing required Afiax-managed Afiax Pay secret: ${name}`);
  }
  return value;
}

export function hasKenyaAfiaxPayCredentials(project: Project): boolean {
  return !!(
    getProjectSystemSecret(project, KenyaAfiaxPaySecretNames.baseUrl) &&
    getProjectSystemSecret(project, KenyaAfiaxPaySecretNames.apiKey) &&
    getProjectSystemSecret(project, KenyaAfiaxPaySecretNames.secretKey)
  );
}

export function getKenyaAfiaxPayCredentials(project: Project, baseUrl: string, projectId: string): KenyaAfiaxPayCredentials {
  return {
    baseUrl: requireSystemSecret(project, KenyaAfiaxPaySecretNames.baseUrl).replace(/\/+$/, ''),
    apiKey: requireSystemSecret(project, KenyaAfiaxPaySecretNames.apiKey),
    secretKey: requireSystemSecret(project, KenyaAfiaxPaySecretNames.secretKey),
    callbackUrl: `${baseUrl}/kenya/afiax-pay-callback/${projectId}`,
  };
}

export async function initiateAfiaxPayRequest(
  credentials: KenyaAfiaxPayCredentials,
  input: {
    amount: number;
    currency: string;
    reference: string;
    description: string;
    customerPhone?: string;
    customerEmail?: string;
  }
): Promise<AfiaxPayRequestResult> {
  const body = {
    amount: input.amount,
    currency: input.currency,
    reference: input.reference,
    description: input.description,
    callback_url: credentials.callbackUrl,
    customer_phone: input.customerPhone,
    customer_email: input.customerEmail,
  };

  const response = await fetch(`${credentials.baseUrl}/api/v1/payment-requests`, {
    method: 'POST',
    headers: {
      'X-API-Key': credentials.apiKey,
      'X-API-Secret': credentials.secretKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Afiax Pay payment request failed (${response.status}): ${text}`);
  }

  const data = JSON.parse(text) as {
    payment_request_id?: string;
    payment_url?: string;
    status?: string;
  };

  if (!data.payment_request_id) {
    throw new Error(`Afiax Pay response missing payment_request_id: ${text}`);
  }

  return {
    paymentRequestId: data.payment_request_id,
    paymentUrl: data.payment_url,
    status: data.status ?? 'pending',
  };
}

export function parseAfiaxPayCallback(body: unknown): AfiaxPayCallbackPayload | null {
  try {
    const b = body as Record<string, unknown>;
    const paymentRequestId = b?.payment_request_id as string | undefined;
    if (!paymentRequestId) {
      return null;
    }
    return {
      paymentRequestId,
      status: (b?.status as AfiaxPayCallbackPayload['status']) ?? 'failed',
      amount: b?.amount as number | undefined,
      currency: b?.currency as string | undefined,
      transactionRef: b?.transaction_ref as string | undefined,
      paidAt: b?.paid_at as string | undefined,
      failureReason: b?.failure_reason as string | undefined,
    };
  } catch {
    return null;
  }
}

export function normalizeAfiaxPayError(err: unknown): string {
  return `Afiax Pay request failed: ${normalizeErrorString(err)}`;
}
