// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import {
  KenyaAllergyCodeSystem,
  KenyaDepartmentSystem,
  KenyaHealthProductSystem,
  KenyaOrderCategorySystem,
} from '@medplum/core';
import type {
  AllergyIntolerance,
  DetectedIssue,
  Encounter,
  MedicationDispense,
  MedicationRequest,
  Observation,
  Parameters,
  Patient,
  Project,
  Task,
  ValueSet,
} from '@medplum/fhirtypes';
import { getGrowthPoints, parseCdsAlerts } from '@medplum/kenya-react';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { act, fireEvent, renderAppRoutes, screen, waitFor } from '../test-utils/render';

const kenyaProject = {
  resourceType: 'Project',
  id: 'project-ke',
  setting: [{ name: 'countryPack', valueString: 'kenya' }],
} as Project;

async function kenyaClient(): Promise<{ medplum: MockClient; patient: Patient; encounter: Encounter }> {
  const medplum = new MockClient();
  jest.spyOn(medplum, 'getProject').mockReturnValue(kenyaProject);
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Achieng'], family: 'Otieno' }],
    birthDate: '1990-01-01',
  });
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode', code: 'AMB' },
    subject: { reference: `Patient/${patient.id}` },
  });
  return { medplum, patient, encounter };
}

const amoxicillin = { system: KenyaHealthProductSystem, code: 'GE10160', display: 'Amoxicillin 500 mg Oral Capsule' };

const allergyAlert: Parameters = {
  resourceType: 'Parameters',
  parameter: [
    {
      name: 'alert',
      part: [
        { name: 'id', valueString: 'allergy:pen' },
        { name: 'severity', valueCode: 'high' },
        { name: 'category', valueCode: 'allergy' },
        { name: 'title', valueString: 'Allergy: Amoxicillin conflicts with recorded allergy to penicillin' },
        { name: 'detail', valueString: 'The patient has a recorded allergy to penicillin.' },
        { name: 'recommendation', valueString: 'Do not prescribe.' },
        { name: 'evidence', valueString: 'WHO Model Formulary' },
        { name: 'implicated', valueReference: { reference: 'AllergyIntolerance/pen' } },
      ],
    },
  ],
};

