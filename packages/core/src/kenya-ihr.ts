// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// IHR (2005): International Health Regulations notification of events that may constitute a
// public health emergency of international concern (PHEIC).
//
//   IHR (2005) Article 6: notify WHO, through the National IHR Focal Point, within 24 hours of
//     assessing an event as notifiable.
//   IHR (2005) Annex 2: decision instrument. Four diseases are always notifiable on a single case;
//     a second group must always be run through the algorithm; any other event is notifiable when at
//     least two of the four Annex 2 questions are answered "yes".
//   Kenya IDSR Technical Guidelines 3rd Edition (2024): facility -> County Director of Health ->
//     National IHR Focal Point (MoH Disease Surveillance and Response Unit) -> WHO.
//
// All ICD-11 codes below were verified against KNHTS (WHO/ICD-11, MMS 2025-01).
// ICD-11 codes match hierarchically (1B93.2 also matches 1B93.20 etc.).

import type { CodeableConcept } from '@medplum/fhirtypes';
import { isIcd11CodeUnder, isKenyaIcd11CodeFormat, KenyaIcd11System } from './kenya';

/** IHR Annex 2 category of a disease or event. */
export type KenyaIhrCategory = 'always-notifiable' | 'decision-instrument' | 'other-event';

/** IHR Annex 2 table entry. */
export interface KenyaIhrCondition {
  /** ICD-11 MMS code (verified against KNHTS). */
  readonly icd11: string;
  readonly display: string;
  readonly category: Exclude<KenyaIhrCategory, 'other-event'>;
}

/** IHR Annex 2 diseases, mapped to ICD-11. */
export const KenyaIhrConditions: readonly KenyaIhrCondition[] = [
  // Annex 2, left box: a single case is always notifiable
  { icd11: '1E70', display: 'Smallpox', category: 'always-notifiable' },
  { icd11: '1C81', display: 'Poliomyelitis (wild-type poliovirus)', category: 'always-notifiable' },
  { icd11: '1E31', display: 'Human influenza caused by a new subtype', category: 'always-notifiable' },
  { icd11: '1D65', display: 'Severe acute respiratory syndrome (SARS)', category: 'always-notifiable' },
  // Annex 2, right box: always assessed with the decision instrument
  { icd11: '1A00', display: 'Cholera', category: 'decision-instrument' },
  { icd11: '1B93.2', display: 'Pneumonic plague', category: 'decision-instrument' },
  { icd11: '1D47', display: 'Yellow fever', category: 'decision-instrument' },
  { icd11: '1D60.0', display: 'Ebola disease', category: 'decision-instrument' },
  { icd11: '1D60.1', display: 'Marburg disease', category: 'decision-instrument' },
  { icd11: '1D61.2', display: 'Lassa fever', category: 'decision-instrument' },
  { icd11: '1D49', display: 'Crimean-Congo haemorrhagic fever', category: 'decision-instrument' },
  { icd11: '1D46', display: 'West Nile virus infection', category: 'decision-instrument' },
  { icd11: '1D44', display: 'Rift Valley fever', category: 'decision-instrument' },
  { icd11: '1D20', display: 'Dengue', category: 'decision-instrument' },
  { icd11: '1D21', display: 'Dengue', category: 'decision-instrument' },
  { icd11: '1D22', display: 'Dengue', category: 'decision-instrument' },
  { icd11: '1D2Z', display: 'Dengue', category: 'decision-instrument' },
  { icd11: '1C1C', display: 'Meningococcal disease', category: 'decision-instrument' },
  // Diseases of current international concern (novel coronaviruses, mpox)
  { icd11: '1D64', display: 'Middle East respiratory syndrome (MERS)', category: 'decision-instrument' },
  { icd11: 'RA01', display: 'COVID-19 / novel coronavirus', category: 'decision-instrument' },
  { icd11: '1E71', display: 'Mpox', category: 'decision-instrument' },
];

/** Answers to the four IHR Annex 2 questions. */
export interface KenyaIhrAssessmentAnswers {
  /** Is the public health impact of the event serious? */
  readonly seriousImpact?: boolean;
  /** Is the event unusual or unexpected? */
  readonly unusualOrUnexpected?: boolean;
  /** Is there a significant risk of international spread? */
  readonly internationalSpread?: boolean;
  /** Is there a significant risk of international travel or trade restrictions? */
  readonly travelOrTradeRestrictions?: boolean;
}

