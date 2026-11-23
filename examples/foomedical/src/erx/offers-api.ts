// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// The Afiax Prescription Network's offer flow (ADR-016 §3b), as My Afiax calls it: afiax-services
// /erx/offer-requests, with the patient's own Afiax FHIR token. The shapes mirror afiax-services
// src/erx/offers.ts (OfferRequestStatus).

export interface Position {
  readonly lat: number;
  readonly lng: number;
}

export interface RankedOffer {
  readonly offer: string;
  readonly chemistId: string;
  readonly chemistName: string;
  /** Total for everything on the request, KES. */
  readonly priceKes: number;
  readonly readyMinutes: number;
  readonly distanceKm: number;
  readonly rating?: number;
  readonly ratings?: number;
  readonly offeredAt: string;
  readonly score: number;
  readonly best: boolean;
}

export interface OfferRequestStatus {
  readonly request: string;
  readonly state: 'waiting' | 'chosen' | 'ready' | 'collected' | 'cancelled';
  readonly expiresAt?: string;
  readonly asked: number;
  readonly waiting: number;
  readonly declined: number;
  readonly offers: readonly RankedOffer[];
  /** Why the request was closed: cancelled, the chemist gave it up, a time limit passed. */
  readonly reason?: string;
  readonly chosen?: {
    readonly offer: string;
    readonly chemistName: string;
    readonly priceKes?: number;
    readonly readyMinutes?: number;
    readonly phone?: string;
    readonly status: string;
    /** Until when the chemist holds it: to be ready by, or to be collected by. */
    readonly holdUntil?: string;
  };
}

/** What the Find a chemist screen needs from afiax-services. */
export interface OfferApi {
  request(prescriptions: readonly string[], position: Position): Promise<OfferRequestStatus>;
  status(request: string): Promise<OfferRequestStatus>;
  choose(request: string, offer: string): Promise<OfferRequestStatus>;
  cancel(request: string): Promise<OfferRequestStatus>;
}

/** An answer afiax-services refused, with its own words for the patient. */
export class OfferApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = 'OfferApiError';
  }
}

/**
 * The offer API on afiax-services.
 * @param servicesUrl - afiax-services (MEDPLUM_AFIAX_SERVICES_URL).
 * @param token - The patient's current Afiax FHIR access token.
 * @param fetchFn - fetch (injected in tests).
 * @returns The API.
 */
export function servicesOfferApi(
  servicesUrl: string,
  token: () => string | undefined,
  fetchFn: typeof fetch = fetch
): OfferApi {
  const base = `${servicesUrl.replace(/\/$/, '')}/erx/offer-requests`;
  async function call(path: string, body?: unknown): Promise<OfferRequestStatus> {
    const response = await fetchFn(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token() ?? ''}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const answer = (await response.json().catch(() => undefined)) as
      | (OfferRequestStatus & { message?: string })
      | undefined;
    if (!response.ok) {
      throw new OfferApiError(
        answer?.message ?? 'Afiax is not reachable just now. Try again in a minute.',
        response.status
      );
    }
    return answer as OfferRequestStatus;
  }
  return {
    request: (prescriptions, position) => call('', { prescriptions, position }),
    status: (request) => call(`/${encodeURIComponent(request)}`),
    choose: (request, offer) => call(`/${encodeURIComponent(request)}/choose`, { offer }),
    cancel: (request) => call(`/${encodeURIComponent(request)}/cancel`, {}),
  };
}
