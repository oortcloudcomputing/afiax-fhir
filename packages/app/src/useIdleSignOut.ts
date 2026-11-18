// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { getConfig } from './config';

// The admin app's idle sign-out (change register 1.7): @medplum/react's IdleSignOut does the work,
// warning a minute before and signing out of Afiax IAM too (ADR-015 section 11)
export const DEFAULT_IDLE_TIMEOUT_MINUTES = 15;

export function getIdleTimeoutMs(): number {
  const configured = Number(getConfig().idleTimeoutMinutes);
  const minutes = Number.isFinite(configured) && configured >= 0 ? configured : DEFAULT_IDLE_TIMEOUT_MINUTES;
  return minutes * 60_000;
}
