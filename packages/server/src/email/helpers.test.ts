// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { describeDevice, formatEmailDate, formatEmailTime, getActingPerson, maskEmail } from './helpers';

describe('Email helpers', () => {
  test('formatEmailTime uses East Africa Time', () => {
    expect(formatEmailTime('2026-11-19T11:05:00Z')).toBe('19 Nov 2026, 14:05 EAT');
    expect(formatEmailTime(new Date('2026-12-31T22:30:00Z'))).toBe('1 Jan 2027, 01:30 EAT');
  });

  test('formatEmailDate uses the East Africa date', () => {
    expect(formatEmailDate('2026-11-19')).toBe('19 Nov 2026');
    expect(formatEmailDate('2026-11-18T22:30:00Z')).toBe('19 Nov 2026');
  });

  test('maskEmail hides most of the name part', () => {
    expect(maskEmail('akinyi.otieno@example.co.ke')).toBe('ak***@example.co.ke');
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
    expect(maskEmail('a@example.com')).toBe('***@example.com');
    expect(maskEmail('not-an-email')).toBe('***');
  });

  test('describeDevice', () => {
    expect(
      describeDevice(
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36'
      )
    ).toBe('Chrome on Android');
    expect(describeDevice(undefined)).toBeUndefined();
    expect(describeDevice('')).toBeUndefined();
  });

  test('getActingPerson leaves out bots, client applications and missing memberships', async () => {
    const readReference = jest.fn();
    const ctx = (reference: string): any => ({ membership: { profile: { reference } }, systemRepo: { readReference } });
    expect(await getActingPerson(ctx('Bot/1'))).toBeUndefined();
    expect(await getActingPerson(ctx('ClientApplication/1'))).toBeUndefined();
    expect(await getActingPerson({ systemRepo: { readReference } } as any)).toBeUndefined();
    expect(readReference).not.toHaveBeenCalled();
  });
});
