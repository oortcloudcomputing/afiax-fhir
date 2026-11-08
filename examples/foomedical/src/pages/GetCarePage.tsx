// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Title } from '@mantine/core';
import type { Questionnaire } from '@medplum/fhirtypes';
import { Document, Scheduler, useMedplum } from '@medplum/react';
import type { JSX } from 'react';

// Asked when the patient picks a slot. Full Kenya appointment booking (facility schedules, confirmation by SMS)
// is a later phase.
const visitReasonQuestionnaire: Questionnaire = {
  resourceType: 'Questionnaire',
  status: 'active',
  name: 'visit-reason',
  title: 'Reason for your visit',
  item: [
    {
      linkId: 'reason',
      type: 'text',
      text: 'What would you like to be seen for?',
      required: true,
    },
  ],
};

export function GetCare(): JSX.Element {
  const medplum = useMedplum();
  const schedule = medplum.searchOne('Schedule').read();

  return (
    <Document width={800}>
      <Title order={1} mb="lg">
        Get care
      </Title>
      {schedule ? (
        <Scheduler schedule={schedule} questionnaire={visitReasonQuestionnaire} />
      ) : (
        <Alert color="blue" title="Online booking is not available yet">
          Your facility has not opened online booking yet. Please call or visit your Afiax facility to book a visit, or
          send a message to your care team.
        </Alert>
      )}
    </Document>
  );
}
