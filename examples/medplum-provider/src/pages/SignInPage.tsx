// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Title } from '@mantine/core';
import { AfiaxIamButton, Logo, SignInForm } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

/**
 * Sign-in for clinicians and facility staff (ADR-015 section 11): "Sign in with Afiax IAM" first,
 * for every facility and any email domain; email and password below it for the accounts that
 * still have one. ?project= picks the facility (the portal's EHR tile), ?iam=1 starts Afiax IAM at
 * once, and ?login= finishes an Afiax IAM sign-in that came back here.
 * @returns The sign-in page.
 */
export function SignInPage(): JSX.Element {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project') || undefined;
  const login = searchParams.get('login') || undefined;
  return (
    <SignInForm onSuccess={() => navigate('/')?.catch(console.error)} login={login} projectId={projectId}>
      <Logo size={32} />
      <Title order={3} py="lg">
        Sign in to Afiax Provider
      </Title>
      {!login && <AfiaxIamButton projectId={projectId} autoStart={searchParams.get('iam') === '1'} />}
    </SignInForm>
  );
}
