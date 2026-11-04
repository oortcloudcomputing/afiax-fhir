// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaIcd11System } from './kenya';
import {
  assessKenyaIhrEvent,
  findKenyaIhrCondition,
  getNextKenyaIhrEscalationStage,
  KenyaIhrConditions,
} from './kenya-ihr';

function icd11(code: string): { coding: { system: string; code: string }[] } {
  return { coding: [{ system: KenyaIcd11System, code }] };
}

describe('Kenya IHR', () => {
  test('Table codes are valid and unique', () => {
    const codes = KenyaIhrConditions.map((c) => c.icd11);
    expect(new Set(codes).size).toBe(codes.length);
  });

  test('Finds Annex 2 diseases by ICD-11, including child codes', () => {
    expect(findKenyaIhrCondition(icd11('1E70'))?.category).toBe('always-notifiable');
    expect(findKenyaIhrCondition(icd11('1D65'))?.category).toBe('always-notifiable');
    expect(findKenyaIhrCondition(icd11('RA01.0'))).toMatchObject({ icd11: 'RA01', category: 'decision-instrument' });
    expect(findKenyaIhrCondition(icd11('1B93.2'))?.display).toBe('Pneumonic plague');
  });

  test('Ignores non-IHR codes, other systems and other plague forms', () => {
    expect(findKenyaIhrCondition(icd11('CA04'))).toBeUndefined();
    expect(findKenyaIhrCondition(icd11('1B93.0'))).toBeUndefined(); // bubonic plague is not on Annex 2
    expect(findKenyaIhrCondition({ coding: [{ system: 'http://hl7.org/fhir/sid/icd-10', code: 'U07.1' }] })).toBe(
      undefined
    );
    expect(findKenyaIhrCondition(undefined)).toBeUndefined();
  });

  test('Always-notifiable diseases are notifiable with no answers', () => {
    const decision = assessKenyaIhrEvent('always-notifiable', {});
    expect(decision.notifiable).toBe(true);
    expect(decision.rationale).toContain('always');
  });

  test('Decision instrument needs at least two "yes" answers', () => {
    expect(assessKenyaIhrEvent('decision-instrument', { seriousImpact: true }).notifiable).toBe(false);

    // DHA REP-IHR-001 test case: novel coronavirus
    const decision = assessKenyaIhrEvent('decision-instrument', {
      seriousImpact: true,
      unusualOrUnexpected: true,
      internationalSpread: true,
      travelOrTradeRestrictions: false,
    });
    expect(decision.notifiable).toBe(true);
    expect(decision.yesCount).toBe(3);
    expect(decision.rationale).toContain('3 of 4');
    expect(decision.rationale).toContain('24 hours');

    expect(
      assessKenyaIhrEvent('other-event', { unusualOrUnexpected: true, internationalSpread: true }).notifiable
    ).toBe(true);
  });

  test('Escalation stages advance in order and stop at WHO', () => {
    expect(getNextKenyaIhrEscalationStage('awaiting-county')).toBe('county-notified');
    expect(getNextKenyaIhrEscalationStage('county-notified')).toBe('nfp-notified');
    expect(getNextKenyaIhrEscalationStage('nfp-notified')).toBe('who-notified');
    expect(getNextKenyaIhrEscalationStage('who-notified')).toBeUndefined();
    expect(getNextKenyaIhrEscalationStage('bogus')).toBeUndefined();
  });
});
