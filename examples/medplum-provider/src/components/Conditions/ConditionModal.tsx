// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Group, Select, Stack, TextInput } from '@mantine/core';
import {
  addProfileToResource,
  createReference,
  getProjectSettingString,
  HTTP_HL7_ORG,
  HTTP_TERMINOLOGY_HL7_ORG,
} from '@medplum/core';
import type { CodeableConcept, Coding, Condition, Encounter, Patient, Reference } from '@medplum/fhirtypes';
import { buildKenyaDiagnosis, KenyaDiagnosisCertainties, KnhtsCodeInput } from '@medplum/kenya-react';
import { CodeableConceptInput, Form, SubmitButton, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';

export interface ConditionDialogProps {
  readonly patient: Patient;
  readonly encounter: Encounter;
  readonly onSubmit: (condition: Condition) => void;
}

export default function ConditionModal(props: ConditionDialogProps): JSX.Element {
  const medplum = useMedplum();
  // Kenya codes diagnoses in ICD-11 MMS from the national terminology service (KNHTS)
  if (getProjectSettingString(medplum.getProject(), 'countryPack') === 'kenya') {
    return <KenyaConditionForm {...props} />;
  }
  return <DefaultConditionForm {...props} />;
}

function DefaultConditionForm(props: ConditionDialogProps): JSX.Element {
  const { patient, encounter, onSubmit } = props;
  const [diagnosis, setDiagnosis] = useState<CodeableConcept | undefined>();
  const [clinicalStatus, setClinicalStatus] = useState<CodeableConcept | undefined>();

  const handleSubmit = useCallback(() => {
    if (!diagnosis) {
      showErrorNotification('Please select a diagnosis');
      return;
    }

    const updatedCondition: Condition = addProfileToResource(
      {
        resourceType: 'Condition',
        category: [
          {
            coding: [
              {
                system: HTTP_TERMINOLOGY_HL7_ORG + '/CodeSystem/condition-category',
                code: 'problem-list-item',
                display: 'Problem List Item',
              },
            ],
            text: 'Problem List Item',
          },
        ],
        subject: createReference(patient),
        encounter: encounter && createReference(encounter),
        code: {
          coding: diagnosis.coding ? [...diagnosis.coding] : [],
        },
        clinicalStatus,
      },
      HTTP_HL7_ORG + '/fhir/us/core/StructureDefinition/us-core-condition-problems-health-concerns'
    );

    onSubmit(updatedCondition);
  }, [patient, encounter, diagnosis, clinicalStatus, onSubmit]);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <CodeableConceptInput
          binding="http://hl7.org/fhir/sid/icd-10-cm/vs"
          label="ICD-10 Code"
          name="diagnosis"
          path="Condition.code"
          required
          onChange={(diagnosis) => setDiagnosis(diagnosis)}
        />

        <CodeableConceptInput
          name="clinicalStatus"
          label="Status"
          path="Condition.clinicalStatus"
          binding={HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical'}
          onChange={(clinicalStatus) => setClinicalStatus(clinicalStatus)}
          required
        />
        <Group justify="flex-end" gap={4} mt="md">
          <SubmitButton>Save</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}

function KenyaConditionForm(props: ConditionDialogProps): JSX.Element {
  const { patient, encounter, onSubmit } = props;
  const medplum = useMedplum();
  const [code, setCode] = useState<Coding>();
  const [certainty, setCertainty] = useState('provisional');
  const [onset, setOnset] = useState(() => new Date().toISOString().slice(0, 10));
  const [clinicalStatus, setClinicalStatus] = useState<CodeableConcept | undefined>();

  const handleSubmit = useCallback(() => {
    if (!code) {
      showErrorNotification('Please select a diagnosis');
      return;
    }
    const profile = medplum.getProfile();
    onSubmit(
      buildKenyaDiagnosis({
        patient,
        encounter,
        code,
        verification: certainty,
        clinicalStatus,
        onset,
        recorder: profile ? (createReference(profile) as Reference) : undefined,
      })
    );
  }, [medplum, patient, encounter, code, certainty, clinicalStatus, onset, onSubmit]);

  return (
    <Form onSubmit={handleSubmit}>
      <Stack>
        <KnhtsCodeInput kind="diagnosis" label="Diagnosis (ICD-11)" required value={code} onChange={setCode} />
        <Select
          label="Certainty"
          data={[...KenyaDiagnosisCertainties]}
          value={certainty}
          onChange={(v) => setCertainty(v ?? 'provisional')}
          allowDeselect={false}
        />
        <CodeableConceptInput
          name="clinicalStatus"
          label="Status"
          path="Condition.clinicalStatus"
          binding={HTTP_HL7_ORG + '/fhir/ValueSet/condition-clinical'}
          onChange={setClinicalStatus}
        />
        <TextInput label="Onset date" type="date" value={onset} onChange={(e) => setOnset(e.currentTarget.value)} />
        <Group justify="flex-end" gap={4} mt="md">
          <SubmitButton>Save</SubmitButton>
        </Group>
      </Stack>
    </Form>
  );
}