describe('Kenya clinical workspace', () => {
  test('prescribing shows the CDS allergy alert and needs an override reason', async () => {
    const { medplum, encounter } = await kenyaClient();
    const realGet = medplum.get.bind(medplum);
    jest.spyOn(medplum, 'get').mockImplementation(((url: string | URL, options?: RequestInit) => {
      if (url.toString().includes('$knhts-search')) {
        return Promise.resolve({ resourceType: 'ValueSet', expansion: { contains: [amoxicillin] } } as ValueSet);
      }
      return realGet(url, options);
    }) as typeof medplum.get);
    const realPost = medplum.post.bind(medplum);
    const postSpy = jest.spyOn(medplum, 'post').mockImplementation(((url: string | URL, body: unknown) => {
      if (url.toString().includes('$cds-check')) {
        return Promise.resolve(allergyAlert);
      }
      if (url.toString().includes('$kenya-order')) {
        return Promise.resolve({ resourceType: 'Parameters' });
      }
      return realPost(url, body);
    }) as typeof medplum.post);

    await act(async () => {
      renderAppRoutes(medplum, `/Encounter/${encounter.id}`);
    });
    expect(await screen.findByText('Clinical orders')).toBeInTheDocument();

    const medicine = screen.getByRole('textbox', { name: /Medicine \(KNHTS HPT registry\)/ });
    await act(async () => {
      fireEvent.change(medicine, { target: { value: 'amox' } });
    });
    fireEvent.click(await screen.findByText('Amoxicillin 500 mg Oral Capsule (GE10160)', {}, { timeout: 3000 }));

    expect(await screen.findByText(/conflicts with recorded allergy to penicillin/)).toBeInTheDocument();
    expect(screen.getByText('Evidence: WHO Model Formulary')).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /Dosage instructions/ }), {
        target: { value: '500 mg three times daily' },
      });
    });
    const button = screen.getByRole('button', { name: 'Override and place order' });
    expect(button).toBeDisabled();

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /Reason for prescribing despite the alert/ }), {
        target: { value: 'Penicillin allergy disproved by oral challenge' },
      });
    });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(postSpy).toHaveBeenCalledWith(
      medplum.fhirUrl('Encounter', encounter.id as string, '$kenya-order'),
      expect.objectContaining({
        parameter: expect.arrayContaining([
          { name: 'category', valueCode: 'medication' },
          { name: 'code', valueCoding: amoxicillin },
          { name: 'overrideReason', valueString: 'Penicillin allergy disproved by oral challenge' },
        ]),
      })
    );
  });

  test('vital signs are saved with a calculated BMI', async () => {
    const { medplum, encounter } = await kenyaClient();
    await act(async () => {
      renderAppRoutes(medplum, `/Encounter/${encounter.id}`);
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('tab', { name: 'Vital signs' }));
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Body weight (kg)' }), { target: { value: '70' } });
      fireEvent.change(screen.getByRole('textbox', { name: 'Body height (cm)' }), { target: { value: '175' } });
    });
    expect(screen.getByTestId('bmi')).toHaveTextContent('BMI: 22.9 kg/m² (Normal weight)');

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save vital signs' }));
    });
    await waitFor(async () => {
      const saved = await medplum.searchResources('Observation', { encounter: `Encounter/${encounter.id}` });
      expect(saved.map((o: Observation) => o.code?.coding?.[0]?.code).sort()).toEqual(['29463-7', '39156-5', '8302-2']);
    });
  });

  test('the pharmacy queue dispenses a medication order', async () => {
    const { medplum, patient, encounter } = await kenyaClient();
    const order = await medplum.createResource<MedicationRequest>({
      resourceType: 'MedicationRequest',
      status: 'active',
      intent: 'order',
      category: [{ coding: [{ system: KenyaOrderCategorySystem, code: 'medication' }] }],
      subject: { reference: `Patient/${patient.id}` },
      encounter: { reference: `Encounter/${encounter.id}` },
      medicationCodeableConcept: { coding: [amoxicillin], text: amoxicillin.display },
      dosageInstruction: [{ text: '500 mg three times daily' }],
      dispenseRequest: { quantity: { value: 15 } },
    });
    const task = await medplum.createResource<Task>({
      resourceType: 'Task',
      status: 'requested',
      intent: 'order',
      priority: 'routine',
      description: 'Medication: Amoxicillin 500 mg Oral Capsule',
      focus: { reference: `MedicationRequest/${order.id}` },
      for: { reference: `Patient/${patient.id}` },
      performerType: [{ coding: [{ system: KenyaDepartmentSystem, code: 'pharmacy' }], text: 'Pharmacy' }],
      authoredOn: new Date().toISOString(),
    });

    await act(async () => {
      renderAppRoutes(medplum, '/kenya/queue/pharmacy');
    });
    expect(await screen.findByText('Medication: Amoxicillin 500 mg Oral Capsule')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Dispense' }));
    });
    // Dispensing asks for confirmation first
    expect(await screen.findByText(/was handed to Achieng Otieno/)).toBeInTheDocument();
    expect((await medplum.readResource('Task', task.id)).status).toBe('requested');
    const dialog = await screen.findByRole('dialog');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Dispense' }));
    });

    await waitFor(async () => {
      expect((await medplum.readResource('Task', task.id)).status).toBe('completed');
    });
    const dispenses = await medplum.searchResources('MedicationDispense', {});
    expect(
      dispenses.find(
        (d: MedicationDispense) => d.authorizingPrescription?.[0]?.reference === `MedicationRequest/${order.id}`
      )
    ).toBeDefined();
  });

  test('patient summary shows allergies and clinical alerts', async () => {
    const { medplum, patient } = await kenyaClient();
    await medplum.createResource<AllergyIntolerance>({
      resourceType: 'AllergyIntolerance',
      patient: { reference: `Patient/${patient.id}` },
      clinicalStatus: { coding: [{ code: 'active' }] },
      code: {
        coding: [{ system: KenyaAllergyCodeSystem, code: 'ORG-00001-CPT-0002015', display: 'Allergy to penicillin' }],
      },
    });
    await medplum.createResource<DetectedIssue>({
      resourceType: 'DetectedIssue',
      status: 'final',
      severity: 'high',
      patient: { reference: `Patient/${patient.id}` },
      code: { text: 'Oxygen saturation 86 %: hypoxaemia' },
      detail: 'Oxygen saturation is at or below 91 %.',
    });

    await act(async () => {
      renderAppRoutes(medplum, `/Patient/${patient.id}`);
    });
    expect(await screen.findByText('Allergies: Allergy to penicillin')).toBeInTheDocument();
    expect(screen.getByText('Oxygen saturation 86 %: hypoxaemia')).toBeInTheDocument();
  });

  test('panels are hidden outside Kenya projects', async () => {
    const medplum = new MockClient();
    const encounter = await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { code: 'AMB' },
    });
    await act(async () => {
      renderAppRoutes(medplum, `/Encounter/${encounter.id}`);
    });
    expect(await screen.findByText('Details')).toBeInTheDocument();
    expect(screen.queryByTestId('kenya-encounter-panel')).not.toBeInTheDocument();
  });
});

describe('clinical utils', () => {
  test('parseCdsAlerts', () => {
    expect(parseCdsAlerts(allergyAlert)).toEqual([
      expect.objectContaining({ severity: 'high', category: 'allergy', implicated: ['AllergyIntolerance/pen'] }),
    ]);
  });

  test('getGrowthPoints sorts by date and skips entered-in-error', () => {
    const obs = (value: number, date: string, status: Observation['status'] = 'final'): Observation => ({
      resourceType: 'Observation',
      status,
      code: { coding: [{ system: 'http://loinc.org', code: '29463-7' }] },
      effectiveDateTime: date,
      valueQuantity: { value },
    });
    const points = getGrowthPoints(
      [obs(12, '2026-03-01'), obs(10, '2026-01-01'), obs(99, '2026-02-01', 'entered-in-error')],
      '29463-7'
    );
    expect(points.map((p) => p.value)).toEqual([10, 12]);
  });
});
