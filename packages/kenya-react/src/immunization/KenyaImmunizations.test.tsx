// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Immunization, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import {
  buildKenyaImmunization,
  getKenyaVaccineName,
  KenyaKpsImmunizationProfile,
  KenyaTargetDiseaseSystem,
  KenyaVaccineAtcSystem,
  KenyaVaccines,
} from './kenya-immunization';
import { KenyaImmunizations } from './KenyaImmunizations';

const mr = KenyaVaccines.find((v) => v.code === 'J07BD53') as (typeof KenyaVaccines)[number];

describe('buildKenyaImmunization', () => {
  const patient: Patient = { resourceType: 'Patient', id: 'p1' };

  test('builds a DHA KPS Immunization for a dose given', () => {
    const im = buildKenyaImmunization({
      patient,
      vaccine: mr,
      doseNumber: 1,
      occurrence: '2026-03-01T12:00:00+03:00',
      lotNumber: ' MR-2026-01 ',
      performer: { reference: 'Practitioner/n1' },
    });
    expect(im).toMatchObject({
      meta: { profile: [KenyaKpsImmunizationProfile] },
      status: 'completed',
      vaccineCode: { coding: [{ system: KenyaVaccineAtcSystem, code: 'J07BD53' }] },
      patient: { reference: 'Patient/p1' },
      occurrenceDateTime: '2026-03-01T12:00:00+03:00',
      lotNumber: 'MR-2026-01',
      performer: [{ actor: { reference: 'Practitioner/n1' } }],
      protocolApplied: [
        {
          series: 'MR',
          doseNumberPositiveInt: 1,
          targetDisease: [{ coding: [{ system: KenyaTargetDiseaseSystem, code: 'B05' }] }],
        },
      ],
    });
    expect(im.statusReason).toBeUndefined();
  });

  test('records a dose not given with its reason', () => {
    const im = buildKenyaImmunization({
      patient,
      vaccine: mr,
      doseNumber: 2,
      occurrence: '2026-03-01T12:00:00+03:00',
      notGivenReason: 'Vaccine out of stock',
    });
    expect(im).toMatchObject({ status: 'not-done', statusReason: { text: 'Vaccine out of stock' } });
  });

  test('every vaccine has exactly one target disease, as DHA requires', () => {
    for (const v of KenyaVaccines) {
      const im = buildKenyaImmunization({
        patient,
        vaccine: v,
        doseNumber: 1,
        occurrence: '2026-01-01T12:00:00+03:00',
      });
      expect(im.protocolApplied?.[0]?.targetDisease).toHaveLength(1);
    }
  });

  test('names a vaccine by its KEPI label', () => {
    expect(
      getKenyaVaccineName({
        resourceType: 'Immunization',
        status: 'completed',
        patient: { reference: 'Patient/p1' },
        vaccineCode: { coding: [{ system: KenyaVaccineAtcSystem, code: 'J07AN01' }] },
      })
    ).toBe('BCG');
  });
});

describe('KenyaImmunizations', () => {
  test('shows the history and records a new vaccination', async () => {
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({
      resourceType: 'Patient',
      birthDate: '2025-04-15',
      name: [{ family: 'Achieng' }],
    });
    await medplum.createResource<Immunization>(
      buildKenyaImmunization({
        patient,
        vaccine: KenyaVaccines[0],
        doseNumber: 1,
        occurrence: '2025-04-15T12:00:00+03:00',
        lotNumber: 'BCG-1',
      })
    );

    await act(async () => {
      renderWithMedplum(medplum, <KenyaImmunizations patient={patient} />);
    });
    expect(await screen.findByText('BCG')).toBeInTheDocument();
    expect(screen.getByText('BCG-1')).toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Save vaccination' });
    expect(save).toBeDisabled();

    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Choose a vaccine'), { target: { value: 'Measles-Rubella' } });
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('Measles-Rubella (MR) (J07BD53)'));
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Date given'), { target: { value: '2026-01-15' } });
      fireEvent.change(screen.getByLabelText('Batch / lot number'), { target: { value: 'MR-2026-01' } });
    });
    expect(save).toBeEnabled();
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(async () => {
      const all = await medplum.searchResources(
        'Immunization',
        { patient: `Patient/${patient.id}` },
        { cache: 'no-cache' }
      );
      expect(all.map((im) => im.vaccineCode?.coding?.[0]?.code).sort()).toEqual(['J07AN01', 'J07BD53']);
    });
    expect(await screen.findByText('MR-2026-01')).toBeInTheDocument();
  });

  test('a dose marked not given needs a reason', async () => {
    const medplum = new MockClient();
    const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Otieno' }] });
    await act(async () => {
      renderWithMedplum(medplum, <KenyaImmunizations patient={patient} />);
    });
    await act(async () => {
      fireEvent.change(screen.getByPlaceholderText('Choose a vaccine'), { target: { value: 'BCG' } });
    });
    await act(async () => {
      fireEvent.click(await screen.findByText('BCG (J07AN01)'));
    });
    await act(async () => {
      fireEvent.click(screen.getByLabelText('Not given'));
    });
    const save = screen.getByRole('button', { name: 'Save vaccination' });
    expect(save).toBeDisabled();
    await act(async () => {
      fireEvent.change(screen.getByLabelText('Reason not given'), { target: { value: 'Caregiver declined' } });
    });
    expect(save).toBeEnabled();
  });
});
