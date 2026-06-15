// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Paper, ScrollArea, Text } from '@mantine/core';
import { getProjectSettingString } from '@medplum/core';
import { LinkTabs, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { Outlet, useParams } from 'react-router';
import { KenyaOrganizationWizard } from './resource/KenyaOrganizationWizard';
import { KenyaPatientWizard } from './resource/KenyaPatientWizard';
import { KenyaPractitionerWizard } from './resource/KenyaPractitionerWizard';

const tabs = ['Form', 'JSON', 'Profiles'];

export function CreateResourcePage(): JSX.Element {
  const { resourceType } = useParams();
  const medplum = useMedplum();
  const project = medplum.getProject();
  const countryPack = getProjectSettingString(project, 'countryPack');

  if (countryPack === 'kenya') {
    if (resourceType === 'Organization') return <KenyaOrganizationWizard />;
    if (resourceType === 'Practitioner') return <KenyaPractitionerWizard />;
    if (resourceType === 'Patient') return <KenyaPatientWizard />;
  }

  return (
    <>
      <Paper>
        <Text p="md" fw={500}>
          New&nbsp;{resourceType}
        </Text>
        <ScrollArea>
          <LinkTabs baseUrl={`/${resourceType}/new`} tabs={tabs} />
        </ScrollArea>
      </Paper>
      <Outlet />
    </>
  );
}
