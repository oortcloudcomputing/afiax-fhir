// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '../../test-utils/render';
import { GetStartedPage } from './GetStartedPage';

function setup(medplum: MockClient): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <GetStartedPage />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('GetStartedPage', () => {
  test('Afiax first steps, with no Medplum branding', () => {
    setup(new MockClient());
    expect(screen.getByText('Get started with Afiax Provider')).toBeInTheDocument();
    expect(screen.getByText('1. Set up your facility')).toBeInTheDocument();
    expect(screen.getByText('Register a patient')).toBeInTheDocument();
    expect(screen.queryByText(/Medplum/)).not.toBeInTheDocument();
    expect(screen.queryByText('4. Work the department queues')).not.toBeInTheDocument();
  });

  test('Kenya projects get the Kenya workflow steps', () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue({
      resourceType: 'Project',
      id: 'project-ke',
      setting: [{ name: 'countryPack', valueString: 'kenya' }],
    });
    setup(medplum);
    expect(screen.getByText(/DHA Client Registry/)).toBeInTheDocument();
    expect(screen.getByText('4. Work the department queues')).toBeInTheDocument();
    expect(screen.getByText('5. Bill and claim')).toBeInTheDocument();
  });
});
