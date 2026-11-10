// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya patient tabs: the clinical summary (alerts, allergies, medicines, growth), vaccinations
// (DHA KPS Immunization profile) and the national records (DHA Client Registry identity and
// publication to the Shared Health Record).

import { Stack } from '@mantine/core';
import {
  KenyaImmunizations,
  NationalRecordPublicationPanel,
  PatientClinicalSummaryPanel,
  PatientIdentityPanel,
} from '@medplum/kenya-react';
import { Loading } from '@medplum/react';
import type { JSX } from 'react';
import { usePatient } from '../../hooks/usePatient';

export function KenyaClinicalSummaryTab(): JSX.Element {
  const patient = usePatient();
  if (!patient) {
    return <Loading />;
  }
  return (
    <Stack p="md">
      <PatientClinicalSummaryPanel key={patient.id} patient={patient} />
    </Stack>
  );
}

export function KenyaNationalRecordsTab(): JSX.Element {
  const patient = usePatient();
  if (!patient) {
    return <Loading />;
  }
  return (
    <Stack p="md" gap="xl">
      <PatientIdentityPanel key={`identity-${patient.id}`} patient={patient} />
      <NationalRecordPublicationPanel key={`shr-${patient.id}`} patient={patient} />
    </Stack>
  );
}

export function KenyaImmunizationsTab(): JSX.Element {
  const patient = usePatient();
  if (!patient) {
    return <Loading />;
  }
  return (
    <Stack p="md">
      <KenyaImmunizations key={patient.id} patient={patient} />
    </Stack>
  );
}
