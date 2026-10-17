// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaIcd10System, KenyaIcd11System } from '@medplum/core';
import type { Condition } from '@medplum/fhirtypes';
import type { AuthenticatedRequestContext } from '../../context';
import { aggregateConditionsForWeek } from './khis-export';

function condition(codings: { system: string; code: string }[], verification = 'confirmed'): Condition {
  return {
    resourceType: 'Condition',
    subject: { reference: 'Patient/p1' },
    verificationStatus: { coding: [{ code: verification }] },
    code: { coding: codings },
  };
}

function ctxWith(conditions: Condition[]): AuthenticatedRequestContext {
  return {
    repo: {
      search: jest.fn(async () => ({ resourceType: 'Bundle', entry: conditions.map((resource) => ({ resource })) })),
    },
  } as unknown as AuthenticatedRequestContext;
}

describe('aggregateConditionsForWeek', () => {
  const weekStart = new Date('2026-10-05');
  const weekEnd = new Date('2026-10-11');

  test('counts a Condition coded in both ICD-11 and ICD-10 once', async () => {
    const ctx = ctxWith([
      condition([
        { system: KenyaIcd11System, code: '1F40' },
        { system: KenyaIcd10System, code: 'B50' },
      ]),
    ]);
    const result = await aggregateConditionsForWeek(ctx, 'facility-1', weekStart, weekEnd);
    expect(result).toEqual([{ code: '1F40', legacyCode: 'B50', suspected: 0, confirmed: 1, deaths: 0 }]);
  });

  test('counts ICD-11 child codes and legacy ICD-10 records under the same condition', async () => {
    const ctx = ctxWith([
      condition([{ system: KenyaIcd11System, code: '1F40.0' }]),
      condition([{ system: KenyaIcd10System, code: 'B50' }], 'provisional'),
    ]);
    const result = await aggregateConditionsForWeek(ctx, 'facility-1', weekStart, weekEnd);
    expect(result).toEqual([{ code: '1F40', legacyCode: 'B50', suspected: 1, confirmed: 1, deaths: 0 }]);
  });

  test('ignores refuted and entered-in-error Conditions', async () => {
    const ctx = ctxWith([
      condition([{ system: KenyaIcd11System, code: '1A00' }], 'refuted'),
      condition([{ system: KenyaIcd11System, code: '1A00' }], 'entered-in-error'),
    ]);
    expect(await aggregateConditionsForWeek(ctx, 'facility-1', weekStart, weekEnd)).toEqual([]);
  });
});
