// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { locationUtils } from '@medplum/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react-hooks';
import crypto from 'crypto';
import type { JSX } from 'react';
import { TextEncoder } from 'util';
import { act, fireEvent, render, screen } from '../test-utils/render';
import type { AfiaxIamMethod } from './AfiaxIam';
import { AFIAX_IAM_END_SESSION_KEY, AfiaxIamButton, IdleSignOut, LAST_ACTIVITY_KEY, signOutEverywhere } from './AfiaxIam';

const METHOD: AfiaxIamMethod = {
  domain: 'afiax-iam',
  authorizeUrl: 'https://iam.example.com/oauth/v2/authorize?client_id=c1&response_type=code',
  endSessionUrl: 'https://iam.example.com/oidc/v1/end_session?client_id=c1',
};

function withIam(medplum: MockClient, method: AfiaxIamMethod | undefined): void {
  const get = medplum.get.bind(medplum);
  jest.spyOn(medplum, 'get').mockImplementation(((url: string | URL, options?: RequestInit) => {
    if (url.toString().includes('auth/iam')) {
      return method ? Promise.resolve(method) : Promise.reject(new Error('Afiax IAM is not set up'));
    }
    return get(url, options);
  }) as never);
}

async function setup(medplum: MockClient, ui: JSX.Element): Promise<void> {
  await act(async () => {
    render(<MedplumProvider medplum={medplum}>{ui}</MedplumProvider>);
  });
}

describe('Afiax IAM', () => {
  beforeAll(() => {
    Object.defineProperty(global, 'TextEncoder', { value: TextEncoder });
    Object.defineProperty(global.self, 'crypto', { value: crypto.webcrypto });
  });

  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  test('No button when the server has no Afiax IAM', async () => {
    const medplum = new MockClient({ profile: null });
    withIam(medplum, undefined);
    await setup(medplum, <AfiaxIamButton />);
    expect(screen.queryByText('Sign in with Afiax IAM')).not.toBeInTheDocument();
  });

  test('Button sends the browser to Afiax IAM with state for this app', async () => {
    const assign = jest.spyOn(locationUtils, 'assign').mockImplementation(() => {});
    const medplum = new MockClient({ profile: null });
    withIam(medplum, METHOD);
    await setup(medplum, <AfiaxIamButton projectId="p1" />);
    await act(async () => {
      fireEvent.click(await screen.findByText('Sign in with Afiax IAM'));
    });
    expect(assign).toHaveBeenCalledTimes(1);
    const url = new URL(assign.mock.calls[0][0]);
    expect(url.origin + url.pathname).toBe('https://iam.example.com/oauth/v2/authorize');
    const state = JSON.parse(url.searchParams.get('state') as string);
    expect(state.domain).toBe('afiax-iam');
    expect(state.projectId).toBe('p1');
    expect(state.redirectUri).toBe(window.location.origin + '/signin');
    expect(state.codeChallenge).toBeTruthy();
    expect(window.localStorage.getItem(AFIAX_IAM_END_SESSION_KEY)).toBe(METHOD.endSessionUrl);
  });

  test('autoStart goes to Afiax IAM without a click', async () => {
    const assign = jest.spyOn(locationUtils, 'assign').mockImplementation(() => {});
    const medplum = new MockClient({ profile: null });
    withIam(medplum, METHOD);
    await setup(medplum, <AfiaxIamButton autoStart />);
    await act(async () => {
      await screen.findByText('Sign in with Afiax IAM');
    });
    expect(assign).toHaveBeenCalledTimes(1);
  });

  test('Sign out after an Afiax IAM sign-in ends the IAM session too', async () => {
    const assign = jest.spyOn(locationUtils, 'assign').mockImplementation(() => {});
    const medplum = new MockClient();
    const signOut = jest.spyOn(medplum, 'signOut');
    window.localStorage.setItem(AFIAX_IAM_END_SESSION_KEY, METHOD.endSessionUrl);
    expect(await signOutEverywhere(medplum)).toBe(true);
    expect(signOut).toHaveBeenCalled();
    const url = new URL(assign.mock.calls[0][0]);
    expect(url.searchParams.get('client_id')).toBe('c1');
    expect(url.searchParams.get('post_logout_redirect_uri')).toBe(window.location.origin + '/signin');
    expect(window.localStorage.getItem(AFIAX_IAM_END_SESSION_KEY)).toBeNull();
  });

  test('Sign out after a password sign-in stays in the app', async () => {
    const assign = jest.spyOn(locationUtils, 'assign').mockImplementation(() => {});
    const medplum = new MockClient();
    jest.spyOn(medplum, 'signOut').mockRejectedValue(new Error('expired'));
    const clear = jest.spyOn(medplum, 'clear');
    expect(await signOutEverywhere(medplum)).toBe(false);
    expect(clear).toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  test('Idle: warns a minute before, then signs out', async () => {
    jest.useFakeTimers();
    const assign = jest.spyOn(locationUtils, 'assign').mockImplementation(() => {});
    const medplum = new MockClient();
    const signOut = jest.spyOn(medplum, 'signOut');
    await setup(medplum, <IdleSignOut timeoutMs={5 * 60_000} />);

    await act(async () => {
      jest.advanceTimersByTime(4 * 60_000 + 1_000);
    });
    // Let the dialog's opening transition run
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    expect(screen.getByText('Are you still there?')).toBeInTheDocument();
    expect(signOut).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(59_000);
    });
    expect(signOut).toHaveBeenCalled();
    expect(assign).toHaveBeenCalledWith('/signin');
  });

  test('Idle: "Stay signed in" and activity in another tab keep the session', async () => {
    jest.useFakeTimers();
    const medplum = new MockClient();
    const signOut = jest.spyOn(medplum, 'signOut');
    await setup(medplum, <IdleSignOut timeoutMs={5 * 60_000} />);

    await act(async () => {
      jest.advanceTimersByTime(4 * 60_000 + 1_000);
    });
    // Let the dialog's opening transition run
    await act(async () => {
      jest.advanceTimersByTime(500);
    });
    await act(async () => {
      fireEvent.click(screen.getByText('Stay signed in'));
    });
    await act(async () => {
      jest.advanceTimersByTime(3 * 60_000);
    });
    // Another tab was used
    window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    await act(async () => {
      jest.advanceTimersByTime(3 * 60_000);
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  test('Idle: 0 switches it off', async () => {
    jest.useFakeTimers();
    const medplum = new MockClient();
    const signOut = jest.spyOn(medplum, 'signOut');
    await setup(medplum, <IdleSignOut timeoutMs={0} />);
    await act(async () => {
      jest.advanceTimersByTime(60 * 60_000);
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});
