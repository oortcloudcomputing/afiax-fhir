// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaHealthProductSystem } from '@medplum/core';
import type {
  DocumentReference,
  Encounter,
  MedicationAdministration,
  MedicationRequest,
  Patient,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import {
  buildKenyaMedicationAdministration,
  buildKenyaNursingNote,
  getKenyaNursingNoteText,
  KenyaCoreDocumentReferenceProfile,
} from './kenya-nursing';
import { KenyaMedicationAdministrationRecord } from './KenyaMedicationAdministrationRecord';
import { KenyaNursingNotes } from './KenyaNursingNotes';

const amoxicillin = { system: KenyaHealthProductSystem, code: 'GE10160', display: 'Amoxicillin 500 mg Oral Capsule' };

async function visitWithPrescription(
  medplum: MockClient
): Promise<{ encounter: Encounter; request: MedicationRequest }> {
  const patient = await medplum.createResource<Patient>({ resourceType: 'Patient', name: [{ family: 'Wanjiku' }] });
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'in-progress',
    class: { code: 'IMP' },
    subject: { reference: `Patient/${patient.id}` },
  });
  const request = await medplum.createResource<MedicationRequest>({
    resourceType: 'MedicationRequest',
    status: 'active',
    intent: 'order',
    subject: { reference: `Patient/${patient.id}` },
    encounter: { reference: `Encounter/${encounter.id}` },
    medicationCodeableConcept: { coding: [amoxicillin], text: amoxicillin.display },
    dosageInstruction: [{ text: '500 mg three times daily' }],
  });
  return { encounter, request };
}

describe('nursing builders', () => {
  const encounter: Encounter = {
    resourceType: 'Encounter',
    id: 'e1',
    status: 'in-progress',
    class: { code: 'IMP' },
    subject: { reference: 'Patient/p1' },
  };
  const request: MedicationRequest = {
    resourceType: 'MedicationRequest',
    id: 'mr1',
    status: 'active',
    intent: 'order',
    subject: { reference: 'Patient/p1' },
    medicationCodeableConcept: { coding: [amoxicillin] },
    dosageInstruction: [{ text: '500 mg three times daily' }],
  };

  test('a dose given is a completed MedicationAdministration against the prescription', () => {
    const dose = buildKenyaMedicationAdministration({
      request,
      encounter,
      given: true,
      when: '2026-11-08T08:00:00.000Z',
      performer: { reference: 'Practitioner/nurse1' },
    });
    expect(dose).toMatchObject({
      status: 'completed',
      request: { reference: 'MedicationRequest/mr1' },
      context: { reference: 'Encounter/e1' },
      subject: { reference: 'Patient/p1' },
      effectiveDateTime: '2026-11-08T08:00:00.000Z',
      dosage: { text: '500 mg three times daily' },
      performer: [{ actor: { reference: 'Practitioner/nurse1' } }],
    });
  });

  test('a dose not given records the reason', () => {
    const dose = buildKenyaMedicationAdministration({ request, encounter, given: false, note: 'Patient vomiting' });
    expect(dose.status).toBe('not-done');
    expect(dose.statusReason?.[0].text).toBe('Patient vomiting');
    expect(dose.note).toBeUndefined();
  });

  test('a nursing note follows the Kenya Core DocumentReference profile', () => {
    const note = buildKenyaNursingNote(encounter, '  Slept well. Temp 37.2 °C  ', { reference: 'Practitioner/n1' });
    expect(note).toMatchObject({
      meta: { profile: [KenyaCoreDocumentReferenceProfile] },
      status: 'current',
      type: { coding: [{ system: 'http://loinc.org', code: '34746-8' }] },
      subject: { reference: 'Patient/p1' },
      context: { encounter: [{ reference: 'Encounter/e1' }] },
    });
    expect(getKenyaNursingNoteText(note)).toBe('Slept well. Temp 37.2 °C');
  });
});

describe('KenyaMedicationAdministrationRecord', () => {
  test('records a dose given and a dose not given', async () => {
    const medplum = new MockClient();
    const { encounter, request } = await visitWithPrescription(medplum);
    await act(async () => {
      renderWithMedplum(medplum, <KenyaMedicationAdministrationRecord encounter={encounter} />);
    });
    expect(await screen.findByText('Amoxicillin 500 mg Oral Capsule')).toBeInTheDocument();
    expect(screen.getByText('No doses recorded.')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record dose' }));
    });
    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('textbox', { name: 'Dose given' })).toHaveValue('500 mg three times daily');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Save dose' }));
    });
    expect(await screen.findByText('Given')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Not given' }));
    });
    dialog = await screen.findByRole('dialog');
    const save = within(dialog).getByRole('button', { name: 'Save as not given' });
    expect(save).toBeDisabled();
    await act(async () => {
      fireEvent.change(within(dialog).getByRole('textbox', { name: /Reason not given/ }), {
        target: { value: 'Patient vomiting' },
      });
    });
    await act(async () => {
      fireEvent.click(save);
    });

    await waitFor(async () => {
      const doses = await medplum.searchResources('MedicationAdministration', { context: `Encounter/${encounter.id}` });
      expect(doses.map((d: MedicationAdministration) => d.status).sort()).toEqual(['completed', 'not-done']);
      expect(
        doses.every((d: MedicationAdministration) => d.request?.reference === `MedicationRequest/${request.id}`)
      ).toBe(true);
    });
    expect(await screen.findByText(/Patient vomiting/)).toBeInTheDocument();
  });

  test('a visit without prescriptions says so', async () => {
    const medplum = new MockClient();
    const encounter = await medplum.createResource<Encounter>({
      resourceType: 'Encounter',
      status: 'in-progress',
      class: { code: 'IMP' },
    });
    await act(async () => {
      renderWithMedplum(medplum, <KenyaMedicationAdministrationRecord encounter={encounter} />);
    });
    expect(await screen.findByText('No medicines prescribed in this visit.')).toBeInTheDocument();
  });
});

describe('KenyaNursingNotes', () => {
  test('saves a note and lists it', async () => {
    const medplum = new MockClient();
    const { encounter } = await visitWithPrescription(medplum);
    await act(async () => {
      renderWithMedplum(medplum, <KenyaNursingNotes encounter={encounter} />);
    });
    expect(await screen.findByText('No nursing notes in this visit yet.')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'New nursing note' }), {
        target: { value: 'Slept well overnight. Afebrile.' },
      });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    });
    expect(await screen.findByText('Slept well overnight. Afebrile.')).toBeInTheDocument();
    const notes = await medplum.searchResources('DocumentReference', { encounter: `Encounter/${encounter.id}` });
    expect((notes[0] as DocumentReference).type?.coding?.[0].code).toBe('34746-8');
  });
});
