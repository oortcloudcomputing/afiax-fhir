// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  getKenyaKhisCredentialMode,
  getKenyaKhisDataElementMapping,
  getKenyaKhisMoh505DataSetUid,
  KenyaKhisBaseUrls,
  KenyaKhisSecretNames,
  normalizeErrorString,
} from '@medplum/core';
import type { Project } from '@medplum/fhirtypes';
import fetch from 'node-fetch';

export interface KhisCredentials extends KhisConnection {
  readonly moh505DataSetUid: string;
  readonly dataElementMapping: Record<string, { suspected?: string; confirmed?: string; deaths?: string }>;
}

// DHIS2 data value interfaces
export interface KhisDataValue {
  readonly dataElement: string;
  readonly value: string | number;
}

export interface KhisDataValueSet {
  readonly dataSet: string;
  readonly period: string;
  readonly orgUnit: string;
  readonly dataValues: KhisDataValue[];
}

export interface KhisImportSummary {
  readonly status: string;
  readonly importCount?: {
    readonly imported?: number;
    readonly updated?: number;
    readonly ignored?: number;
    readonly deleted?: number;
  };
  readonly description?: string;
  readonly conflicts?: { readonly object?: string; readonly value?: string }[];
}

// Per-condition aggregate counts collected from FHIR Condition resources
export interface KhisConditionAggregate {
  /** ICD-11 MMS code of the KHIS weekly table entry. */
  readonly code: string;
  /** ICD-10 code of the same entry; used when a project's data element mapping is still keyed by ICD-10. */
  readonly legacyCode?: string;
  readonly suspected: number;
  readonly confirmed: number;
  readonly deaths: number;
}

function getProjectSecretValue(project: Project, name: string): string | undefined {
  return (
    project.secret?.find((s) => s.name === name)?.valueString ??
    project.systemSecret?.find((s) => s.name === name)?.valueString
  );
}

/** KHIS (DHIS2) API connection details. */
export interface KhisConnection {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
}

/**
 * Returns the KHIS API connection for a project.
 * @param project - The project, with its secrets.
 * @returns The connection.
 * @throws If the username or password is not configured.
 */
export function getKhisConnection(project: Project): KhisConnection {
  const credentialMode = getKenyaKhisCredentialMode(project);
  const envKey = getKhisBaseUrlKey(project);

  const baseUrl = getProjectSecretValue(project, KenyaKhisSecretNames.baseUrl) ?? KenyaKhisBaseUrls[envKey];

  const username = getProjectSecretValue(project, KenyaKhisSecretNames.username);
  const password = getProjectSecretValue(project, KenyaKhisSecretNames.password);

  if (!username || !password) {
    const source = credentialMode === 'afiax-managed' ? 'Project.systemSecret' : 'Project.secret';
    throw new Error(
      `KHIS credentials (${KenyaKhisSecretNames.username}, ${KenyaKhisSecretNames.password}) not found in ${source}.`
    );
  }
  return { baseUrl, username, password };
}

export function getKhisCredentials(project: Project): KhisCredentials {
  const connection = getKhisConnection(project);

  const moh505DataSetUid = getKenyaKhisMoh505DataSetUid(project) ?? '';
  if (!moh505DataSetUid) {
    throw new Error(
      `KHIS MOH 505 dataset UID not configured. Set Project.setting.kenyaKhisMoh505DataSetUid to the DHIS2 dataset UID obtained from your KHIS administrator.`
    );
  }

  const dataElementMapping = getKenyaKhisDataElementMapping(project) ?? {};

  return { ...connection, moh505DataSetUid, dataElementMapping };
}

function getKhisBaseUrlKey(project: Project): 'uat' | 'production' {
  const env = project.setting?.find((s) => s.name === 'kenyaKhisEnvironment')?.valueString;
  return env === 'production' ? 'production' : 'uat';
}

