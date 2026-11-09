// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Afiax Provider first steps: set up the facility, then the everyday clinical and billing work.

import { ActionIcon, Anchor, Box, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { getProjectSettingString } from '@medplum/core';
import { MedplumLink, useMedplum } from '@medplum/react';
import { IconBook, IconBuilding, IconCash, IconListCheck, IconStethoscope, IconUserPlus } from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';
import { getConfig } from '../../config';
import classes from './GetStartedPage.module.css';

interface Step {
  readonly title: string;
  readonly icon: ReactNode;
  readonly text: string;
  /** In-app link. */
  readonly to?: string;
  /** Link to another app (the admin app). */
  readonly href?: string;
  readonly linkLabel?: string;
  /** Shown only in Kenya projects. */
  readonly kenyaOnly?: boolean;
}

export function GetStartedPage(): JSX.Element {
  const medplum = useMedplum();
  const isKenya = getProjectSettingString(medplum.getProject(), 'countryPack') === 'kenya';
  const { adminAppUrl, helpUrl, supportEmail } = getConfig();
  const adminLink = (path: string): string | undefined =>
    adminAppUrl ? new URL(path, adminAppUrl.endsWith('/') ? adminAppUrl : adminAppUrl + '/').href : undefined;

  const steps: Step[] = [
    {
      title: 'Set up your facility',
      icon: <IconBuilding size={24} />,
      text: isKenya
        ? 'A facility administrator turns on the Kenya country pack, registers the facility with its MFL code, connects the DHA, SHA and KHIS services, and invites staff, giving each person a staff role (front desk, nurse, clinician, pharmacy, laboratory, cashier).'
        : 'A facility administrator sets up the project, the facility and its staff in the Afiax admin app.',
      href: adminLink('admin/project'),
      linkLabel: 'Open the admin app',
    },
    {
      title: 'Register patients',
      icon: <IconUserPlus size={24} />,
      text: isKenya
        ? 'New patient looks the person up in the DHA Client Registry, checks they are not already registered here, then registers them with their national ID.'
        : 'New patient records the patient’s details and history.',
      to: '/onboarding',
      linkLabel: 'Register a patient',
    },
    {
      title: 'See patients',
      icon: <IconStethoscope size={24} />,
      text: isKenya
        ? 'Open a patient and start a visit with New encounter. In the visit, write the note, record the ICD-11 diagnosis and place orders and prescriptions from the Orders tab, with safety checks.'
        : 'Open a patient and start a visit with New encounter, then write the note and record the diagnosis.',
      to: '/Patient',
      linkLabel: 'Find a patient',
    },
    {
      title: 'Work the department queues',
      icon: <IconListCheck size={24} />,
      text: 'Pharmacy, laboratory, radiology and the other departments accept and complete the orders sent to them. The pharmacy dispenses prescriptions.',
      to: '/kenya/queue',
      linkLabel: 'Open the queues',
      kenyaOnly: true,
    },
    {
      title: 'Bill and claim',
      icon: <IconCash size={24} />,
      text: 'In the visit’s Details & Billing tab: check the patient’s SHA cover, create the bill, take cash, M-Pesa or card payments, and make and submit the SHA claim.',
      kenyaOnly: true,
    },
  ];

  return (
    <Box className={classes.page} py="4rem">
      <Container size="md" className={classes.container}>
        <Stack gap="xl">
          <Stack gap="xs">
            <Title order={2} fw={800}>
              Get started with Afiax Provider
            </Title>
            <Text size="lg" className={classes.textSecondary}>
              The first steps to set up your facility and get familiar with the everyday work in Afiax Provider.
            </Text>
          </Stack>

          {steps
            .filter((step) => isKenya || !step.kenyaOnly)
            .map((step, index) => (
              <Paper key={step.title} withBorder radius="md" p="lg">
                <Group align="flex-start" wrap="nowrap" gap="md">
                  <ActionIcon size={44} radius="xl" variant="light" component="div">
                    {step.icon}
                  </ActionIcon>
                  <Stack gap={4}>
                    <Text fw={700} size="lg">
                      {index + 1}. {step.title}
                    </Text>
                    <Text className={classes.textSecondary}>{step.text}</Text>
                    {step.to && <MedplumLink to={step.to}>{step.linkLabel}</MedplumLink>}
                    {step.href && (
                      <Anchor href={step.href} target="_blank" rel="noopener noreferrer">
                        {step.linkLabel}
                      </Anchor>
                    )}
                  </Stack>
                </Group>
              </Paper>
            ))}

          <Paper withBorder radius="md" p="lg">
            <Group align="flex-start" wrap="nowrap" gap="md">
              <ActionIcon size={44} radius="xl" variant="light" component="div">
                <IconBook size={24} />
              </ActionIcon>
              <Stack gap={4}>
                <Text fw={700} size="lg">
                  Help
                </Text>
                <Text className={classes.textSecondary}>
                  Step-by-step guides for front desk, clinicians, nurses, departments and billing staff.
                </Text>
                {helpUrl && (
                  <Anchor href={helpUrl} target="_blank" rel="noopener noreferrer">
                    Read the user guides
                  </Anchor>
                )}
                {supportEmail ? (
                  <Anchor href={`mailto:${supportEmail}`}>Contact Afiax support</Anchor>
                ) : (
                  <Text size="sm" className={classes.textSecondary}>
                    For help, contact your Afiax administrator.
                  </Text>
                )}
              </Stack>
            </Group>
          </Paper>
        </Stack>
      </Container>
    </Box>
  );
}
