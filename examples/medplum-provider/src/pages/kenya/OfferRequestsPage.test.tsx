// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../../App';
import type * as Config from '../../config';
import { act, render, screen } from '../../test-utils/render';

vi.mock('../../config', async (importOriginal) => {
  const actual = await importOriginal<typeof Config>();
  return { ...actual, getConfig: () => ({ ...actual.getConfig(), afiaxServicesUrl: 'https://services.test' }) };
});

const networkProject: Project = {
  resourceType: 'Project',
  id: 'network',
  name: 'Afiax Prescription Network',
  setting: [
    { name: 'oortcloudTenant', valueString: 'afiax-prescription-network' },
    { name: 'countryPack', valueString: 'kenya' },
  ],
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

describe('Offer requests in the provider app (ADR-016 §3b)', () => {
  test('a chemist in the Prescription Network lands on its offer requests, with only that in the menu', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue(networkProject);
    await setup(medplum, '/');
    expect(await screen.findByRole('heading', { name: 'Offer requests' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Offer requests/ })).toBeInTheDocument();
    expect(screen.queryByText('Department queues')).not.toBeInTheDocument();
    expect(screen.queryByText('Schedule')).not.toBeInTheDocument();
  });

  test('other projects have no offer requests', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue({
      ...networkProject,
      setting: [{ name: 'countryPack', valueString: 'kenya' }],
    });
    await setup(medplum, '/schedule');
    expect(screen.queryByText('Offer requests')).not.toBeInTheDocument();
  });
});
