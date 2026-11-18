// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { badRequest } from '@medplum/core';
import type { Request, Response } from 'express';
import { getConfig } from '../config/loader';
import { sendOutcome } from '../fhir/outcomes';
import { globalLogger } from '../logger';
import { getDomainConfiguration } from './method';

/*
 * Afiax IAM (Zitadel): one identity provider for the whole server, for people with any email domain
 * (ADR-015 section 11). It is kept on a DomainConfiguration under this reserved name, which is not
 * an email domain, so the email form never matches it; people reach it with the "Sign in with Afiax
 * IAM" button. Afiax IAM proves the email; Afiax FHIR matches it to the person's memberships.
 */
export const AFIAX_IAM_DOMAIN = 'afiax-iam';

export interface AfiaxIamMethod {
  domain: string;
  authorizeUrl: string;
  /** Zitadel's end_session, with the client: the app adds post_logout_redirect_uri */
  endSessionUrl: string;
}

/**
 * Returns the Afiax IAM sign-in, if it is set up on this server.
 * @param email - Optional email, passed to Afiax IAM as login_hint so it is not typed twice.
 * @returns The authorize and end-session URLs, or undefined.
 */
export async function getAfiaxIamMethod(email?: string): Promise<AfiaxIamMethod | undefined> {
  const idp = (await getDomainConfiguration(AFIAX_IAM_DOMAIN))?.identityProvider;
  if (!idp?.authorizeUrl || !idp.clientId) {
    return undefined;
  }
  try {
    const url = new URL(idp.authorizeUrl);
    url.searchParams.set('client_id', idp.clientId);
    url.searchParams.set('redirect_uri', getConfig().baseUrl + 'auth/external');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid profile email');
    // A sign-in older than the session limit is asked again, so an expired session is not silently
    // renewed by a days-old Afiax IAM session
    const maxAge = getConfig().maxSessionLifetimeSeconds ?? 28800;
    if (maxAge > 0) {
      url.searchParams.set('max_age', String(maxAge));
    }
    if (email) {
      url.searchParams.set('login_hint', email.trim().toLowerCase());
    }
    const endSession = new URL('/oidc/v1/end_session', url.origin);
    endSession.searchParams.set('client_id', idp.clientId);
    return { domain: AFIAX_IAM_DOMAIN, authorizeUrl: url.toString(), endSessionUrl: endSession.toString() };
  } catch (err) {
    globalLogger.error(`Invalid Afiax IAM identity provider: ${err}`);
    return undefined;
  }
}

/**
 * GET /auth/iam?email=...: the Afiax IAM sign-in for the sign-in page's button.
 * @param req - The HTTP request.
 * @param res - The HTTP response.
 */
export async function afiaxIamHandler(req: Request, res: Response): Promise<void> {
  const email = typeof req.query.email === 'string' && req.query.email.includes('@') ? req.query.email : undefined;
  const method = await getAfiaxIamMethod(email);
  if (!method) {
    sendOutcome(res, badRequest('Afiax IAM is not set up on this server'));
    return;
  }
  res.status(200).json(method);
}

/**
 * Where an Afiax IAM sign-in continues: the sign-in page of the app it started from, when that
 * app's origin is allowed (MEDPLUM_ALLOWED_ORIGINS or the admin app), so its PKCE verifier (kept
 * in that origin's storage) is there. Anything else goes to the admin app, as before.
 * @param redirectUri - The redirect URI from the external auth state.
 * @returns The sign-in page URL, or undefined for the admin app.
 */
export function getAllowedSignInPage(redirectUri: string | undefined): URL | undefined {
  if (!redirectUri) {
    return undefined;
  }
  let origin: string;
  try {
    origin = new URL(redirectUri).origin;
  } catch {
    return undefined;
  }
  const config = getConfig();
  const allowed = new Set(
    [...(config.allowedOrigins ?? '').split(','), config.appBaseUrl]
      .map((o) => o?.trim())
      .filter(Boolean)
      .map((o) => {
        try {
          return new URL(o).origin;
        } catch {
          return '';
        }
      })
  );
  return allowed.has(origin) ? new URL('signin', origin + '/') : undefined;
}
