// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0

// The test transform only passes VITE_ variables through import.meta.env, so these tests check the defaults and
// the readEnv rule rather than the build-time variables themselves.
describe('My Afiax config', () => {
  test('Defaults to the Afiax FHIR server, never Medplum cloud', async () => {
    const config = await import('./config');
    expect(config.MEDPLUM_BASE_URL).toBe('https://fhir.afiax.africa/');
    expect(config.MEDPLUM_BASE_URL).not.toContain('medplum.com');
    expect(config.MEDPLUM_PROJECT_ID).toBeUndefined();
    expect(config.MEDPLUM_GOOGLE_CLIENT_ID).toBeUndefined();
    expect(config.MEDPLUM_RECAPTCHA_SITE_KEY).toBeUndefined();
  });

  test('readEnv treats blank values as unset', async () => {
    const { readEnv } = await import('./config');
    expect(readEnv(undefined)).toBeUndefined();
    expect(readEnv('   ')).toBeUndefined();
    expect(readEnv(' x ')).toBe('x');
  });
});
