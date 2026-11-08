// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SignInForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { AuthLayout } from '../components/AuthLayout';
import { MEDPLUM_GOOGLE_CLIENT_ID, MEDPLUM_PROJECT_ID } from '../config';

export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <AuthLayout>
      <SignInForm
        projectId={MEDPLUM_PROJECT_ID}
        googleClientId={MEDPLUM_GOOGLE_CLIENT_ID}
        onSuccess={() => navigate('/')?.catch(console.error)}
      >
        <h2>Sign in to My Afiax</h2>
      </SignInForm>
    </AuthLayout>
  );
}
