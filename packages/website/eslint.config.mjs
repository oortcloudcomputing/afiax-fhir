// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import rootConfig from '../../eslint.config.mjs';

export default [{ ignores: ['.next/**', 'next-env.d.ts'] }, ...rootConfig];
