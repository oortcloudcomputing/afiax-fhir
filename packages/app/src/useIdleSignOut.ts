// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { useMedplum } from '@medplum/react';
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { getConfig } from './config';

export const DEFAULT_IDLE_TIMEOUT_MINUTES = 30;
export const LAST_ACTIVITY_KEY = 'afiax.lastActivity';

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
const CHECK_INTERVAL_MS = 15_000;
const WRITE_THROTTLE_MS = 5_000;

export function getIdleTimeoutMs(): number {
  const configured = Number(getConfig().idleTimeoutMinutes);
  const minutes = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_IDLE_TIMEOUT_MINUTES;
  return minutes * 60_000;
}

/**
 * Signs the user out after a period without keyboard, mouse or touch activity.
 * Activity is shared across tabs through localStorage, so a user working in one tab
 * is not signed out by another idle tab. A timeout of 0 disables the check.
 */
export function useIdleSignOut(): void {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const signedIn = !!medplum.getProfile();

  useEffect(() => {
    const timeoutMs = getIdleTimeoutMs();
    if (!signedIn || timeoutMs === 0) {
      return undefined;
    }

    let lastWrite = 0;
    const recordActivity = (): void => {
      const now = Date.now();
      if (now - lastWrite >= WRITE_THROTTLE_MS) {
        lastWrite = now;
        writeLastActivity(now);
      }
    };

    const check = (): void => {
      const last = readLastActivity() ?? lastWrite;
      if (Date.now() - last >= timeoutMs) {
        medplum.signOut().catch(console.error);
        navigate('/signin')?.catch(console.error);
      }
    };

    recordActivity();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, recordActivity, { passive: true });
    }
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);

    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, recordActivity);
      }
      window.clearInterval(interval);
    };
  }, [medplum, navigate, signedIn]);
}

function readLastActivity(): number | undefined {
  try {
    const value = Number(window.localStorage.getItem(LAST_ACTIVITY_KEY));
    return value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeLastActivity(time: number): void {
  try {
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(time));
  } catch {
    // Storage unavailable (private mode); the in-memory timestamp is used instead
  }
}
