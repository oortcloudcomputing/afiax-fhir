// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaMpesaSecretNames, normalizeErrorString } from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import fetch from 'node-fetch';

export interface KenyaMpesaCredentials {
  readonly consumerKey: string;
  readonly consumerSecret: string;
  readonly shortCode: string;
  readonly passkey: string;
  readonly callbackUrl: string;
}

export interface MpesaStkPushResult {
  readonly checkoutRequestId: string;
  readonly merchantRequestId: string;
  readonly responseCode: string;
  readonly responseDescription: string;
  readonly customerMessage: string;
}

export interface MpesaCallbackPayload {
  readonly checkoutRequestId: string;
  readonly resultCode: number;
  readonly resultDesc: string;
  readonly mpesaReceiptNumber?: string;
  readonly transactionDate?: string;
  readonly phoneNumber?: string;
  readonly amount?: number;
}

const MpesaDarajaBaseUrl = 'https://api.safaricom.co.ke';

function getProjectSystemSecret(project: Project, name: string): string | undefined {
  return project.systemSecret?.find((entry) => entry.name === name)?.valueString?.trim() || undefined;
}

function requireSystemSecret(project: Project, name: string): string {
  const value = getProjectSystemSecret(project, name);
  if (!value) {
    throw new Error(`Missing required Afiax-managed M-Pesa secret: ${name}`);
  }
  return value;
}

export function hasKenyaMpesaCredentials(project: Project): boolean {
  return !!(
    getProjectSystemSecret(project, KenyaMpesaSecretNames.consumerKey) &&
    getProjectSystemSecret(project, KenyaMpesaSecretNames.consumerSecret) &&
    getProjectSystemSecret(project, KenyaMpesaSecretNames.shortCode) &&
    getProjectSystemSecret(project, KenyaMpesaSecretNames.passkey)
  );
}

export function getKenyaMpesaCredentials(project: Project, baseUrl: string, projectId: string): KenyaMpesaCredentials {
  return {
    consumerKey: requireSystemSecret(project, KenyaMpesaSecretNames.consumerKey),
    consumerSecret: requireSystemSecret(project, KenyaMpesaSecretNames.consumerSecret),
    shortCode: requireSystemSecret(project, KenyaMpesaSecretNames.shortCode),
    passkey: requireSystemSecret(project, KenyaMpesaSecretNames.passkey),
    callbackUrl: `${baseUrl}/kenya/mpesa-callback/${projectId}`,
  };
}

async function getMpesaAccessToken(credentials: KenyaMpesaCredentials): Promise<string> {
  const auth = Buffer.from(`${credentials.consumerKey}:${credentials.consumerSecret}`).toString('base64');
  const response = await fetch(`${MpesaDarajaBaseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
    method: 'GET',
    headers: { Authorization: `Basic ${auth}` },
  });
  if (!response.ok) {
    throw new Error(`M-Pesa OAuth failed (${response.status}): ${await response.text()}`);
  }
  const data = (await response.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('M-Pesa OAuth response missing access_token');
  }
  return data.access_token;
}

function buildStkPassword(shortCode: string, passkey: string, timestamp: string): string {
  return Buffer.from(`${shortCode}${passkey}${timestamp}`).toString('base64');
}

function buildTimestamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
}

export async function sendMpesaStkPush(
  credentials: KenyaMpesaCredentials,
  phone: string,
  amount: number,
  accountReference: string,
  description: string
): Promise<MpesaStkPushResult> {
  const token = await getMpesaAccessToken(credentials);
  const timestamp = buildTimestamp();
  const password = buildStkPassword(credentials.shortCode, credentials.passkey, timestamp);

  // Normalise phone to 254xxxxxxxxx format.
  const normalizedPhone = phone.replace(/^0/, '254').replace(/^\+/, '');

  const body = {
    BusinessShortCode: credentials.shortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerPayBillOnline',
    Amount: Math.round(amount),
    PartyA: normalizedPhone,
    PartyB: credentials.shortCode,
    PhoneNumber: normalizedPhone,
    CallBackURL: credentials.callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: description,
  };

  const response = await fetch(`${MpesaDarajaBaseUrl}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`M-Pesa STK push failed (${response.status}): ${text}`);
  }

  const data = JSON.parse(text) as {
    CheckoutRequestID?: string;
    MerchantRequestID?: string;
    ResponseCode?: string;
    ResponseDescription?: string;
    CustomerMessage?: string;
  };

  if (!data.CheckoutRequestID) {
    throw new Error(`M-Pesa STK push returned unexpected response: ${text}`);
  }

  return {
    checkoutRequestId: data.CheckoutRequestID,
    merchantRequestId: data.MerchantRequestID ?? '',
    responseCode: data.ResponseCode ?? '',
    responseDescription: data.ResponseDescription ?? '',
    customerMessage: data.CustomerMessage ?? '',
  };
}

