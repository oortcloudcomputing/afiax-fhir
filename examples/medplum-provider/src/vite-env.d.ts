// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MEDPLUM_BASE_URL?: string;
  readonly MEDPLUM_CLIENT_ID?: string;
  readonly MEDPLUM_ADMIN_APP_URL?: string;
}
