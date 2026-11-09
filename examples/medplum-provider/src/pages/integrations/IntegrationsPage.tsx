// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Afiax enterprise apps: the Afiax products that work with Afiax Provider, and the national services
// (Kenya) the platform connects to. National services show whether this project has them set up.

import { Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { getProjectSettingString } from '@medplum/core';
import { Document, useMedplum } from '@medplum/react';
import {
  IconBook,
  IconBrain,
  IconBuildingHospital,
  IconCash,
  IconChartBar,
  IconDeviceHeartMonitor,
  IconFileInvoice,
  IconId,
  IconPhoto,
  IconReportMedical,
  IconUsersGroup,
} from '@tabler/icons-react';
import type { JSX, ReactNode } from 'react';

interface AfiaxApp {
  readonly name: string;
  readonly product: string;
  readonly description: string;
  readonly icon: ReactNode;
  /** Later releases are marked "Coming later". */
  readonly comingLater?: boolean;
}

const enterpriseApps: AfiaxApp[] = [
  {
    name: 'Afiax Pay',
    product: 'Afiax Clinical Suite',
    description: 'M-Pesa and card payments, patient wallets and SHA remittance reconciliation.',
    icon: <IconCash />,
  },
  {
    name: 'Finance and stock',
    product: 'Afiax Clinical Suite',
    description:
      'Price lists, sales invoices and accounts, pharmacy stock with batches and expiry, purchasing and KRA eTIMS.',
    icon: <IconFileInvoice />,
  },
  {
    name: 'Remote patient monitoring',
    product: 'Afiax Clinical Suite',
    description: 'Readings from home and ward devices (blood pressure, glucose, oxygen) in the patient record.',
    icon: <IconDeviceHeartMonitor />,
  },
  {
    name: 'Imaging',
    product: 'Afiax Clinical Suite',
    description: 'Store and view X-ray, ultrasound and CT images alongside radiology orders and reports.',
    icon: <IconPhoto />,
    comingLater: true,
  },
  {
    name: 'Afiax AI',
    product: 'Afiax AI',
    description: 'Clinical decision support, imaging AI and help with clinical notes, in English and Kiswahili.',
    icon: <IconBrain />,
    comingLater: true,
  },
  {
    name: 'Afiax Workspace',
    product: 'Afiax Workspace',
    description: 'Training and CPD, team messaging, files, reports and the locums marketplace.',
    icon: <IconBook />,
  },
];

interface NationalService {
  readonly name: string;
  readonly description: string;
  readonly icon: ReactNode;
  /** Project setting that holds the environment when the service is set up; undefined = always available. */
  readonly setting?: string;
}

const kenyaServices: NationalService[] = [
  {
    name: 'DHA Client Registry and HIE',
    description: 'Patient identity checks at registration and sharing records with the Shared Health Record.',
    icon: <IconId />,
    setting: 'kenyaHieEnvironment',
  },
  {
    name: 'SHA',
    description: 'Cover eligibility checks, pre-authorisation and claims to the Social Health Authority.',
    icon: <IconBuildingHospital />,
    setting: 'kenyaShaClaimsEnvironment',
  },
  {
    name: 'KHIS',
    description: 'Disease surveillance (IDSR) reports: immediate notifications and the weekly MOH 505.',
    icon: <IconChartBar />,
    setting: 'kenyaKhisEnvironment',
  },
  {
    name: 'KNHTS',
    description: 'The national terminology service: ICD-11 diagnoses, medicines, tests and SHA benefit codes.',
    icon: <IconReportMedical />,
  },
];

export function IntegrationsPage(): JSX.Element {
  const medplum = useMedplum();
  const project = medplum.getProject();
  const isKenya = getProjectSettingString(project, 'countryPack') === 'kenya';

  return (
    <Document>
      <Stack gap="xl">
        <Stack gap={4}>
          <Title order={2}>Afiax enterprise apps</Title>
          <Text c="dimmed">
            Afiax products that work with Afiax Provider. Your Afiax administrator turns them on for your facility.
          </Text>
        </Stack>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
          {enterpriseApps.map((app) => (
            <AppCard
              key={app.name}
              name={app.name}
              icon={app.icon}
              tags={[app.product]}
              description={app.description}
              status={app.comingLater ? { label: 'Coming later', color: 'gray' } : undefined}
            />
          ))}
        </SimpleGrid>

        {isKenya && (
          <>
            <Stack gap={4}>
              <Title order={3}>Kenya national services</Title>
              <Text c="dimmed">Set up by your facility administrator in the country pack settings.</Text>
            </Stack>
            <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }}>
              {kenyaServices.map((service) => {
                const environment = service.setting ? getProjectSettingString(project, service.setting) : undefined;
                let status: { label: string; color: string };
                if (!service.setting) {
                  status = { label: 'Built in', color: 'green' };
                } else if (environment) {
                  status = { label: `Set up (${environment.toUpperCase()})`, color: 'green' };
                } else {
                  status = { label: 'Not set up', color: 'yellow' };
                }
                return (
                  <AppCard
                    key={service.name}
                    name={service.name}
                    icon={service.icon}
                    tags={['National service']}
                    description={service.description}
                    status={status}
                  />
                );
              })}
            </SimpleGrid>
          </>
        )}
        <Group gap="xs">
          <IconUsersGroup size={16} />
          <Text size="sm" c="dimmed">
            Need something else connected? Ask your Afiax administrator.
          </Text>
        </Group>
      </Stack>
    </Document>
  );
}

interface AppCardProps {
  readonly name: string;
  readonly icon: ReactNode;
  readonly tags: string[];
  readonly description: string;
  readonly status?: { label: string; color: string };
}

function AppCard(props: AppCardProps): JSX.Element {
  return (
    <Paper radius="md" withBorder p="md" data-testid="afiax-app-card">
      <Group justify="space-between" wrap="nowrap" align="flex-start">
        <Group wrap="nowrap" gap="sm">
          {props.icon}
          <Text fw={700}>{props.name}</Text>
        </Group>
        {props.status && (
          <Badge color={props.status.color} variant="light" size="sm">
            {props.status.label}
          </Badge>
        )}
      </Group>
      <Group mt="xs" gap={4}>
        {props.tags.map((tag) => (
          <Badge key={tag} variant="outline" color="gray" size="xs">
            {tag}
          </Badge>
        ))}
      </Group>
      <Text size="sm" mt="sm">
        {props.description}
      </Text>
    </Paper>
  );
}
