// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type {
  AllergyIntolerance,
  CodeableConcept,
  Condition,
  MedicationRequest,
  Observation,
} from '@medplum/fhirtypes';
import { KenyaAllergyCodeSystem, KenyaHealthProductSystem, KenyaIcd11System } from './kenya';
import {
  checkKenyaMedicationOrder,
  checkKenyaObservation,
  checkKenyaResultAgainstMedications,
  getKenyaCdsOverrideReason,
  KenyaCdsOverrideExtensionUrl,
} from './kenya-cds';

const hpt = (code: string, display: string): CodeableConcept => ({
  coding: [{ system: KenyaHealthProductSystem, code, display }],
});

const amoxicillin = hpt('PH12907', 'Amoxicillin 500 mg Oral Capsule');
const ceftriaxone = hpt('AC11636', 'Ceftriaxone');
const ibuprofen = hpt('AC11019', 'Ibuprofen');
const cotrimoxazole = hpt('AC12372', 'Sulfamethoxazole/Trimethoprim');

const penicillinAllergy: AllergyIntolerance = {
  resourceType: 'AllergyIntolerance',
  id: 'pen',
  patient: { reference: 'Patient/p' },
  criticality: 'high',
  code: {
    coding: [{ system: KenyaAllergyCodeSystem, code: 'ORG-00001-CPT-0002015', display: 'Allergy to penicillin' }],
  },
};

function medication(
  concept: CodeableConcept,
  id = 'm1',
  status: MedicationRequest['status'] = 'active'
): MedicationRequest {
  return {
    resourceType: 'MedicationRequest',
    id,
    status,
    intent: 'order',
    subject: { reference: 'Patient/p' },
    medicationCodeableConcept: concept,
  };
}

function condition(code: string, display: string, clinical = 'active'): Condition {
  return {
    resourceType: 'Condition',
    id: code,
    subject: { reference: 'Patient/p' },
    clinicalStatus: { coding: [{ code: clinical }] },
    code: { coding: [{ system: KenyaIcd11System, code, display }] },
  };
}

function lab(loinc: string, value: number, unit: string, id = 'o1', effective = '2026-11-01'): Observation {
  return {
    resourceType: 'Observation',
    id,
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: loinc }] },
    effectiveDateTime: effective,
    valueQuantity: { value, unit, code: unit, system: 'http://unitsofmeasure.org' },
  };
}

