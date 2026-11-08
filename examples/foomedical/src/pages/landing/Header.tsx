// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Burger, Button, Container, Divider, Drawer, Group, Stack, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { Logo } from '../../components/Logo';
import classes from './Header.module.css';

export function Header(): JSX.Element {
  const navigate = useNavigate();
  const [drawerOpened, { toggle: toggleDrawer, close: closeDrawer }] = useDisclosure(false);

  const goTo = (path: string): void => {
    closeDrawer();
    navigate(path)?.catch(console.error);
  };

  return (
    <>
      <AppShell.Header px="md">
        <Container h="100%">
          <Group justify="space-between" h="100%">
            <UnstyledButton className={classes.logoButton} onClick={() => goTo('/')}>
              <Logo width={240} />
            </UnstyledButton>

            <Group className={classes.hiddenMobile}>
              <Button variant="default" onClick={() => goTo('/signin')}>
                Log in
              </Button>
              <Button onClick={() => goTo('/register')}>Sign up</Button>
            </Group>

            <Burger
              opened={drawerOpened}
              onClick={toggleDrawer}
              className={classes.hiddenDesktop}
              aria-label="Open menu"
            />
          </Group>
        </Container>
      </AppShell.Header>

      <Drawer
        opened={drawerOpened}
        onClose={closeDrawer}
        size="100%"
        padding="md"
        title="My Afiax"
        className={classes.hiddenDesktop}
        zIndex={1000000}
      >
        <Divider my="sm" />
        <Stack px="md" pb="xl">
          <Button variant="default" onClick={() => goTo('/signin')}>
            Log in
          </Button>
          <Button onClick={() => goTo('/register')}>Sign up</Button>
        </Stack>
      </Drawer>
    </>
  );
}
