// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import type { JSX, ReactNode } from 'react';

export interface AuthLayoutProps {
  readonly children: ReactNode;
}

/**
 * Two-column layout for the sign-in and sign-up pages: the form on the left and an Afiax brand panel on the
 * right. On phones only the form shows.
 * @param props - The layout properties.
 * @returns The layout.
 */
export function AuthLayout(props: AuthLayoutProps): JSX.Element {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing={0}>
      <Box pt={{ base: 40, md: 100 }} pb={{ base: 40, md: 200 }} px="md">
        {props.children}
      </Box>
      <Box visibleFrom="md" style={{ background: '#1B2A4A', color: 'white' }} p={60}>
        <Stack justify="center" h="100%" gap="md">
          <Title order={2} c="white">
            Your health record, in your hands
          </Title>
          <Text size="lg" c="#B8E6F7">
            See your results, medicines and visits from Afiax facilities, and message your care team.
          </Text>
        </Stack>
      </Box>
    </SimpleGrid>
  );
}
