// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Project } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderAppRoutes, screen } from '../test-utils/render';
import type { KenyaStaffRoleOption } from './KenyaStaffRoleSelect';

const kenyaProject = {
  resourceType: 'Project',
  id: 'project-ke',
  setting: [{ name: 'countryPack', valueString: 'kenya' }],
} as Project;

const roles: KenyaStaffRoleOption[] = [
  {
    code: 'nurse',
    display: 'Nurse',
    description: 'Triage, vital signs, nursing notes and medicines given.',
    admin: false,
    userConfiguration: { reference: 'UserConfiguration/nurse' },
    accessPolicy: { reference: 'AccessPolicy/nurse' },
  },
  {
    code: 'facility-admin',
    display: 'Facility admin',
    description: 'Manages staff, roles and the facility set-up.',
    admin: true,
    userConfiguration: { reference: 'UserConfiguration/admin' },
  },
];

function signedIn(): MockClient {
  const medplum = new MockClient();
  medplum.setActiveLoginOverride({
    accessToken: '123',
    refreshToken: '456',
    profile: { reference: 'Practitioner/123' },
    project: { reference: 'Project/123' },
  });
  return medplum;
}

function kenyaClient(): { medplum: MockClient; postSpy: jest.SpyInstance } {
  const medplum = signedIn();
  jest.spyOn(medplum, 'getProject').mockReturnValue(kenyaProject);
  const realPost = medplum.post.bind(medplum);
  const postSpy = jest.spyOn(medplum, 'post').mockImplementation(((url: string | URL, body: unknown) => {
    const path = url.toString();
    if (path.includes('/kenya/staff-roles')) {
      return Promise.resolve(roles);
    }
    if (path.includes('/invite')) {
      return Promise.resolve({
        resourceType: 'ProjectMembership',
        id: 'm1',
        profile: { reference: 'Practitioner/p1' },
      });
    }
    return realPost(url, body);
  }) as typeof medplum.post);
  return { medplum, postSpy };
}

async function fillAndPick(role: string): Promise<void> {
  await act(async () => {
    fireEvent.change(screen.getByLabelText('First Name *'), { target: { value: 'Mercy' } });
    fireEvent.change(screen.getByLabelText('Last Name *'), { target: { value: 'Chebet' } });
    fireEvent.change(screen.getByLabelText('Email *'), { target: { value: 'mercy@example.com' } });
  });
  // Wait for the roles to load, then open the list and choose one
  const input = await screen.findByPlaceholderText('Choose a role');
  await act(async () => {
    fireEvent.click(input);
  });
  await act(async () => {
    fireEvent.click(await screen.findByText(role));
  });
}

describe('Kenya staff role on the invite page', () => {
  test('a role sets the menu and access policy together', async () => {
    const { medplum, postSpy } = kenyaClient();
    await act(async () => {
      renderAppRoutes(medplum, '/admin/invite');
    });
    expect(await screen.findByText('Invite new member')).toBeInTheDocument();
    await fillAndPick('Nurse');
    expect(screen.getByText(/Triage, vital signs/)).toBeInTheDocument();
    // The hand-picked access policy and the Admin box give way to the role
    expect(screen.queryByPlaceholderText('Access Policy')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Admin')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByText('Invite'));
    });
    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining('admin/projects/project-ke/invite'),
      expect.objectContaining({
        membership: {
          accessPolicy: { reference: 'AccessPolicy/nurse' },
          userConfiguration: { reference: 'UserConfiguration/nurse' },
          admin: false,
        },
      })
    );
  });

  test('the facility admin role makes a project admin', async () => {
    const { medplum, postSpy } = kenyaClient();
    await act(async () => {
      renderAppRoutes(medplum, '/admin/invite');
    });
    expect(await screen.findByText('Invite new member')).toBeInTheDocument();
    await fillAndPick('Facility admin');
    await act(async () => {
      fireEvent.click(screen.getByText('Invite'));
    });
    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining('/invite'),
      expect.objectContaining({
        membership: {
          accessPolicy: undefined,
          userConfiguration: { reference: 'UserConfiguration/admin' },
          admin: true,
        },
      })
    );
  });

  test('no role picker outside Kenya projects', async () => {
    const medplum = signedIn();
    await act(async () => {
      renderAppRoutes(medplum, '/admin/invite');
    });
    expect(await screen.findByText('Invite')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Staff role' })).not.toBeInTheDocument();
  });
});
