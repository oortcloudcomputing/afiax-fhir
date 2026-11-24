// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The bed board (ADR-018 §C), shared by the server ($kenya-bed) and Afiax Provider: wards and beds
// are Locations. A ward has location kind "ward" and a ward type; a bed has kind "bed", is part of
// its ward, and its state is operationalStatus (v2-0116).
import type { Location, Reference } from '@medplum/fhirtypes';
import type { WithId } from './utils';
import { createReference } from './utils';

export const KenyaLocationKindSystem = 'https://afiax.africa/fhir/CodeSystem/location-kind';
export const KenyaWardTypeSystem = 'https://afiax.africa/fhir/CodeSystem/ward-type';
export const KenyaBedStatusSystem = 'http://terminology.hl7.org/CodeSystem/v2-0116';

export const KenyaWardTypes = {
  icu: 'ICU',
  hdu: 'HDU',
  general: 'General ward',
  maternity: 'Maternity',
  paediatric: 'Paediatric',
  isolation: 'Isolation',
} as const;
export type KenyaWardType = keyof typeof KenyaWardTypes;

/** U free, O occupied, H being cleaned, C closed. */
export type KenyaBedState = 'U' | 'O' | 'H' | 'C';
export const KenyaBedStateDisplay: Record<KenyaBedState, string> = {
  U: 'Unoccupied',
  O: 'Occupied',
  H: 'Housekeeping',
  C: 'Closed',
};

/**
 * Whether a Location is a ward or a bed on the bed board.
 * @param l - The Location.
 * @param kind - ward or bed.
 * @returns True when it is that kind.
 */
export function isKenyaLocationKind(l: Location, kind: 'ward' | 'bed'): boolean {
  return !!l.type?.some((t) => t.coding?.some((c) => c.system === KenyaLocationKindSystem && c.code === kind));
}

/**
 * A bed's state; a bed with none recorded is free.
 * @param bed - The bed.
 * @returns U (free), O (occupied), H (being cleaned) or C (closed).
 */
export function getKenyaBedState(bed: Location): KenyaBedState {
  const code = bed.operationalStatus?.system === KenyaBedStatusSystem ? bed.operationalStatus.code : undefined;
  return code === 'O' || code === 'H' || code === 'C' ? code : 'U';
}

/**
 * A ward's type (ICU, general and so on).
 * @param ward - The ward.
 * @returns The ward type code, or undefined.
 */
export function getKenyaWardType(ward: Location): KenyaWardType | undefined {
  const code = ward.type?.flatMap((t) => t.coding ?? []).find((c) => c.system === KenyaWardTypeSystem)?.code;
  return code && code in KenyaWardTypes ? (code as KenyaWardType) : undefined;
}

/**
 * A new ward (no id).
 * @param name - What staff call it ("ICU 1", "Female medical ward").
 * @param wardType - ICU, HDU, general and so on.
 * @param partOf - The facility's Location, if the project has more than one.
 * @returns The Location.
 */
export function buildKenyaWard(name: string, wardType: KenyaWardType, partOf?: Reference<Location>): Location {
  return {
    resourceType: 'Location',
    status: 'active',
    mode: 'instance',
    name,
    type: [
      { coding: [{ system: KenyaLocationKindSystem, code: 'ward', display: 'Ward' }] },
      { coding: [{ system: KenyaWardTypeSystem, code: wardType, display: KenyaWardTypes[wardType] }] },
    ],
    physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'wa', display: 'Ward' }] },
    partOf,
  };
}

/**
 * A new bed in a ward (no id), free.
 * @param name - The bed's label ("Bed 3").
 * @param ward - Its ward.
 * @returns The Location.
 */
export function buildKenyaBed(name: string, ward: WithId<Location>): Location {
  return {
    resourceType: 'Location',
    status: 'active',
    mode: 'instance',
    name,
    type: [{ coding: [{ system: KenyaLocationKindSystem, code: 'bed', display: 'Bed' }] }],
    physicalType: { coding: [{ system: 'http://terminology.hl7.org/CodeSystem/location-physical-type', code: 'bd', display: 'Bed' }] },
    operationalStatus: { system: KenyaBedStatusSystem, code: 'U', display: KenyaBedStateDisplay.U },
    partOf: createReference(ward),
  };
}
