// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import type { Referral } from './bedReferralsApi';
import { askForBrowserNotifications, kenyaAlert as alert } from './kenyaAlert';
import { urgencyColor, useBedsApi } from './bedReferralsApi';

/** How often referrals are checked for news. */
const PollMs = 20_000;

/**
 * News about bed referrals, on every page of Afiax Provider (user decision 2026-11-24): a pop-up
 * with a sound, and a browser notification when Afiax Provider is in another tab. New incoming
 * referrals; answers to ours (accepted, declined); the hold running out; the ambulance arriving.
 * @returns Nothing visible (it shows notifications).
 */
export function BedReferralAlerts(): JSX.Element | null {
  const call = useBedsApi();
  const navigate = useNavigate();
  const seen = useRef<Map<string, string>>(undefined);

  useEffect(() => {
    if (!call) {
      return undefined;
    }
    askForBrowserNotifications();
    let stopped = false;
    const tick = async (): Promise<void> => {
      const [incoming, sent] = await Promise.all([
        call<Referral[]>('GET', 'referrals?direction=incoming'),
        call<Referral[]>('GET', 'referrals?direction=sent'),
      ]);
      if (stopped) {
        return;
      }
      const now = new Map<string, string>();
      for (const r of [...incoming, ...sent]) {
        now.set(r.id, `${r.state}|${ambulanceKey(r)}`);
      }
      const before = seen.current;
      seen.current = now;
      if (!before) {
        return; // the first look only learns what is there
      }
      for (const r of [...incoming, ...sent]) {
        const was = before.get(r.id);
        const is = now.get(r.id);
        if (was === is) {
          continue;
        }
        const news = describe(r, was);
        if (news) {
          alert(news.title, news.body, r.view.urgency === 'emergency' && r.direction === 'incoming', urgencyColor[r.view.urgency], () =>
            navigate('/kenya/bed-referrals')
          );
        }
      }
    };
    const run = (): void => {
      tick().catch(() => undefined);
    };
    run();
    const timer = setInterval(run, PollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [call, navigate]);

  return null;
}

function ambulanceKey(r: Referral): string {
  if (r.ambulance?.arrived) {
    return 'arrived';
  }
  return r.ambulance ? 'on-way' : '';
}

function describe(r: Referral, was: string | undefined): { title: string; body: string } | undefined {
  const bed = `${r.view.wardTypeDisplay} bed`;
  if (r.direction === 'incoming' && r.state === 'waiting' && !was) {
    return {
      title: `${r.view.urgency === 'emergency' ? 'EMERGENCY: ' : ''}${r.view.from} asks for a ${bed}`,
      body: r.view.summary.reason,
    };
  }
  if (r.direction === 'sent' && r.state === 'accepted' && !was?.startsWith('accepted')) {
    return { title: `${r.to} accepted: ${r.bed?.name ?? 'a bed'} is held`, body: 'Send the ambulance from Bed referrals.' };
  }
  if (r.direction === 'sent' && r.state === 'declined') {
    return { title: `${r.to} declined the ${bed}`, body: r.reason ?? '' };
  }
  if (r.state === 'expired') {
    return { title: `The held ${bed} ran out`, body: `${r.direction === 'sent' ? r.to : r.view.from}: the 2 hours passed.` };
  }
  if (r.ambulance?.arrived && !was?.endsWith('arrived')) {
    return { title: `Ambulance ${r.ambulance.plate} has arrived`, body: `At ${r.to}.` };
  }
  if (r.direction === 'incoming' && r.ambulance && !r.ambulance.arrived && !was?.endsWith('on-way')) {
    return { title: `Ambulance ${r.ambulance.plate} is on the way`, body: `From ${r.view.from}.` };
  }
  return undefined;
}
