// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Button, Card, Container, Image, Overlay, SimpleGrid, Text, Title } from '@mantine/core';
import { formatHumanName } from '@medplum/core';
import type { Patient, Practitioner } from '@medplum/fhirtypes';
import { useMedplumProfile } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import DoctorImage from '../img/homePage/doctor.svg';
import HealthRecordImage from '../img/homePage/health-record.svg';
import PillImage from '../img/homePage/pill.svg';
import TaskImage from '../img/homePage/task-icon.svg';
import classes from './HomePage.module.css';

const linkPages = [
  {
    img: HealthRecordImage,
    title: 'Health record',
    description: 'Your test results, vaccines and vital signs.',
    href: '/health-record',
  },
  {
    img: PillImage,
    title: 'Medicines',
    description: 'The medicines your clinician has prescribed for you.',
    href: '/health-record/medications',
  },
  {
    img: TaskImage,
    title: 'Care plan',
    description: 'Tasks and follow-ups from your care team.',
    href: '/care-plan',
  },
  {
    img: DoctorImage,
    title: 'Messages',
    description: 'Write to your care team and read their replies.',
    href: '/Communication',
  },
];

export function HomePage(): JSX.Element {
  const navigate = useNavigate();
  const profile = useMedplumProfile() as Patient | Practitioner;
  const profileName = profile.name ? formatHumanName(profile.name[0]) : '';

  return (
    <Box bg="gray.0">
      <div className={classes.hero}>
        <Overlay
          gradient="linear-gradient(180deg, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0.4) 40%)"
          opacity={1}
          zIndex={0}
        />
        <Container className={classes.heroContainer}>
          <Title className={classes.heroTitle}>
            {profileName ? `Hi ${profileName},` : 'Welcome,'}
            <br /> we’re here to help
          </Title>
          <Button
            size="xl"
            radius="xl"
            className={classes.heroButton}
            onClick={() => navigate('/get-care')?.catch(console.error)}
          >
            Get care
          </Button>
        </Container>
      </div>
      <Box p="lg">
        <Container>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} pb="xl">
            {linkPages.map((item) => (
              <Card
                key={item.href}
                shadow="md"
                radius="md"
                className={classes.card}
                p="xl"
                component="button"
                onClick={() => navigate(item.href)?.catch(console.error)}
                style={{ cursor: 'pointer', textAlign: 'left' }}
              >
                <Image src={item.img} w={80} alt="" />
                <Text size="lg" fw={500} mt="md">
                  {item.title}
                </Text>
                <Text size="sm" c="dimmed" mt="xs">
                  {item.description}
                </Text>
              </Card>
            ))}
          </SimpleGrid>
        </Container>
      </Box>
    </Box>
  );
}
