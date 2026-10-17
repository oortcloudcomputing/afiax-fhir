// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { NextConfig } from 'next';

function normalizeAllowedDevOrigin(value: string): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return undefined;
  }

  if (trimmed.includes('*')) {
    return trimmed;
  }

  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`http://${trimmed}`).hostname.toLowerCase();
    } catch {
      return trimmed;
    }
  }
}

function parseAllowedDevOrigins(envValue: string | undefined): string[] | undefined {
  if (!envValue) {
    return undefined;
  }

  const values = envValue
    .split(',')
    .map(normalizeAllowedDevOrigin)
    .filter((value): value is string => Boolean(value));

  return values.length ? [...new Set(values)] : undefined;
}

const allowedDevOrigins = parseAllowedDevOrigins(process.env.WEBSITE_ALLOWED_DEV_ORIGINS);

const nextConfig: NextConfig = {
  allowedDevOrigins,
  poweredByHeader: false,
  reactStrictMode: true,
  experimental: {
    webpackBuildWorker: false,
  },
};

export default nextConfig;
