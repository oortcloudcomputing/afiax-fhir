// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaIcd11System } from '@medplum/core';
import type { Encounter, FamilyMemberHistory, Observation, Patient, ValueSet } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { KenyaFamilyHistory } from './KenyaFamilyHistory';
import { KenyaVitalSignsForm } from './KenyaVitalSigns';

async function visit(medplum: MockClient): Promise<Encounter> {
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Achieng'], family: 'Otieno' }],
    birthDate: '1990-01-01',
  });
  return medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { code: 'AMB' },
    subject: { reference: `Patient/${patient.id}` },
  });
}

describe('KenyaVitalSignsForm', () => {
  test('saves readings as Observations with a calculated BMI', async () => {
    const medplum = new MockClient();
    const encounter = await visit(medplum);
    const onSaved = jest.fn();
    await act(async () => {
      renderWithMedplum(medplum, <KenyaVitalSignsForm encounter={encounter} onSaved={onSaved} />);
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
    expect(onSaved).toHaveBeenCalled();
  });
});

describe('KenyaFamilyHistory', () => {
  test('adds a relative’s ICD-11 condition', async () => {
    const medplum = new MockClient();
    const encounter = await visit(medplum);
    const realGet = medplum.get.bind(medplum);
    jest.spyOn(medplum, 'get').mockImplementation(((url: string | URL, options?: RequestInit) =>
      url.toString().includes('$knhts-search')
        ? Promise.resolve({
            resourceType: 'ValueSet',
            expansion: { contains: [{ system: KenyaIcd11System, code: '5A11', display: 'Type 2 diabetes mellitus' }] },
          } as ValueSet)
        : realGet(url, options)) as typeof medplum.get);
    await act(async () => {
      renderWithMedplum(medplum, <KenyaFamilyHistory encounter={encounter} />);
    });
    expect(await screen.findByText('No family history recorded.')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('textbox', { name: 'Relative' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Mother'));
    });
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /Condition \(ICD-11\)/ }), { target: { value: 'diab' } });
    });
    fireEvent.click(await screen.findByText('Type 2 diabetes mellitus (5A11)', {}, { timeout: 3000 }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add family history' }));
    });
    await waitFor(async () => {
      const items = await medplum.searchResources('FamilyMemberHistory', {
        patient: encounter.subject?.reference as string,
      });
      expect(items).toHaveLength(1);
      expect((items[0] as FamilyMemberHistory).relationship?.text).toBe('Mother');
      expect((items[0] as FamilyMemberHistory).condition?.[0].code?.coding?.[0].code).toBe('5A11');
    });
  });
});
