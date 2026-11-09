// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { WithId } from '@medplum/core';
import type { Project, UserConfiguration } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../../App';
import { act, render, screen } from '../../test-utils/render';
import { getKenyaRoleMenus, getKenyaStaffRole } from './kenyaRoleMenu';

const frontDesk: WithId<UserConfiguration> = {
  resourceType: 'UserConfiguration',
  id: 'front-desk',
  name: 'Kenya: Front desk',
  option: [{ id: 'kenyaStaffRole', valueString: 'front-desk' }],
  menu: [
    {
      title: 'Front desk',
      link: [
        { name: 'Patients', target: '/Patient?_count=20' },
        { name: 'New patient', target: '/onboarding' },
        { name: 'Insurance cover', target: '/Coverage' },
      ],
    },
  ],
};

const kenyaProject: Project = {
  resourceType: 'Project',
  id: 'project-ke',
  setting: [{ name: 'countryPack', valueString: 'kenya' }],
};

describe('Kenya role menus', () => {
  test('builds the menu from a role configuration', () => {
    expect(getKenyaStaffRole(frontDesk)).toBe('front-desk');
    const menus = getKenyaRoleMenus(frontDesk);
    expect(menus?.[0].title).toBe('Front desk');
    expect(menus?.[0].links?.map((l) => [l.label, l.href])).toEqual([
      ['Patients', '/Patient?_count=20'],
      ['New patient', '/onboarding'],
      ['Insurance cover', '/Coverage'],
    ]);
  });

  test('admin screens link to the admin app, or are left out without its address', () => {
    const admin: UserConfiguration = {
      resourceType: 'UserConfiguration',
      option: [{ id: 'kenyaStaffRole', valueString: 'facility-admin' }],
      menu: [
        { title: 'Clinical', link: [{ name: 'Patients', target: '/Patient' }] },
        { title: 'Admin', link: [{ name: 'Staff and invites', target: '/admin/project' }] },
      ],
    };
    expect(getKenyaRoleMenus(admin, 'https://app.example.org')?.[1].links?.[0].href).toBe(
      'https://app.example.org/admin/project'
    );
    expect(getKenyaRoleMenus(admin, 'https://app.example.org/')?.[1].links?.[0].href).toBe(
      'https://app.example.org/admin/project'
    );
    expect(getKenyaRoleMenus(admin)?.map((m) => m.title)).toEqual(['Clinical']);
  });

  test('no role means the default menu', () => {
    expect(getKenyaRoleMenus(undefined)).toBeUndefined();
    expect(getKenyaRoleMenus({ resourceType: 'UserConfiguration', menu: frontDesk.menu })).toBeUndefined();
  });

  test('the app shows the role menu for a Kenya staff member', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue(kenyaProject);
    vi.spyOn(medplum, 'getUserConfiguration').mockReturnValue(frontDesk);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/Coverage']}>
          <MedplumProvider medplum={medplum}>
            <App />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
    expect(await screen.findByText('Insurance cover')).toBeInTheDocument();
    expect(screen.getByText('New patient')).toBeInTheDocument();
    // The default provider menu (Spaces, Integrations) is replaced
    expect(screen.queryByText('Spaces')).not.toBeInTheDocument();
    expect(screen.queryByText('Integrations')).not.toBeInTheDocument();
  });

  test('outside Kenya the default menu stays, even with a role configuration', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getUserConfiguration').mockReturnValue(frontDesk);
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/Coverage']}>
          <MedplumProvider medplum={medplum}>
            <App />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
    expect(await screen.findByText('Spaces')).toBeInTheDocument();
    expect(screen.queryByText('Insurance cover')).not.toBeInTheDocument();
  });

  test('Kenya hides DoseSpot even for a member with a DoseSpot identifier', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue(kenyaProject);
    vi.spyOn(medplum, 'getProjectMembership').mockReturnValue({
      resourceType: 'ProjectMembership',
      project: { reference: 'Project/project-ke' },
      user: { reference: 'User/u1' },
      profile: { reference: 'Practitioner/p1' },
      identifier: [{ system: 'https://dosespot.com/clinician-id', value: '123' }],
    });
    await act(async () => {
      render(
        <MemoryRouter initialEntries={['/Coverage']}>
          <MedplumProvider medplum={medplum}>
            <App />
          </MedplumProvider>
        </MemoryRouter>
      );
    });
    expect(await screen.findByText('Patients')).toBeInTheDocument();
    expect(screen.queryByText('DoseSpot')).not.toBeInTheDocument();
  });
});
