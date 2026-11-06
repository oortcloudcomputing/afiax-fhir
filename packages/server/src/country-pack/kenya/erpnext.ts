// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { isKenyaErpNextEnabled, KenyaErpNextSecretNames, normalizeErrorString } from '@medplum/core';
import type { Claim, Patient, Project } from '@medplum/fhirtypes';
import fetch from 'node-fetch';

export interface KenyaErpNextCredentials {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly company: string;
}

export interface ErpNextCustomerResult {
  readonly customerName: string;
  readonly created: boolean;
}

export interface ErpNextSalesInvoiceResult {
  readonly invoiceName: string;
  readonly invoiceTotal: number;
  readonly currency: string;
}

export interface ErpNextPaymentEntryResult {
  readonly paymentEntryName: string;
  readonly amount: number;
  readonly currency: string;
}

function getProjectSystemSecret(project: Project, name: string): string | undefined {
  return project.systemSecret?.find((entry) => entry.name === name)?.valueString?.trim() || undefined;
}

function requireSystemSecret(project: Project, name: string): string {
  const value = getProjectSystemSecret(project, name);
  if (!value) {
    throw new Error(`Missing required Afiax-managed ERPNext secret: ${name}`);
  }
  return value;
}

export function hasKenyaErpNextCredentials(project: Project): boolean {
  return (
    isKenyaErpNextEnabled(project) &&
    !!(
      getProjectSystemSecret(project, KenyaErpNextSecretNames.baseUrl) &&
      getProjectSystemSecret(project, KenyaErpNextSecretNames.apiKey) &&
      getProjectSystemSecret(project, KenyaErpNextSecretNames.apiSecret)
    )
  );
}

export function getKenyaErpNextCredentials(project: Project): KenyaErpNextCredentials {
  return {
    baseUrl: requireSystemSecret(project, KenyaErpNextSecretNames.baseUrl).replace(/\/+$/, ''),
    apiKey: requireSystemSecret(project, KenyaErpNextSecretNames.apiKey),
    apiSecret: requireSystemSecret(project, KenyaErpNextSecretNames.apiSecret),
    company: getProjectSystemSecret(project, KenyaErpNextSecretNames.company) ?? 'Afiax Healthcare Ltd',
  };
}

