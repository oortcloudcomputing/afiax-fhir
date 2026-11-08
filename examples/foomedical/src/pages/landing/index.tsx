// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { AppShell, Box, Button, Container, Group, Stack, Text, Title, useMantineTheme } from '@mantine/core';
import cx from 'clsx';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';
import { Footer } from '../../components/Footer';
import DoctorImage from '../../img/landingPage/doctor.jpg';
import EngineeringImage from '../../img/landingPage/engineering.jpg';
import LabImage from '../../img/landingPage/laboratory.jpg';
import WorkingEnvironmentImage from '../../img/landingPage/working-environment.jpg';
import { Header } from './Header';
import classes from './index.module.css';

const features = [
  {
    title: 'Your health record',
    description:
      'See your diagnoses, medicines, test results, vaccines and visits from Afiax facilities, whenever you need them.',
  },
  {
    title: 'Message your care team',
    description: 'Send a message to your clinic and read their replies, without a trip to the facility.',
  },
  {
    title: 'Your care plan',
    description: 'Keep track of the tasks and follow-ups your clinician has set for you.',
  },
  {
    title: 'Your data, protected',
    description:
      'Your record stays on Afiax servers in Kenya and is handled under the Data Protection Act, 2019. Only you and your care team can see it.',
  },
];

export function LandingPage(): JSX.Element {
  const theme = useMantineTheme();
  const navigate = useNavigate();
  return (
    <AppShell className={classes.outer} header={{ height: 100 }}>
      <Header />
      <AppShell.Main className={classes.outer}>
        <img className={classes.heroImage1} src={WorkingEnvironmentImage} alt="" />
        <Container>
          <div className={classes.inner}>
            <div className={classes.content}>
              <Title className={classes.title}>
                Your health,
                <br />
                <span className={classes.highlight}>in your hands</span>
              </Title>
              <Text size="lg" c="dimmed" mt="md">
                My Afiax is the patient portal for facilities that use Afiax Connected Healthcare. Sign in to see your
                health record and stay in touch with your care team.
              </Text>
              <Group mt={30}>
                <Button
                  radius="xl"
                  size="md"
                  className={classes.control}
                  onClick={() => navigate('/register')?.catch(console.error)}
                >
                  Get started
                </Button>
                <Button
                  variant="default"
                  radius="xl"
                  size="md"
                  className={classes.control}
                  onClick={() => navigate('/signin')?.catch(console.error)}
                >
                  Log in
                </Button>
              </Group>
            </div>
            <img className={classes.heroImage2} src={DoctorImage} alt="Doctor" />
          </div>
        </Container>
        <Container>
          <div className={classes.inner}>
            <div style={{ maxWidth: 500 }}>
              <Title order={3} fw={500} c={theme.primaryColor} mb="lg">
                Healthcare
              </Title>
              <Title order={1} fw={500} mb="md">
                A better way to get care
              </Title>
              <Text size="xl" c="gray">
                Your results and records from your Afiax facility, in one place, on your phone or computer.
              </Text>
            </div>
            <img className={classes.heroImage3} src={LabImage} alt="Laboratory" />
          </div>
        </Container>
        <Container>
          <div className={cx(classes.inner, classes.featureSection)}>
            <Stack align="flex-end">
              {features.map((feature, index) => (
                <Box key={`feature-${index}`} className={classes.featureBox}>
                  <Text className={classes.featureTitle}>{feature.title}</Text>
                  <Text className={classes.featureDescription}>{feature.description}</Text>
                </Box>
              ))}
            </Stack>
            <img className={classes.heroImage4} src={EngineeringImage} alt="" />
          </div>
        </Container>
      </AppShell.Main>
      <Footer />
    </AppShell>
  );
}