export interface MpesaStkQueryResult {
  readonly checkoutRequestId: string;
  readonly resultCode: number;
  readonly resultDesc: string;
}

/**
 * Asks Daraja for the authoritative result of an STK push.
 *
 * Daraja callbacks are unsigned, so callback bodies must never be trusted on their own.
 * Throws when Daraja cannot give a final result (including "transaction is being processed").
 * @param credentials - M-Pesa credentials for the project.
 * @param checkoutRequestId - The CheckoutRequestID returned by the original STK push.
 * @returns The final STK push result according to Daraja.
 */
export async function queryMpesaStkPushStatus(
  credentials: KenyaMpesaCredentials,
  checkoutRequestId: string
): Promise<MpesaStkQueryResult> {
  const token = await getMpesaAccessToken(credentials);
  const timestamp = buildTimestamp();

  const response = await fetch(`${MpesaDarajaBaseUrl}/mpesa/stkpushquery/v1/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: credentials.shortCode,
      Password: buildStkPassword(credentials.shortCode, credentials.passkey, timestamp),
      Timestamp: timestamp,
      CheckoutRequestID: checkoutRequestId,
    }),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`M-Pesa STK query failed (${response.status}): ${text}`);
  }

  const data = JSON.parse(text) as { CheckoutRequestID?: string; ResultCode?: string | number; ResultDesc?: string };
  const resultCode = Number(data.ResultCode);
  if (data.ResultCode === undefined || data.ResultCode === '' || Number.isNaN(resultCode)) {
    throw new Error(`M-Pesa STK query returned no ResultCode: ${text}`);
  }
  if (data.CheckoutRequestID && data.CheckoutRequestID !== checkoutRequestId) {
    throw new Error(`M-Pesa STK query returned a different CheckoutRequestID: ${data.CheckoutRequestID}`);
  }

  return { checkoutRequestId, resultCode, resultDesc: data.ResultDesc ?? '' };
}

export function parseMpesaCallback(body: unknown): MpesaCallbackPayload | null {
  try {
    const b = body as Record<string, unknown>;
    const stk = (b?.Body as Record<string, unknown>)?.stkCallback as Record<string, unknown>;
    if (!stk) {
      return null;
    }
    const checkoutRequestId = stk.CheckoutRequestID as string;
    const resultCode = stk.ResultCode as number;
    const resultDesc = stk.ResultDesc as string;

    const metadata = (stk.CallbackMetadata as Record<string, unknown>)?.Item as Record<string, unknown>[] | undefined;
    function metaValue(name: string): unknown {
      return metadata?.find((m) => m.Name === name)?.Value;
    }

    return {
      checkoutRequestId,
      resultCode,
      resultDesc,
      mpesaReceiptNumber: metaValue('MpesaReceiptNumber') as string | undefined,
      transactionDate: metaValue('TransactionDate') as string | undefined,
      phoneNumber: metaValue('PhoneNumber') as string | undefined,
      amount: metaValue('Amount') as number | undefined,
    };
  } catch {
    return null;
  }
}

export function normalizeMpesaError(err: unknown): string {
  return `M-Pesa STK push failed: ${normalizeErrorString(err)}`;
}
