// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { NextResponse } from 'next/server';

interface DomainTransferRequest {
  readonly domainName?: string;
  readonly authCode?: string;
  readonly nameservers?: readonly string[];
}

export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as DomainTransferRequest;
  const domainName = body.domainName?.trim().toLowerCase();

  if (!domainName) {
    return NextResponse.json({ status: 'error', message: 'domainName is required.' }, { status: 400 });
  }

  const authUserId = process.env.RESELLERCLUB_AUTH_USER_ID;
  const apiKey = process.env.RESELLERCLUB_API_KEY;
  const customerId = process.env.RESELLERCLUB_DEFAULT_CUSTOMER_ID;
  const regContactId = process.env.RESELLERCLUB_DEFAULT_REG_CONTACT_ID;
  const adminContactId = process.env.RESELLERCLUB_DEFAULT_ADMIN_CONTACT_ID;
  const techContactId = process.env.RESELLERCLUB_DEFAULT_TECH_CONTACT_ID;
  const billingContactId = process.env.RESELLERCLUB_DEFAULT_BILLING_CONTACT_ID;
  const invoiceOption = process.env.RESELLERCLUB_DEFAULT_INVOICE_OPTION ?? 'KeepInvoice';
  const baseUrl = (process.env.RESELLERCLUB_API_BASE_URL ?? 'https://httpapi.com').replace(/\/$/, '');

  const missingEnv = [
    ['RESELLERCLUB_AUTH_USER_ID', authUserId],
    ['RESELLERCLUB_API_KEY', apiKey],
    ['RESELLERCLUB_DEFAULT_CUSTOMER_ID', customerId],
    ['RESELLERCLUB_DEFAULT_REG_CONTACT_ID', regContactId],
    ['RESELLERCLUB_DEFAULT_ADMIN_CONTACT_ID', adminContactId],
    ['RESELLERCLUB_DEFAULT_TECH_CONTACT_ID', techContactId],
    ['RESELLERCLUB_DEFAULT_BILLING_CONTACT_ID', billingContactId],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingEnv.length) {
    return NextResponse.json({
      status: 'not_configured',
      message: 'ResellerClub transfer submission is not fully configured yet.',
      missingEnv,
    });
  }

  const params = new URLSearchParams();
  params.set('auth-userid', authUserId as string);
  // ResellerClub examples use api-key while the parameter table references auth-key; send both for compatibility.
  params.set('api-key', apiKey as string);
  params.set('auth-key', apiKey as string);
  params.set('domain-name', domainName);
  params.set('customer-id', customerId as string);
  params.set('reg-contact-id', regContactId as string);
  params.set('admin-contact-id', adminContactId as string);
  params.set('tech-contact-id', techContactId as string);
  params.set('billing-contact-id', billingContactId as string);
  params.set('invoice-option', invoiceOption);
  params.set('auto-renew', 'false');

  if (body.authCode) {
    params.set('auth-code', body.authCode);
  }

  for (const nameserver of body.nameservers ?? []) {
    if (nameserver.trim()) {
      params.append('ns', nameserver.trim());
    }
  }

  try {
    const response = await fetch(`${baseUrl}/api/domains/transfer.json?${params.toString()}`, {
      method: 'POST',
      cache: 'no-store',
    });

    const text = await response.text();
    let payload: unknown = text;
    try {
      payload = JSON.parse(text);
    } catch {
      // Response is not JSON; keep raw text payload for inspection.
    }

    if (!response.ok) {
      return NextResponse.json(
        {
          status: 'error',
          message: `ResellerClub transfer failed with status ${response.status}.`,
          upstream: payload,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      status: 'submitted',
      message: 'Domain transfer request submitted to ResellerClub.',
      upstream: payload,
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'ResellerClub transfer submission failed.',
      },
      { status: 502 }
    );
  }
}
