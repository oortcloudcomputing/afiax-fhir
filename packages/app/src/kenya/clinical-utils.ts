// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { KenyaCdsAlert, KenyaCdsCategory, KenyaCdsSeverity } from '@medplum/core';
import type { Observation, Parameters } from '@medplum/fhirtypes';

/**
 * Reads the alerts returned by MedicationRequest/$cds-check.
 * @param result - The operation result.
 * @returns The alerts.
 */
export function parseCdsAlerts(result: Parameters): KenyaCdsAlert[] {
  return (result.parameter ?? [])
    .filter((p) => p.name === 'alert')
    .map((p) => {
      const part = (name: string): string =>
        p.part?.find((x) => x.name === name)?.valueString ?? p.part?.find((x) => x.name === name)?.valueCode ?? '';
      return {
        id: part('id'),
        severity: part('severity') as KenyaCdsSeverity,
        category: part('category') as KenyaCdsCategory,
        title: part('title'),
        detail: part('detail'),
        recommendation: part('recommendation'),
        evidence: part('evidence'),
        implicated: (p.part ?? []).filter((x) => x.name === 'implicated').map((x) => x.valueReference?.reference ?? ''),
      };
    });
}

export interface GrowthPoint {
  readonly time: number;
  readonly value: number;
}

/**
 * Returns the points of one measurement, oldest first.
 * @param observations - The observations.
 * @param loinc - The LOINC code.
 * @returns The points.
 */
export function getGrowthPoints(observations: readonly Observation[], loinc: string): GrowthPoint[] {
  return observations
    .filter((o) => o.status !== 'entered-in-error' && o.code?.coding?.some((c) => c.code === loinc))
    .map((o) => ({
      time: new Date(o.effectiveDateTime ?? o.issued ?? o.meta?.lastUpdated ?? 0).getTime(),
      value: o.valueQuantity?.value as number,
    }))
    .filter((p) => typeof p.value === 'number' && p.time > 0)
    .sort((a, b) => a.time - b.time);
}
