// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaPatientWizard } from '@medplum/kenya-react';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate } from 'react-router';

/**
 * New patient for Kenya facilities: the DHA Client Registry registration wizard, in place of the
 * default intake questionnaire. Opens the new patient's chart when done.
 * @returns The registration page.
 */
export function KenyaRegistrationPage(): JSX.Element {
  const navigate = useNavigate();
  return (
    <Document>
      <KenyaPatientWizard
        onRegistered={(patient) => {
          navigate(`/Patient/${patient.id}`)?.catch(console.error);
        }}
      />
    </Document>
  );
}
