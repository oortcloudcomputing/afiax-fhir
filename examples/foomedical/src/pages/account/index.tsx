// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Container, Group } from '@mantine/core';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { Outlet } from 'react-router';
import { SideMenu } from '../../components/SideMenu';

const sideMenu = {
  title: 'Account',
  menu: [
    { name: 'Profile', href: '/account/profile' },
    { name: 'My clinician', href: '/account/provider' },
    { name: 'Cover and payments', href: '/account/membership-and-billing' },
  ],
};

export function AccountPage(): JSX.Element {
  return (
    <Container>
      <Group align="top">
        <SideMenu {...sideMenu} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Suspense fallback={<div>Loading...</div>}>
            <Outlet />
          </Suspense>
        </div>
      </Group>
    </Container>
  );
}
