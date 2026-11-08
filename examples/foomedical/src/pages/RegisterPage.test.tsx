// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { RegisterPage } from './RegisterPage';

test('Sign-up is closed when no Afiax project is configured', async () => {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={new MockClient()}>
          <MantineProvider>
            <RegisterPage />
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
  expect(screen.getByText('Sign-up is not open yet')).toBeInTheDocument();
  expect(screen.getByText('Already have an account? Sign in')).toBeInTheDocument();
});