export function buildKhisDataValueSet(
  credentials: KhisCredentials,
  period: string,
  orgUnit: string,
  aggregates: KhisConditionAggregate[]
): KhisDataValueSet {
  const dataValues: KhisDataValue[] = [];

  for (const agg of aggregates) {
    const mapping =
      credentials.dataElementMapping[agg.code] ??
      (agg.legacyCode ? credentials.dataElementMapping[agg.legacyCode] : undefined);
    if (!mapping) {
      continue;
    }
    if (mapping.suspected) {
      dataValues.push({ dataElement: mapping.suspected, value: agg.suspected });
    }
    if (mapping.confirmed) {
      dataValues.push({ dataElement: mapping.confirmed, value: agg.confirmed });
    }
    if (mapping.deaths) {
      dataValues.push({ dataElement: mapping.deaths, value: agg.deaths });
    }
  }

  return {
    dataSet: credentials.moh505DataSetUid,
    period,
    orgUnit,
    dataValues,
  };
}

export async function pushKhisDataValueSet(
  credentials: KhisCredentials,
  payload: KhisDataValueSet
): Promise<KhisImportSummary> {
  const url = `${credentials.baseUrl.replace(/\/$/, '')}/api/dataValueSets`;
  const authHeader = `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`;

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    throw new Error(`KHIS API request failed: ${normalizeErrorString(err)}`);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    const text = await response.text().catch(() => '');
    throw new Error(`KHIS API returned non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  if (!response.ok) {
    const summary = isKhisImportSummary(body) ? body : undefined;
    throw new Error(
      `KHIS API returned HTTP ${response.status}: ${summary?.description ?? JSON.stringify(body).slice(0, 200)}`
    );
  }

  if (!isKhisImportSummary(body)) {
    throw new Error(`KHIS API returned unexpected response shape: ${JSON.stringify(body).slice(0, 200)}`);
  }

  return body;
}

function isKhisImportSummary(value: unknown): value is KhisImportSummary {
  return !!value && typeof value === 'object' && 'status' in (value as Record<string, unknown>);
}

/** A DHIS2 tracker event (program without registration). */
export interface KhisTrackerEvent {
  readonly program: string;
  readonly programStage?: string;
  readonly orgUnit: string;
  readonly occurredAt: string;
  readonly status: 'ACTIVE' | 'COMPLETED';
  readonly dataValues: KhisDataValue[];
}

/** The DHIS2 confirmation for a submitted event. */
export interface KhisEventConfirmation {
  readonly status: string;
  readonly eventUid?: string;
}

/**
 * Submits one event to the KHIS DHIS2 tracker API (synchronous import) and returns DHIS2's
 * confirmation, including the UID DHIS2 assigned to the event.
 * @param connection - The KHIS connection.
 * @param event - The event.
 * @returns The confirmation.
 * @throws If the request fails or DHIS2 rejects the event.
 */
export async function pushKhisTrackerEvent(
  connection: KhisConnection,
  event: KhisTrackerEvent
): Promise<KhisEventConfirmation> {
  const url = `${connection.baseUrl.replace(/\/$/, '')}/api/tracker?async=false&importStrategy=CREATE`;
  const authHeader = `Basic ${Buffer.from(`${connection.username}:${connection.password}`).toString('base64')}`;

  let response: Awaited<ReturnType<typeof fetch>>;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authHeader, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ events: [event] }),
    });
  } catch (err) {
    throw new Error(`KHIS API request failed: ${normalizeErrorString(err)}`);
  }

  const text = await response.text().catch(() => '');
  let body: TrackerImportReport | undefined;
  try {
    body = JSON.parse(text) as TrackerImportReport;
  } catch {
    throw new Error(`KHIS API returned non-JSON response (HTTP ${response.status}): ${text.slice(0, 200)}`);
  }

  const errors = body?.validationReport?.errorReports ?? [];
  if (!response.ok || body?.status === 'ERROR' || errors.length > 0) {
    const detail = errors.map((e) => e.message).join('; ') || body?.message || text.slice(0, 200);
    throw new Error(`KHIS rejected the event (HTTP ${response.status}): ${detail}`);
  }

  const eventUid = body?.bundleReport?.typeReportMap?.EVENT?.objectReports?.[0]?.uid;
  return { status: body?.status ?? 'OK', eventUid };
}

interface TrackerImportReport {
  readonly status?: string;
  readonly message?: string;
  readonly validationReport?: { readonly errorReports?: { readonly message?: string }[] };
  readonly bundleReport?: {
    readonly typeReportMap?: {
      readonly EVENT?: { readonly objectReports?: { readonly uid?: string }[] };
    };
  };
}
