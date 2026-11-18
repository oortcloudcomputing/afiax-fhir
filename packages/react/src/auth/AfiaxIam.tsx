// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Afiax IAM (Zitadel) for the Afiax apps (ADR-015 section 11): the "Sign in with Afiax IAM" button,
// signing out of Afiax IAM as well as Afiax FHIR, and idle sign-out with a warning.
import { Button, Group, Modal, Text } from '@mantine/core';
import type { BaseLoginRequest, MedplumClient } from '@medplum/core';
import { locationUtils } from '@medplum/core';
import { useMedplum, useMedplumProfile } from '@medplum/react-hooks';
import type { JSX } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface AfiaxIamMethod {
  readonly domain: string;
  readonly authorizeUrl: string;
  readonly endSessionUrl: string;
}

/** Where the Afiax IAM end-session URL is kept between signing in and signing out. */
export const AFIAX_IAM_END_SESSION_KEY = 'afiax.iamEndSession';
/** Shared between tabs: the last keyboard, mouse or touch activity in any tab of the app. */
export const LAST_ACTIVITY_KEY = 'afiax.lastActivity';

function store(key: string, value: string | undefined): void {
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable (private mode)
  }
}

function read(key: string): string | undefined {
  try {
    return window.localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Returns the server's Afiax IAM sign-in, or undefined when it is not set up there.
 * @returns The Afiax IAM method, undefined while loading or when unavailable.
 */
export function useAfiaxIam(): AfiaxIamMethod | undefined {
  const medplum = useMedplum();
  const [method, setMethod] = useState<AfiaxIamMethod>();
  useEffect(() => {
    medplum
      .get<AfiaxIamMethod>('auth/iam', { cache: 'no-cache' })
      .then((m) => setMethod(m?.authorizeUrl ? m : undefined))
      .catch(() => setMethod(undefined));
  }, [medplum]);
  return method;
}

/**
 * Sends the browser to Afiax IAM, then back to this app's /signin to finish (same origin, so the
 * PKCE verifier kept here is found).
 * @param medplum - The Medplum client.
 * @param method - The Afiax IAM method from the server.
 * @param loginRequest - The project and other login details.
 */
export async function startAfiaxIamSignIn(
  medplum: MedplumClient,
  method: AfiaxIamMethod,
  loginRequest: Partial<BaseLoginRequest> = {}
): Promise<void> {
  const request = await medplum.ensureCodeChallenge(loginRequest as BaseLoginRequest);
  const state = JSON.stringify({
    ...request,
    domain: method.domain,
    redirectUri: window.location.origin + '/signin',
  });
  store(AFIAX_IAM_END_SESSION_KEY, method.endSessionUrl);
  const url = new URL(method.authorizeUrl);
  url.searchParams.set('state', state);
  locationUtils.assign(url.toString());
}

export interface AfiaxIamButtonProps {
  readonly projectId?: string;
  /** Start at once, without a click (the portal's EHR tile opens /signin?iam=1) */
  readonly autoStart?: boolean;
}

/**
 * "Sign in with Afiax IAM": the main way in for staff of every facility, any email domain.
 * Renders nothing when the server has no Afiax IAM.
 * @param props - The project to sign in to, and whether to start at once.
 * @returns The button, or null.
 */
export function AfiaxIamButton(props: AfiaxIamButtonProps): JSX.Element | null {
  const medplum = useMedplum();
  const method = useAfiaxIam();
  const [busy, setBusy] = useState(false);
  const started = useRef(false);
  const { projectId, autoStart } = props;

  const start = useCallback(() => {
    if (!method) {
      return;
    }
    setBusy(true);
    startAfiaxIamSignIn(medplum, method, { projectId }).catch((err) => {
      console.error(err);
      setBusy(false);
    });
  }, [medplum, method, projectId]);

  useEffect(() => {
    if (autoStart && method && !started.current) {
      started.current = true;
      startAfiaxIamSignIn(medplum, method, { projectId }).catch(console.error);
    }
  }, [autoStart, method, medplum, projectId]);

  if (!method) {
    return null;
  }
  return (
    <Button type="button" fullWidth size="md" mb="md" loading={busy} onClick={start}>
      Sign in with Afiax IAM
    </Button>
  );
}

/**
 * Signs out of Afiax FHIR and, after an Afiax IAM sign-in, of Afiax IAM too, so the next sign-in
 * asks again. Afiax IAM sends the browser back to this app's /signin.
 * @param medplum - The Medplum client.
 * @returns True when the browser is being sent to Afiax IAM; false when the caller should
 * show the sign-in page itself.
 */
export async function signOutEverywhere(medplum: MedplumClient): Promise<boolean> {
  const endSession = read(AFIAX_IAM_END_SESSION_KEY);
  store(AFIAX_IAM_END_SESSION_KEY, undefined);
  try {
    await medplum.signOut();
  } catch {
    // The session may already be gone (expired, revoked): clear what this browser holds anyway
    medplum.clear();
  }
  if (!endSession) {
    return false;
  }
  try {
    const url = new URL(endSession);
    url.searchParams.set('post_logout_redirect_uri', window.location.origin + '/signin');
    locationUtils.assign(url.toString());
    return true;
  } catch {
    return false;
  }
}

const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const;
const CHECK_INTERVAL_MS = 1_000;
const WRITE_THROTTLE_MS = 5_000;

export interface IdleSignOutProps {
  /** Idle time before signing out; 0 switches the check off */
  readonly timeoutMs: number;
  /** How long before signing out to ask "Are you still there?" */
  readonly warningMs?: number;
  /** Shows the sign-in page after signing out, when Afiax IAM does not (default: /signin) */
  readonly onSignedOut?: () => void;
}

/**
 * Signs out after a period without keyboard, mouse or touch activity in any tab of the app, and
 * warns before. Activity is shared between tabs through localStorage, so working in one tab keeps
 * the others signed in.
 * @param props - The timeout and warning.
 * @returns The warning dialog.
 */
export function IdleSignOut(props: IdleSignOutProps): JSX.Element | null {
  const medplum = useMedplum();
  const signedIn = !!useMedplumProfile();
  const { timeoutMs, onSignedOut } = props;
  const warningMs = Math.min(props.warningMs ?? 60_000, timeoutMs);
  const [secondsLeft, setSecondsLeft] = useState<number>();
  // Set when the check starts (recordActivity), not during render
  const last = useRef(0);
  const signingOut = useRef(false);

  const recordActivity = useCallback((force?: boolean) => {
    const now = Date.now();
    if (force || now - last.current >= WRITE_THROTTLE_MS) {
      store(LAST_ACTIVITY_KEY, String(now));
    }
    last.current = now;
  }, []);

  useEffect(() => {
    if (!signedIn || timeoutMs <= 0) {
      return undefined;
    }
    signingOut.current = false;
    recordActivity(true);
    const onActivity = (): void => recordActivity();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }
    const check = (): void => {
      if (signingOut.current) {
        return;
      }
      const shared = Number(read(LAST_ACTIVITY_KEY)) || 0;
      const idle = Date.now() - Math.max(last.current, shared);
      if (idle >= timeoutMs) {
        signingOut.current = true;
        setSecondsLeft(undefined);
        signOutEverywhere(medplum)
          .then((redirecting) => {
            if (!redirecting) {
              (onSignedOut ?? (() => locationUtils.assign('/signin')))();
            }
          })
          .catch(console.error);
      } else if (idle >= timeoutMs - warningMs) {
        setSecondsLeft(Math.ceil((timeoutMs - idle) / 1000));
      } else {
        setSecondsLeft(undefined);
      }
    };
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    // A computer waking from sleep: check at once
    document.addEventListener('visibilitychange', check);
    return () => {
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', check);
    };
  }, [medplum, signedIn, timeoutMs, warningMs, recordActivity, onSignedOut]);

  if (!signedIn || timeoutMs <= 0) {
    return null;
  }
  const stay = (): void => {
    recordActivity(true);
    setSecondsLeft(undefined);
  };
  return (
    <Modal opened={secondsLeft !== undefined} onClose={stay} title="Are you still there?" centered>
      <Text mb="md">For the safety of patient records you will be signed out in {secondsLeft} seconds.</Text>
      <Group justify="flex-end">
        <Button
          variant="default"
          onClick={() => {
            signingOut.current = true;
            signOutEverywhere(medplum)
              .then((redirecting) => {
                if (!redirecting) {
                  (onSignedOut ?? (() => locationUtils.assign('/signin')))();
                }
              })
              .catch(console.error);
          }}
        >
          Sign out now
        </Button>
        <Button onClick={stay}>Stay signed in</Button>
      </Group>
    </Modal>
  );
}