describe('checkKenyaMedicationOrder', () => {
  test('penicillin allergy blocks amoxicillin (DHA FUNC-MED-001 test scenario)', () => {
    const alerts = checkKenyaMedicationOrder(amoxicillin, { allergies: [penicillinAllergy] });
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ severity: 'high', category: 'allergy', implicated: ['AllergyIntolerance/pen'] });
    expect(alerts[0].detail).toContain('high criticality');
  });

  test('penicillin allergy warns of cephalosporin cross-reactivity', () => {
    const alerts = checkKenyaMedicationOrder(ceftriaxone, { allergies: [penicillinAllergy] });
    expect(alerts).toEqual([expect.objectContaining({ severity: 'moderate', category: 'allergy' })]);
  });

  test('allergy matched through a reaction substance, and resolved allergies ignored', () => {
    const sulfa: AllergyIntolerance = {
      resourceType: 'AllergyIntolerance',
      patient: { reference: 'Patient/p' },
      code: { text: 'Drug allergy' },
      reaction: [{ substance: { text: 'Sulfa drugs' }, manifestation: [{ text: 'Rash' }] }],
    };
    expect(checkKenyaMedicationOrder(cotrimoxazole, { allergies: [sulfa] })[0]?.category).toBe('allergy');

    const resolved = { ...penicillinAllergy, clinicalStatus: { coding: [{ code: 'resolved' }] } };
    expect(checkKenyaMedicationOrder(amoxicillin, { allergies: [resolved] })).toEqual([]);
  });

  test('no alerts for an unrelated medicine', () => {
    expect(checkKenyaMedicationOrder(hpt('AC10001', 'Metformin'), { allergies: [penicillinAllergy] })).toEqual([]);
  });

  test('drug-drug interaction: warfarin and ibuprofen', () => {
    const alerts = checkKenyaMedicationOrder(ibuprofen, { medications: [medication(hpt('AC10255', 'Warfarin'))] });
    expect(alerts).toEqual([
      expect.objectContaining({
        id: 'interaction:warfarin+nsaids',
        severity: 'high',
        implicated: ['MedicationRequest/m1'],
      }),
    ]);
    expect(alerts[0].evidence).toContain('BNF');
  });

  test('interaction in either order, and stopped medicines are ignored', () => {
    const onRifampicin = [medication(hpt('AC12354', 'Ethambutol/Isoniazid/Pyrazinamide/Rifampicin'))];
    const tld = hpt('AC12206', 'Dolutegravir/Lamivudine/Tenofovir');
    expect(checkKenyaMedicationOrder(tld, { medications: onRifampicin })[0]).toMatchObject({
      id: 'interaction:rifampicin+dolutegravir',
    });
    const stopped = [medication(hpt('AC12354', 'Rifampicin'), 'm2', 'stopped')];
    expect(checkKenyaMedicationOrder(tld, { medications: stopped })).toEqual([]);
  });

  test('duplicate therapy, but not against the order itself', () => {
    const current = medication(hpt('AC10678', 'Amoxicillin'), 'm1');
    expect(checkKenyaMedicationOrder(amoxicillin, { medications: [current] })[0]?.category).toBe('duplicate-therapy');
    expect(checkKenyaMedicationOrder(amoxicillin, { medications: [current] }, 'm1')).toEqual([]);
  });

  test('problem list: NSAID with peptic ulcer, beta-blocker with asthma', () => {
    expect(
      checkKenyaMedicationOrder(ibuprofen, { conditions: [condition('DA63', 'Duodenal ulcer')] })[0]
    ).toMatchObject({
      category: 'drug-condition',
      severity: 'high',
    });
    expect(
      checkKenyaMedicationOrder(hpt('AC10442', 'Propranolol'), {
        conditions: [condition('CA23.0', 'Allergic asthma')],
      })[0]
    ).toMatchObject({ id: 'condition:beta-blocker-asthma' });
    expect(
      checkKenyaMedicationOrder(ibuprofen, { conditions: [condition('DA63', 'Duodenal ulcer', 'resolved')] })
    ).toEqual([]);
  });

  test('pregnancy: teratogen flagged when the problem list records pregnancy', () => {
    const alerts = checkKenyaMedicationOrder(hpt('AC10255', 'Warfarin'), {
      conditions: [condition('QA41', 'Pregnant state')],
    });
    expect(alerts[0]).toMatchObject({ category: 'drug-pregnancy', severity: 'high' });
  });

  test('demographics: aspirin in a child', () => {
    const alerts = checkKenyaMedicationOrder(hpt('AC10262', 'Acetylsalicylic Acid'), {
      patient: { resourceType: 'Patient', id: 'p', birthDate: '2020-05-01' },
      now: new Date('2026-11-04'),
    });
    expect(alerts[0]).toMatchObject({ id: 'age:aspirin-child', title: expect.stringContaining('aged 6') });
  });

  test('lab results: high potassium with an ACE inhibitor, latest result wins', () => {
    const observations = [
      lab('2823-3', 6.1, 'mmol/L', 'new', '2026-11-03'),
      lab('2823-3', 4.2, 'mmol/L', 'old', '2026-10-01'),
    ];
    const alerts = checkKenyaMedicationOrder(hpt('AC10485', 'Enalapril'), { observations });
    expect(alerts[0]).toMatchObject({ id: 'lab:potassium-high', implicated: ['Observation/new'] });

    const normalLatest = [
      lab('2823-3', 4.2, 'mmol/L', 'new', '2026-11-03'),
      lab('2823-3', 6.1, 'mmol/L', 'old', '2026-10-01'),
    ];
    expect(checkKenyaMedicationOrder(hpt('AC10485', 'Enalapril'), { observations: normalLatest })).toEqual([]);
  });

  test('alerts are sorted most severe first', () => {
    const alerts = checkKenyaMedicationOrder(amoxicillin, {
      allergies: [penicillinAllergy],
      medications: [medication(hpt('AC10678', 'Amoxicillin'))],
    });
    expect(alerts.map((a) => a.severity)).toEqual(['high', 'moderate']);
  });
});

