// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Stack, Text, Title } from '@mantine/core';
import type { Patient } from '@medplum/fhirtypes';
import { ResourceAvatar, ResourceName, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { InfoSection } from '../../components/InfoSection';

export function Provider(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const practitioner = patient.generalPractitioner?.[0];

  return (
    <Box p="xl">
      <Title mb="lg">My clinician</Title>
      <InfoSection title="Your usual clinician">
        <Box p="xl">
          {practitioner ? (
            <Stack align="center">
              <ResourceAvatar size={200} radius={100} value={practitioner} />
              <Title order={2}>
                <ResourceName value={practitioner} />
              </Title>
            </Stack>
          ) : (
            <Text>
              You do not have a usual clinician on record yet. Your facility can add one for you at your next visit.
            </Text>
          )}
        </Box>
      </InfoSection>
    </Box>
  );
}
