// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { render, screen } from '../../test-utils/render';
import { IntegrationsPage } from './IntegrationsPage';

function setup(medplum: MockClient): void {
  render(
    <MemoryRouter>
      <MedplumProvider medplum={medplum}>
        <IntegrationsPage />
      </MedplumProvider>
    </MemoryRouter>
  );
}

describe('IntegrationsPage (Afiax enterprise apps)', () => {
  test('lists the Afiax apps, with no third-party vendors', () => {
    setup(new MockClient());
    expect(screen.getByText('Afiax enterprise apps')).toBeInTheDocument();
    for (const name of ['Afiax Pay', 'Finance and stock', 'Afiax AI', 'Afiax Workspace']) {
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByText('Coming later')).toHaveLength(2);
    expect(screen.queryByText('Okta')).not.toBeInTheDocument();
    expect(screen.queryByText(/Medplum/)).not.toBeInTheDocument();
    // National services are shown only to Kenya projects
    expect(screen.queryByText('Kenya national services')).not.toBeInTheDocument();
  });

  test('Kenya projects see which national services are set up', () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue({
      resourceType: 'Project',
      id: 'project-ke',
      setting: [
        { name: 'countryPack', valueString: 'kenya' },
        { name: 'kenyaHieEnvironment', valueString: 'uat' },
      ],
    });
    setup(medplum);
    expect(screen.getByText('Kenya national services')).toBeInTheDocument();
    expect(screen.getByText('Set up (UAT)')).toBeInTheDocument();
    expect(screen.getAllByText('Not set up')).toHaveLength(2);
    expect(screen.getByText('Built in')).toBeInTheDocument();
  });
});
