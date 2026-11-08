// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Anchor, Container, Divider, SimpleGrid, Stack, Text } from '@mantine/core';
import type { JSX } from 'react';
import classes from './Footer.module.css';

export function Footer(): JSX.Element {
  return (
    <footer className={classes.footer}>
      <div className={classes.inner}>
        <Container p="xl">
          <Stack gap="xl">
            <SimpleGrid cols={2}>
              <Anchor href="https://afiax.africa">Afiax Connected Healthcare</Anchor>
              <Anchor href="https://fhirdocs.afiax.africa">Documentation</Anchor>
            </SimpleGrid>
            <Divider />
            <Text c="dimmed" size="sm">
              &copy; {new Date().getFullYear()} Oortcloud Computing Limited, trading as Afiax Connected Healthcare. All rights reserved.
            </Text>
          </Stack>
        </Container>
      </div>
    </footer>
  );
}
