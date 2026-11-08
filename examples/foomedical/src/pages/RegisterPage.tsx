// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Anchor, Stack, Title } from '@mantine/core';
import { RegisterForm } from '@medplum/react';
import type { JSX } from 'react';
import { Link, useNavigate } from 'react-router';
import { AuthLayout } from '../components/AuthLayout';
import { MEDPLUM_GOOGLE_CLIENT_ID, MEDPLUM_PROJECT_ID, MEDPLUM_RECAPTCHA_SITE_KEY } from '../config';

export function RegisterPage(): JSX.Element {
  const navigate = useNavigate();

  if (!MEDPLUM_PROJECT_ID) {
    // Without an Afiax project to join, the server cannot create the patient account. Say so plainly.
    return (
      <AuthLayout>
        <Stack maw={450} mx="auto">
          <Title order={2}>Register with My Afiax</Title>
          <Alert color="blue" title="Sign-up is not open yet">
            Online sign-up for My Afiax is not open yet. Ask the front desk at your Afiax facility to create your
            account.{' '}
            <Anchor component={Link} to="/signin">
              Already have an account? Sign in
            </Anchor>
          </Alert>
        </Stack>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <RegisterForm
        type="patient"
        projectId={MEDPLUM_PROJECT_ID}
        googleClientId={MEDPLUM_GOOGLE_CLIENT_ID}
        recaptchaSiteKey={MEDPLUM_RECAPTCHA_SITE_KEY}
        onSuccess={() => navigate('/')?.catch(console.error)}
      >
        <h2>Register with My Afiax</h2>
      </RegisterForm>
    </AuthLayout>
  );
}
