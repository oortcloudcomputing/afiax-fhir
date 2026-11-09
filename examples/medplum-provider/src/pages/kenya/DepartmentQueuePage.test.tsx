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

describe('Department queues in the provider app', () => {
  test('a Kenya project opens the queue, and staff without a role get a menu link', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue(kenyaProject);
    await setup(medplum, '/kenya/queue/laboratory');
    expect(await screen.findByText('Department queue')).toBeInTheDocument();
    expect(await screen.findByText('No open orders for Laboratory.')).toBeInTheDocument();
    expect(screen.getByText('Department queues')).toBeInTheDocument();
  });

  test('/kenya/queue opens the pharmacy queue', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue(kenyaProject);
    await setup(medplum, '/kenya/queue');
    expect(await screen.findByText('No open orders for Pharmacy.')).toBeInTheDocument();
  });

  test('outside Kenya there is no queue link', async () => {
    const medplum = new MockClient();
    await setup(medplum, '/schedule');
    expect(screen.queryByText('Department queues')).not.toBeInTheDocument();
  });
});