function authHeaders(credentials: KenyaErpNextCredentials): Record<string, string> {
  return {
    Authorization: `token ${credentials.apiKey}:${credentials.apiSecret}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function erpFetch(
  credentials: KenyaErpNextCredentials,
  path: string,
  options: { method: 'GET' | 'POST' | 'PUT'; body?: unknown }
): Promise<unknown> {
  const url = `${credentials.baseUrl}${path}`;
  const response = await fetch(url, {
    method: options.method,
    headers: authHeaders(credentials),
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`ERPNext ${options.method} ${path} failed (${response.status}): ${text}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

function buildCustomerName(patient: Patient): string {
  const name = patient.name?.[0];
  if (!name) {
    return `Patient/${patient.id}`;
  }
  const given = name.given?.join(' ') ?? '';
  const family = name.family ?? '';
  return [given, family].filter(Boolean).join(' ') || `Patient/${patient.id}`;
}

export async function ensureErpNextCustomer(
  credentials: KenyaErpNextCredentials,
  patient: Patient & { id: string },
  clientRegistryId?: string
): Promise<ErpNextCustomerResult> {
  // Search by FHIR patient ID custom field first to maintain idempotency.
  const searchPath = `/api/resource/Customer?filters=[["custom_fhir_patient_id","=","Patient/${patient.id}"]]&fields=["name"]&limit=1`;
  const searchResult = (await erpFetch(credentials, searchPath, { method: 'GET' })) as { data?: { name: string }[] };

  if (searchResult?.data?.length) {
    return { customerName: searchResult.data[0].name, created: false };
  }

  const customerName = buildCustomerName(patient);
  const body: Record<string, unknown> = {
    customer_name: customerName,
    customer_type: 'Individual',
    customer_group: 'Healthcare',
    territory: 'Kenya',
    custom_fhir_patient_id: `Patient/${patient.id}`,
  };
  if (clientRegistryId) {
    body.custom_dha_client_registry_id = clientRegistryId;
  }

  const created = (await erpFetch(credentials, '/api/resource/Customer', { method: 'POST', body })) as {
    data?: { name: string };
  };
  const name = created?.data?.name ?? customerName;
  return { customerName: name, created: true };
}

// ---------------------------------------------------------------------------
// Sales Invoice
// ---------------------------------------------------------------------------

export interface ErpNextInvoiceItem {
  readonly itemCode: string;
  readonly itemName: string;
  readonly qty: number;
  readonly rate: number;
}

function buildInvoiceItemsFromClaim(claim: Claim): ErpNextInvoiceItem[] {
  return (claim.item ?? []).map((item, index) => {
    const coding = item.productOrService?.coding?.[0];
    const itemCode = coding?.code ?? `CLAIM-ITEM-${index + 1}`;
    const itemName = coding?.display ?? item.productOrService?.text ?? itemCode;
    const qty = item.quantity?.value ?? 1;
    const rate = item.unitPrice?.value ?? 0;
    return { itemCode, itemName, qty, rate };
  });
}

export async function createErpNextSalesInvoice(
  credentials: KenyaErpNextCredentials,
  claim: Claim & { id: string },
  customerName: string,
  currency = 'KES'
): Promise<ErpNextSalesInvoiceResult> {
  // Idempotency: search for an existing invoice for this claim.
  const searchPath = `/api/resource/Sales Invoice?filters=[["custom_fhir_claim_id","=","Claim/${claim.id}"],["docstatus","!=",2]]&fields=["name","grand_total","currency","docstatus"]&limit=1`;
  const existing = (await erpFetch(credentials, searchPath, { method: 'GET' })) as {
    data?: { name: string; grand_total: number; currency: string; docstatus?: number }[];
  };
  if (existing?.data?.length) {
    const row = existing.data[0];
    if (row.docstatus === 0) {
      // A draft left by an earlier version: submit it, because ERPNext refuses payments against drafts.
      await erpFetch(credentials, `/api/resource/Sales Invoice/${encodeURIComponent(row.name)}`, {
        method: 'PUT',
        body: { docstatus: 1 },
      });
    }
    return { invoiceName: row.name, invoiceTotal: row.grand_total, currency: row.currency };
  }

  const items = buildInvoiceItemsFromClaim(claim);
  const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const body: Record<string, unknown> = {
    customer: customerName,
    company: credentials.company,
    currency,
    due_date: dueDate,
    items: items.map((i) => ({
      item_code: i.itemCode,
      item_name: i.itemName,
      qty: i.qty,
      rate: i.rate,
    })),
    custom_fhir_claim_id: `Claim/${claim.id}`,
    // Submitted on creation: the claim amount is final, and payments can only be allocated to
    // submitted invoices.
    docstatus: 1,
  };

  const result = (await erpFetch(credentials, '/api/resource/Sales Invoice', { method: 'POST', body })) as {
    data?: { name: string; grand_total: number; currency: string };
  };

  if (!result?.data?.name) {
    throw new Error(`ERPNext Sales Invoice creation returned unexpected response: ${JSON.stringify(result)}`);
  }

  return {
    invoiceName: result.data.name,
    invoiceTotal: result.data.grand_total,
    currency: result.data.currency ?? currency,
  };
}

// ---------------------------------------------------------------------------
// Payment Entry
// ---------------------------------------------------------------------------

export interface ErpNextPaymentEntryInput {
  readonly invoiceName: string;
  readonly amount: number;
  readonly currency: string;
  readonly modeOfPayment: string;
  readonly partyName: string;
  readonly referenceDocName?: string;
  readonly customFields?: Record<string, unknown>;
}

export async function createErpNextPaymentEntry(
  credentials: KenyaErpNextCredentials,
  input: ErpNextPaymentEntryInput
): Promise<ErpNextPaymentEntryResult> {
  // The REST API does not fill the receiving account from the mode of payment (the desk UI does),
  // so ask ERPNext for the mode's default account for this company.
  const paidTo = await getErpNextModeOfPaymentAccount(credentials, input.modeOfPayment);
  const body: Record<string, unknown> = {
    payment_type: 'Receive',
    company: credentials.company,
    mode_of_payment: input.modeOfPayment,
    party_type: 'Customer',
    party: input.partyName,
    paid_to: paidTo,
    paid_amount: input.amount,
    received_amount: input.amount,
    target_exchange_rate: 1,
    currency: input.currency,
    // Bank-type modes need a reference number and date before the entry can be submitted.
    reference_no: paymentReference(input),
    reference_date: nairobiDate(),
    docstatus: 1,
    references: [
      {
        reference_doctype: 'Sales Invoice',
        reference_name: input.invoiceName,
        allocated_amount: input.amount,
      },
    ],
    ...input.customFields,
  };

  const result = (await erpFetch(credentials, '/api/resource/Payment Entry', { method: 'POST', body })) as {
    data?: { name: string };
  };

  if (!result?.data?.name) {
    throw new Error(`ERPNext Payment Entry creation returned unexpected response: ${JSON.stringify(result)}`);
  }

  return {
    paymentEntryName: result.data.name,
    amount: input.amount,
    currency: input.currency,
  };
}

async function getErpNextModeOfPaymentAccount(credentials: KenyaErpNextCredentials, modeOfPayment: string): Promise<string> {
  const params = new URLSearchParams({ mode_of_payment: modeOfPayment, company: credentials.company });
  const result = (await erpFetch(
    credentials,
    `/api/method/erpnext.accounts.doctype.sales_invoice.sales_invoice.get_bank_cash_account?${params}`,
    { method: 'GET' }
  )) as { message?: { account?: string } };
  const account = result?.message?.account;
  if (!account) {
    throw new Error(`ERPNext Mode of Payment "${modeOfPayment}" has no default account for ${credentials.company}`);
  }
  return account;
}

function paymentReference(input: ErpNextPaymentEntryInput): string {
  const fields = input.customFields ?? {};
  for (const key of ['custom_mpesa_receipt', 'custom_transaction_ref', 'custom_afiax_pay_ref', 'custom_payment_notice_id', 'custom_fhir_claim_response_id']) {
    const value = fields[key];
    if (typeof value === 'string' && value) {
      return value;
    }
  }
  return input.referenceDocName ?? input.invoiceName;
}

/**
 * Today's date in East Africa Time (the ledger date of the payment).
 * @returns The date as YYYY-MM-DD.
 */
function nairobiDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi' }).format(new Date());
}

// ---------------------------------------------------------------------------
// Helpers for callers
// ---------------------------------------------------------------------------

export function normalizeErpNextError(err: unknown): string {
  return `ERPNext sync failed: ${normalizeErrorString(err)}`;
}
