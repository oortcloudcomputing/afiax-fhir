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

export interface KhisCredentials {
  readonly baseUrl: string;
  readonly username: string;
  readonly password: string;
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
  readonly conflicts?: Array<{ readonly object?: string; readonly value?: string }>;
}

// Per-condition aggregate counts collected from FHIR Condition resources
export interface KhisConditionAggregate {
  readonly code: string;
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

export function getKhisCredentials(project: Project): KhisCredentials {
  const credentialMode = getKenyaKhisCredentialMode(project);
  const envKey = getKhisBaseUrlKey(project);

  const baseUrl =
    getProjectSecretValue(project, KenyaKhisSecretNames.baseUrl) ??
    KenyaKhisBaseUrls[envKey];

  const username = getProjectSecretValue(project, KenyaKhisSecretNames.username);
  const password = getProjectSecretValue(project, KenyaKhisSecretNames.password);

  if (!username || !password) {
    const source = credentialMode === 'afiax-managed' ? 'Project.systemSecret' : 'Project.secret';
    throw new Error(
      `KHIS credentials (${KenyaKhisSecretNames.username}, ${KenyaKhisSecretNames.password}) not found in ${source}.`
    );
  }

  const moh505DataSetUid = getKenyaKhisMoh505DataSetUid(project) ?? '';
  if (!moh505DataSetUid) {
    throw new Error(
      `KHIS MOH 505 dataset UID not configured. Set Project.setting.kenyaKhisMoh505DataSetUid to the DHIS2 dataset UID obtained from your KHIS administrator.`
    );
  }

  const dataElementMapping = getKenyaKhisDataElementMapping(project) ?? {};

  return { baseUrl, username, password, moh505DataSetUid, dataElementMapping };
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
    const mapping = credentials.dataElementMapping[agg.code];
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
