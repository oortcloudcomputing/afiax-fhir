// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { act, render } from './test-utils/render';
import { DEFAULT_IDLE_TIMEOUT_MINUTES, LAST_ACTIVITY_KEY, useIdleSignOut } from './useIdleSignOut';

function Harness(): JSX.Element {
  useIdleSignOut();
  return <div>harness</div>;
}

async function setup(medplum: MockClient): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={medplum}>
          <Harness />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('useIdleSignOut', () => {
  const timeoutMs = DEFAULT_IDLE_TIMEOUT_MINUTES * 60_000;

  beforeEach(() => {
    jest.useFakeTimers();
    window.localStorage.removeItem(LAST_ACTIVITY_KEY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('Signs out after the idle timeout', async () => {
    const medplum = new MockClient();
    const signOut = jest.spyOn(medplum, 'signOut');
    await setup(medplum);

    await act(async () => {
      jest.advanceTimersByTime(timeoutMs - 60_000);
    });
    expect(signOut).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(90_000);
    });
    expect(signOut).toHaveBeenCalled();
  });

  test('Activity resets the timer', async () => {
    const medplum = new MockClient();
    const signOut = jest.spyOn(medplum, 'signOut');
    await setup(medplum);

    for (let i = 0; i < 4; i++) {
      await act(async () => {
        jest.advanceTimersByTime(timeoutMs / 2);
        window.dispatchEvent(new KeyboardEvent('keydown'));
      });
    }
    expect(signOut).not.toHaveBeenCalled();
  });

  test('Activity in another tab keeps the session', async () => {
    const medplum = new MockClient();
    const signOut = jest.spyOn(medplum, 'signOut');
    await setup(medplum);

    await act(async () => {
      jest.advanceTimersByTime(timeoutMs - 60_000);
      window.localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
      jest.advanceTimersByTime(120_000);
    });
    expect(signOut).not.toHaveBeenCalled();
  });

  test('Does nothing when signed out', async () => {
    const medplum = new MockClient({ profile: null });
    const signOut = jest.spyOn(medplum, 'signOut');
    await setup(medplum);

    await act(async () => {
      jest.advanceTimersByTime(timeoutMs * 2);
    });
    expect(signOut).not.toHaveBeenCalled();
  });
});
