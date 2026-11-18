// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getConfig } from './config';
import { DEFAULT_IDLE_TIMEOUT_MINUTES, getIdleTimeoutMs } from './useIdleSignOut';

jest.mock('./config', () => ({ getConfig: jest.fn(() => ({})) }));

describe('getIdleTimeoutMs', () => {
  test('Defaults to 15 minutes', () => {
    (getConfig as jest.Mock).mockReturnValue({});
    expect(getIdleTimeoutMs()).toBe(DEFAULT_IDLE_TIMEOUT_MINUTES * 60_000);
    expect(DEFAULT_IDLE_TIMEOUT_MINUTES).toBe(15);
  });

  test('Reads the configured minutes; 0 switches it off', () => {
    (getConfig as jest.Mock).mockReturnValue({ idleTimeoutMinutes: '30' });
    expect(getIdleTimeoutMs()).toBe(30 * 60_000);
    (getConfig as jest.Mock).mockReturnValue({ idleTimeoutMinutes: 0 });
    expect(getIdleTimeoutMs()).toBe(0);
  });

  test('Ignores a value that is not a number', () => {
    (getConfig as jest.Mock).mockReturnValue({ idleTimeoutMinutes: 'soon' });
    expect(getIdleTimeoutMs()).toBe(DEFAULT_IDLE_TIMEOUT_MINUTES * 60_000);
  });
});
