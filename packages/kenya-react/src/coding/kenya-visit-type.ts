// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaEncounterTypes, KenyaEncounterTypeSystem } from '@medplum/core';
import type { CodeableConcept } from '@medplum/fhirtypes';

/**
 * Returns the Encounter.type for a KNHTS visit type (healthcare facility encounter types, MOH-KENYA
 * ORG-00001-SRC-027).
 * @param code - The visit type code, e.g. OPD-VISIT.
 * @returns The CodeableConcept, or undefined for an unknown code.
 */
export function getKenyaVisitType(code: string | null | undefined): CodeableConcept | undefined {
  const type = KenyaEncounterTypes.find((t) => t.code === code);
  return type ? { coding: [{ system: KenyaEncounterTypeSystem, ...type }], text: type.display } : undefined;
}
