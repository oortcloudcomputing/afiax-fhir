// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
// Bed referrals between hospitals (ADR-018 §C): what afiax-services /beds answers, and a caller
// that signs requests with the clinician's own Afiax FHIR token.
import type { KenyaWardType } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import { useCallback } from 'react';
import { getConfig } from '../../config';

export interface Position {
  lat: number;
  lng: number;
}

export const Urgencies = { emergency: 'Emergency', urgent: 'Urgent', routine: 'Routine' } as const;
export type Urgency = keyof typeof Urgencies;
export const urgencyColor: Record<Urgency, string> = { emergency: 'red', urgent: 'orange', routine: 'blue' };

export interface HospitalOffer {
  hospital: string;
  name: string;
  distanceKm?: number;
  phone?: string;
  position?: Position;
  free: number;
  beds: Partial<Record<KenyaWardType, number>>;
  insurers: string[];
  covered?: string[];
}

export interface RecordItem {
  name: string;
  value?: string;
  flag?: string;
  at?: string;
}

export interface ClinicalRecord {
  vitals: RecordItem[];
  labs: RecordItem[];
  conditions: RecordItem[];
  medicines: RecordItem[];
  allergies: RecordItem[];
}

export interface Ambulance {
  plate: string;
  crewPhone?: string;
  dispatchedAt: string;
  position?: Position;
  at?: string;
  etaMinutes?: number;
  arrived?: string;
}

export interface Referral {
  id: string;
  direction: 'incoming' | 'sent';
  state: 'waiting' | 'accepted' | 'declined' | 'cancelled' | 'admitted' | 'expired';
  view: {
    wardType: KenyaWardType;
    wardTypeDisplay: string;
    urgency: Urgency;
    from: string;
    referrer?: string;
    patient: { gender?: string; age?: number; insurers?: string[] };
    summary: { reason: string; condition?: string; oxygen?: boolean; ventilation?: boolean };
    record?: ClinicalRecord;
  };
  to: string;
  createdAt?: string;
  reason?: string;
  bed?: { id: string; name?: string; until?: string };
  patient?: { reference: string; display?: string };
  fromPosition?: Position;
  toPosition?: Position;
  ambulance?: Ambulance;
}

export interface MyHospital {
  name: string;
  insurers: string[];
  canEdit: boolean;
  known: string[];
  position?: Position;
}

export type BedsCall = <T>(method: 'GET' | 'POST', path: string, body?: unknown) => Promise<T>;

/**
 * A caller for afiax-services /beds, or undefined when this Afiax Provider has no afiax-services
 * address.
 * @returns The caller.
 */
export function useBedsApi(): BedsCall | undefined {
  const medplum = useMedplum();
  const servicesUrl = getConfig().afiaxServicesUrl;
  const call = useCallback(
    async <T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> => {
      await medplum.refreshIfExpired();
      const res = await fetch(`${servicesUrl?.replace(/\/$/, '')}/beds/${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${medplum.getAccessToken()}`,
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = (await res.json().catch(() => ({}))) as T & { message?: string };
      if (!res.ok) {
        throw new Error(json.message ?? `Bed referrals answered ${res.status}`);
      }
      return json;
    },
    [medplum, servicesUrl]
  );
  return servicesUrl ? call : undefined;
}