describe('checkKenyaObservation', () => {
  test('critical lab value with unit conversion', () => {
    expect(checkKenyaObservation(lab('2345-7', 40, 'mg/dL'))[0]).toMatchObject({
      id: 'critical-lab:glucose-low',
      severity: 'high',
    });
    expect(checkKenyaObservation(lab('718-7', 62, 'g/L'))[0]).toMatchObject({ id: 'critical-lab:haemoglobin-low' });
    expect(checkKenyaObservation(lab('718-7', 12.5, 'g/dL'))).toEqual([]);
  });

  test('critical vital signs, including blood pressure components', () => {
    const bp: Observation = {
      resourceType: 'Observation',
      id: 'bp',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '85354-9' }] },
      component: [
        {
          code: { coding: [{ system: 'http://loinc.org', code: '8480-6' }] },
          valueQuantity: { value: 210, code: 'mm[Hg]' },
        },
        {
          code: { coding: [{ system: 'http://loinc.org', code: '8462-4' }] },
          valueQuantity: { value: 125, code: 'mm[Hg]' },
        },
      ],
    };
    expect(checkKenyaObservation(bp).map((a) => a.id)).toEqual([
      'critical-vital:systolic-bp-high',
      'critical-vital:diastolic-bp-high',
    ]);
    expect(checkKenyaObservation(lab('59408-5', 88, '%'))[0]?.id).toBe('critical-vital:oxygen-saturation-low');
    expect(checkKenyaObservation(lab('8310-5', 103, '[degF]'))[0]?.id).toBe('critical-vital:temperature-high');
  });

  test('adult vital-sign limits are not applied to children', () => {
    const child = { resourceType: 'Patient' as const, birthDate: '2024-01-01' };
    expect(checkKenyaObservation(lab('8867-4', 140, '/min'), child, new Date('2026-11-04'))).toEqual([]);
    expect(checkKenyaObservation(lab('8867-4', 140, '/min'))).toHaveLength(1);
  });

  test('result flagged critical by the laboratory', () => {
    const flagged: Observation = {
      ...lab('1234-5', 1, '1'),
      interpretation: [{ coding: [{ code: 'HH' }] }],
    };
    expect(checkKenyaObservation(flagged)[0]?.id).toBe('critical-lab:flagged');
  });
});

describe('checkKenyaResultAgainstMedications', () => {
  test('high INR in a patient on warfarin', () => {
    const alerts = checkKenyaResultAgainstMedications(lab('6301-6', 4.8, '{INR}'), [
      medication(hpt('AC10255', 'Warfarin')),
    ]);
    expect(alerts[0]).toMatchObject({ id: 'lab:inr-high', implicated: ['Observation/o1', 'MedicationRequest/m1'] });
  });
});

test('getKenyaCdsOverrideReason', () => {
  const request = medication(amoxicillin);
  expect(getKenyaCdsOverrideReason(request)).toBeUndefined();
  request.extension = [{ url: KenyaCdsOverrideExtensionUrl, valueString: ' Reaction was mild rash 20 years ago ' }];
  expect(getKenyaCdsOverrideReason(request)).toBe('Reaction was mild rash 20 years ago');
});
