// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  envPrefix: ['MEDPLUM_', 'GOOGLE_', 'RECAPTCHA_'],
  server: {
    port: 3000,
  },
});
