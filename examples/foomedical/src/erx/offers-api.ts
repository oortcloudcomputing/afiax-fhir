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
  /** The stars the patient gave the chemist, once rated. */
  readonly rated?: number;
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

/** A written review, as every patient sees it ("Verified patient", never a name). */
export interface Review {
  readonly id: string;
  readonly stars: number;
  readonly text: string;
  readonly at: string;
}

/** What the Find a chemist screen needs from afiax-services. */
export interface OfferApi {
  request(prescriptions: readonly string[], position: Position): Promise<OfferRequestStatus>;
  status(request: string): Promise<OfferRequestStatus>;
  choose(request: string, offer: string): Promise<OfferRequestStatus>;
  cancel(request: string): Promise<OfferRequestStatus>;
  rate(request: string, stars: number, comment?: string): Promise<OfferRequestStatus>;
  /** A chemist's latest written reviews (newest first). */
  reviews(chemistId: string): Promise<Review[]>;
  report(reviewId: string, reason?: string): Promise<{ hidden: boolean }>;
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
  const root = `${servicesUrl.replace(/\/$/, '')}/erx`;
  async function call<T = OfferRequestStatus>(path: string, body?: unknown): Promise<T> {
    const response = await fetchFn(`${root}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token() ?? ''}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const answer = (await response.json().catch(() => undefined)) as (T & { message?: string }) | undefined;
    if (!response.ok) {
      throw new OfferApiError(
        answer?.message ?? 'Afiax is not reachable just now. Try again in a minute.',
        response.status
      );
    }
    return answer as T;
  }
  const request = (id: string): string => `/offer-requests/${encodeURIComponent(id)}`;
  return {
    request: (prescriptions, position) => call('/offer-requests', { prescriptions, position }),
    status: (id) => call(request(id)),
    choose: (id, offer) => call(`${request(id)}/choose`, { offer }),
    cancel: (id) => call(`${request(id)}/cancel`, {}),
    rate: (id, stars, comment) => call(`${request(id)}/rate`, { stars, comment }),
    reviews: (chemistId) => call<Review[]>(`/chemists/${encodeURIComponent(chemistId)}/reviews`),
    report: (reviewId, reason) =>
      call<{ hidden: boolean }>(`/reviews/${encodeURIComponent(reviewId)}/report`, { reason }),
  };
}
