// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaIcd10System, KenyaIcd11System, KenyaKhisWeeklyNotifiableConditions } from '@medplum/core';
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
      search: jest.fn(async (req: { count: number; offset?: number }) => {
        const offset = req.offset ?? 0;
        const page = conditions.slice(offset, offset + req.count);
        return { resourceType: 'Bundle', entry: page.map((resource) => ({ resource })) };
      }),
    },
  } as unknown as AuthenticatedRequestContext;
}

const distinctWeeklyCodes = new Set(KenyaKhisWeeklyNotifiableConditions.map((c) => c.icd11)).size;

function nonZero<T extends { suspected: number; confirmed: number; deaths: number }>(rows: T[]): T[] {
  return rows.filter((r) => r.suspected || r.confirmed || r.deaths);
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
    expect(nonZero(result)).toEqual([{ code: '1F40', legacyCode: 'B50', suspected: 0, confirmed: 1, deaths: 0 }]);
  });

  test('counts ICD-11 child codes and legacy ICD-10 records under the same condition', async () => {
    const ctx = ctxWith([
      condition([{ system: KenyaIcd11System, code: '1F40.0' }]),
      condition([{ system: KenyaIcd10System, code: 'B50' }], 'provisional'),
    ]);
    const result = await aggregateConditionsForWeek(ctx, 'facility-1', weekStart, weekEnd);
    expect(nonZero(result)).toEqual([{ code: '1F40', legacyCode: 'B50', suspected: 1, confirmed: 1, deaths: 0 }]);
  });

  test('ignores refuted and entered-in-error Conditions', async () => {
    const ctx = ctxWith([
      condition([{ system: KenyaIcd11System, code: '1A00' }], 'refuted'),
      condition([{ system: KenyaIcd11System, code: '1A00' }], 'entered-in-error'),
    ]);
    expect(nonZero(await aggregateConditionsForWeek(ctx, 'facility-1', weekStart, weekEnd))).toEqual([]);
  });

  test('reports zero for every weekly condition with no cases', async () => {
    const result = await aggregateConditionsForWeek(ctxWith([]), 'facility-1', weekStart, weekEnd);
    expect(result).toHaveLength(distinctWeeklyCodes);
    expect(result.every((r) => r.suspected === 0 && r.confirmed === 0 && r.deaths === 0)).toBe(true);
  });

  test('counts every page of a busy week', async () => {
    const many = Array.from({ length: 2500 }, () => condition([{ system: KenyaIcd11System, code: 'CA40' }]));
    const ctx = ctxWith(many);
    const result = await aggregateConditionsForWeek(ctx, 'facility-1', weekStart, weekEnd);
    expect(result.find((r) => r.code === 'CA40')?.confirmed).toBe(2500);
    expect(ctx.repo.search).toHaveBeenCalledTimes(3);
  });

  test('fails instead of under-counting beyond the search offset limit', async () => {
    const many = Array.from({ length: 12_000 }, () => condition([{ system: KenyaIcd11System, code: 'CA40' }]));
    await expect(aggregateConditionsForWeek(ctxWith(many), 'facility-1', weekStart, weekEnd)).rejects.toThrow(
      'weekly counts would be incomplete'
    );
  });
});
