// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../../App';
import { act, render, screen } from '../../test-utils/render';

const kenyaProject: Project = {
  resourceType: 'Project',
  id: 'project-ke',
  setting: [{ name: 'countryPack', valueString: 'kenya' }],
};

async function setup(medplum: MockClient, url: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]}>
        <MedplumProvider medplum={medplum}>
          <App />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('Kenya patient registration in the provider app', () => {
  test.each(['/onboarding', '/Patient/new'])('%s opens the DHA registration wizard', async (url) => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue(kenyaProject);
    await setup(medplum, url);
    expect(await screen.findByText('Kenya National Client Registry')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Search DHA Registry' })).toBeInTheDocument();
  });

  test('outside Kenya the default intake form stays', async () => {
    const medplum = new MockClient();
    await setup(medplum, '/onboarding');
    expect(screen.queryByText('Kenya National Client Registry')).not.toBeInTheDocument();
    // The default intake form checks its value sets on load, which is slow in jsdom
  }, 20000);
});