export const KenyaIhrQuestions: readonly { readonly key: keyof KenyaIhrAssessmentAnswers; readonly text: string }[] = [
  { key: 'seriousImpact', text: 'Is the public health impact of the event serious?' },
  { key: 'unusualOrUnexpected', text: 'Is the event unusual or unexpected?' },
  { key: 'internationalSpread', text: 'Is there a significant risk of international spread?' },
  {
    key: 'travelOrTradeRestrictions',
    text: 'Is there a significant risk of international travel or trade restrictions?',
  },
];

/** Outcome of the IHR Annex 2 decision instrument. */
export interface KenyaIhrDecision {
  readonly category: KenyaIhrCategory;
  readonly notifiable: boolean;
  readonly yesCount: number;
  readonly rationale: string;
}

/** Escalation stages for an IHR notification, in order. */
export const KenyaIhrEscalationStages = [
  { code: 'awaiting-county', display: 'Awaiting notification of the County Director of Health' },
  { code: 'county-notified', display: 'County Director of Health notified' },
  { code: 'nfp-notified', display: 'National IHR Focal Point (MoH Disease Surveillance and Response Unit) notified' },
  { code: 'who-notified', display: 'WHO notified by the National IHR Focal Point' },
] as const;

export type KenyaIhrEscalationStage = (typeof KenyaIhrEscalationStages)[number]['code'];

/** Task type system and codes for IHR work items. */
export const KenyaIhrTaskTypeSystem = 'https://afiax.africa/CodeSystem/kenya-task-type';
export const KenyaIhrAssessmentTaskCode = 'ihr-assessment';
export const KenyaIhrNotificationTaskCode = 'ihr-notification';
/** DocumentReference type for an IHR notification report. */
export const KenyaIhrReportTypeSystem = 'https://afiax.africa/CodeSystem/kenya-document-type';
export const KenyaIhrReportTypeCode = 'ihr-notification-report';

/**
 * Finds the IHR Annex 2 entry for a coded concept, matching ICD-11 codings hierarchically.
 * @param concept - The Condition.code (or any CodeableConcept).
 * @returns The IHR entry, or undefined if the concept is not an Annex 2 disease.
 */
export function findKenyaIhrCondition(concept: CodeableConcept | undefined): KenyaIhrCondition | undefined {
  for (const coding of concept?.coding ?? []) {
    const code = coding.code?.trim();
    if (!code || (coding.system && coding.system !== KenyaIcd11System) || !isKenyaIcd11CodeFormat(code)) {
      continue;
    }
    const match = KenyaIhrConditions.find((c) => isIcd11CodeUnder(code, c.icd11));
    if (match) {
      return match;
    }
  }
  return undefined;
}

/**
 * Runs the IHR (2005) Annex 2 decision instrument.
 * Always-notifiable diseases are notifiable regardless of answers. Anything else is notifiable when
 * at least two of the four questions are answered "yes".
 * @param category - The IHR category of the disease or event.
 * @param answers - Answers to the four Annex 2 questions.
 * @returns The decision with a plain-language rationale.
 */
export function assessKenyaIhrEvent(category: KenyaIhrCategory, answers: KenyaIhrAssessmentAnswers): KenyaIhrDecision {
  const yes = KenyaIhrQuestions.filter((q) => answers[q.key] === true);
  const yesCount = yes.length;
  if (category === 'always-notifiable') {
    return {
      category,
      notifiable: true,
      yesCount,
      rationale:
        'IHR (2005) Annex 2: a single case of this disease is always unusual or unexpected and is notifiable to WHO.',
    };
  }
  const notifiable = yesCount >= 2;
  const answered = yes.map((q) => q.text.replace(/^Is (the|there a) /, '').replace(/\?$/, '')).join('; ');
  return {
    category,
    notifiable,
    yesCount,
    rationale: notifiable
      ? `IHR (2005) Annex 2: ${yesCount} of 4 criteria met (${answered}). Notify WHO through the National IHR Focal Point within 24 hours.`
      : `IHR (2005) Annex 2: ${yesCount} of 4 criteria met; at least 2 are required. Not notifiable to WHO at this time; reassess if new information emerges.`,
  };
}

/**
 * Returns the next escalation stage, or undefined when WHO has already been notified.
 * @param stage - The current stage.
 * @returns The next stage.
 */
export function getNextKenyaIhrEscalationStage(stage: string | undefined): KenyaIhrEscalationStage | undefined {
  const index = KenyaIhrEscalationStages.findIndex((s) => s.code === stage);
  if (index < 0) {
    return undefined;
  }
  return KenyaIhrEscalationStages[index + 1]?.code;
}
