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

const mfl = (code: string): { system: string; value: string }[] => [
  { system: 'https://afiax.africa/kenya/identifier/mfl-code', value: code },
];
const facility1 = { resourceType: 'Organization', id: 'facility-1', identifier: mfl('10001') };
const facility2 = { resourceType: 'Organization', id: 'facility-2', identifier: mfl('10002') };

function ctxWith(conditions: Condition[], facilities: object[] = [facility1]): AuthenticatedRequestContext {
  return {
    project: { resourceType: 'Project', id: 'project-1' },
    systemRepo: {
      searchResources: jest.fn(async () => facilities),
      readReference: jest.fn(async ({ reference }: { reference: string }) => {
        if (reference.startsWith('Encounter/')) {
          // Encounter/at-facility-2 -> serviceProvider Organization/facility-2
          return { resourceType: 'Encounter', serviceProvider: { reference: `Organization/${reference.slice(22)}` } };
        }
        return {
          resourceType: 'Patient',
          id: reference.split('/')[1],
          ...(reference === 'Patient/died' ? { deceasedBoolean: true } : {}),
        };
      }),
    },
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

  test('counts a case as a death when the patient has died, and filters by project', async () => {
    const died: Condition = {
      ...condition([{ system: 'http://id.who.int/icd/release/11/mms', code: '1A00' }]),
      subject: { reference: 'Patient/died' },
    };
    const alive = condition([{ system: 'http://id.who.int/icd/release/11/mms', code: '1A00' }]);
    const ctx = ctxWith([died, alive]);
    const [cholera] = nonZero(await aggregateConditionsForWeek(ctx, 'facility-1', weekStart, weekEnd));
    expect(cholera).toMatchObject({ code: '1A00', deaths: 1 });
    expect((ctx.repo.search as jest.Mock).mock.calls[0][0].filters[0]).toMatchObject({
      code: '_project',
      value: 'project-1',
    });
  });

  test('with several facilities, counts each case under its encounter facility only', async () => {
    const cholera = [{ system: KenyaIcd11System, code: '1A00' }];
    const atFacility1 = { ...condition(cholera), encounter: { reference: 'Encounter/at-facility-facility-1' } };
    const atFacility2 = { ...condition(cholera), encounter: { reference: 'Encounter/at-facility-facility-2' } };
    const noEncounter = condition(cholera);
    const ctx = ctxWith([atFacility1, atFacility2, atFacility2, noEncounter], [facility1, facility2]);

    const stats = { unattributed: 0 };
    const f1 = nonZero(await aggregateConditionsForWeek(ctx, 'facility-1', weekStart, weekEnd, undefined, stats));
    expect(f1).toEqual([expect.objectContaining({ code: '1A00', confirmed: 1 })]);
    expect(stats.unattributed).toBe(1);

    const f2 = nonZero(await aggregateConditionsForWeek(ctx, 'facility-2', weekStart, weekEnd));
    expect(f2).toEqual([expect.objectContaining({ code: '1A00', confirmed: 2 })]);
  });

  test('with one facility, cases without an encounter count under it', async () => {
    const ctx = ctxWith([condition([{ system: KenyaIcd11System, code: '1A00' }])]);
    const stats = { unattributed: 0 };
    const rows = nonZero(await aggregateConditionsForWeek(ctx, 'facility-1', weekStart, weekEnd, undefined, stats));
    expect(rows).toEqual([expect.objectContaining({ code: '1A00', confirmed: 1 })]);
    expect(stats.unattributed).toBe(0);
  });

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
