// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ProfileResource } from '@medplum/core';
import { concatUrls, formatHumanName, normalizeErrorString } from '@medplum/core';
import type { Reference, User } from '@medplum/fhirtypes';
import Bowser from 'bowser';
import { getConfig } from '../config/loader';
import type { AuthenticatedRequestContext } from '../context';
import { getLogger } from '../logger';
import { extractEmailFromAddress } from './utils';

/*
 * Values that several branded emails need. Wording rules: CONTENT.md in oortcloud-email-templates.
 */

export interface ActingPerson {
  readonly name: string;
  readonly email?: string;
}

/**
 * Returns the person making the current request, to name them in an email ("Jane Wanjiku invited you").
 * Bots and client applications are not people, so they return undefined.
 * @param ctx - The authenticated request context.
 * @returns The person's name and email, if the request was made by a person with a name.
 */
export async function getActingPerson(ctx: AuthenticatedRequestContext): Promise<ActingPerson | undefined> {
  const membership = ctx.membership as typeof ctx.membership | undefined;
  const profileType = membership?.profile?.reference?.split('/')[0];
  if (!membership || (profileType !== 'Practitioner' && profileType !== 'Patient' && profileType !== 'RelatedPerson')) {
    return undefined;
  }
  try {
    const profile = await ctx.systemRepo.readReference(membership.profile as Reference<ProfileResource>);
    const name = formatHumanName(profile.name?.[0]);
    if (!name) {
      return undefined;
    }
    const user = membership.user?.reference?.startsWith('User/')
      ? await ctx.systemRepo.readReference(membership.user as Reference<User>)
      : undefined;
    return { name, email: user?.email };
  } catch (err) {
    getLogger().warn('Could not read the acting person for an email', { error: normalizeErrorString(err) });
    return undefined;
  }
}

const EAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Nairobi',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Formats a time for an email, in East Africa Time: "19 Nov 2026, 14:05 EAT".
 * @param time - The time, as a Date or ISO string.
 * @returns The formatted time.
 */
export function formatEmailTime(time: Date | string): string {
  return `${EAT.format(typeof time === 'string' ? new Date(time) : time)} EAT`;
}

/**
 * Hides most of an email address's name part: "akinyi.otieno@example.co.ke" becomes "ak***@example.co.ke".
 * @param email - The email address.
 * @returns The partly hidden address.
 */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  if (at < 1) {
    return '***';
  }
  const local = email.slice(0, at);
  return `${local.slice(0, Math.min(2, local.length - 1))}***${email.slice(at)}`;
}

/**
 * Describes a browser in plain words: "Chrome on Android".
 * @param userAgent - The User-Agent header.
 * @returns The description, or undefined if it can't be worked out.
 */
export function describeDevice(userAgent: string | undefined): string | undefined {
  if (!userAgent) {
    return undefined;
  }
  const parser = Bowser.getParser(userAgent);
  const browser = parser.getBrowserName();
  const os = parser.getOSName();
  if (browser && os) {
    return `${browser} on ${os}`;
  }
  return browser || os || undefined;
}

/**
 * Returns the Afiax support email address, without the display name the config may include.
 * @returns The support email address.
 */
export function getSupportEmail(): string {
  const { supportEmail } = getConfig();
  return extractEmailFromAddress(supportEmail) ?? supportEmail;
}

/**
 * Returns a page of the Afiax app: its full address and a short form for display.
 * @param path - The page path, such as "signin".
 * @returns The full URL and the URL without "https://".
 */
export function getAppLink(path: string): { readonly url: string; readonly display: string } {
  const url = concatUrls(getConfig().appBaseUrl, path);
  const parsed = new URL(url);
  return { url, display: parsed.host + parsed.pathname };
}
