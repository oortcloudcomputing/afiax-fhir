// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Kenya visit details and billing: diagnoses (ICD-11), the patient's SHA cover, the visit's bill and
// payments, and its SHA claim. Replaces the US billing tab (CPT charges, CMS 1500, self-pay cover)
// in Kenya projects.

import { Card, Stack, Title } from '@mantine/core';
import { useDebouncedCallback } from '@mantine/hooks';
import type { WithId } from '@medplum/core';
import type {
  Condition,
  Coverage,
  Encounter,
  EncounterDiagnosis,
  Organization,
  Patient,
  Practitioner,
} from '@medplum/fhirtypes';
import { KenyaPatientCover, KenyaVisitBilling, KenyaVisitClaim } from '@medplum/kenya-react';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useCallback, useState } from 'react';
import { showErrorNotification } from '../../utils/notifications';
import { ConditionList } from '../Conditions/ConditionList';
import { VisitDetailsPanel } from './VisitDetailsPanel';

export interface KenyaBillingTabProps {
  readonly patient: WithId<Patient>;
  readonly encounter: WithId<Encounter>;
  readonly setEncounter: (encounter: WithId<Encounter>) => void;
  readonly practitioner: WithId<Practitioner> | undefined;
  readonly setPractitioner: (practitioner: WithId<Practitioner>) => void;
}

export function KenyaBillingTab(props: KenyaBillingTabProps): JSX.Element {
  const { patient, encounter, setEncounter, practitioner, setPractitioner } = props;
  const medplum = useMedplum();
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [shaCoverage, setShaCoverage] = useState<Coverage>();
  const [version, setVersion] = useState(0);

  const saveEncounter = useCallback(
    async (updated: Encounter): Promise<WithId<Encounter>> => {
      const saved = await medplum.updateResource(updated);
      setEncounter(saved);
      return saved;
    },
    [medplum, setEncounter]
  );

  const handleEncounterChange = useDebouncedCallback(async (updated: Encounter): Promise<void> => {
    try {
      const saved = await saveEncounter(updated);
      if (saved.participant?.[0]?.individual) {
        setPractitioner((await medplum.readReference(saved.participant[0].individual)) as WithId<Practitioner>);
      }
    } catch (err) {
      showErrorNotification(err);
    }
  }, 500);

  const handleDiagnosisChange = useCallback(
    async (diagnosis: EncounterDiagnosis[]): Promise<void> => {
      try {
        await saveEncounter({ ...encounter, diagnosis });
      } catch (err) {
        showErrorNotification(err);
      }
    },
    [encounter, saveEncounter]
  );

  const handleCoverChange = useCallback((coverages: Coverage[], sha: Organization | undefined) => {
    setShaCoverage(
      coverages.find(
        (c) => c.status === 'active' && sha && c.payor?.some((p) => p.reference === `Organization/${sha.id}`)
      )
    );
  }, []);

  return (
    <Stack gap="md">
      <VisitDetailsPanel practitioner={practitioner} encounter={encounter} onEncounterChange={handleEncounterChange} />
      <ConditionList
        patient={patient}
        encounter={encounter}
        conditions={conditions}
        setConditions={setConditions}
        onDiagnosisChange={handleDiagnosisChange}
      />
      <Card withBorder shadow="sm">
        <Title order={4} mb="sm">
          Insurance cover
        </Title>
        <KenyaPatientCover patient={patient} onChange={handleCoverChange} />
      </Card>
      <Card withBorder shadow="sm">
        <Title order={4} mb="sm">
          Bill and payments
        </Title>
        <KenyaVisitBilling encounter={encounter} onChange={() => setVersion((v) => v + 1)} />
      </Card>
      <Card withBorder shadow="sm">
        <Title order={4} mb="sm">
          SHA claim
        </Title>
        <KenyaVisitClaim key={version} patient={patient} encounter={encounter} shaCoverage={shaCoverage} />
      </Card>
    </Stack>
  );
}
