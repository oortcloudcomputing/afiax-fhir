// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import type { WithId } from '@medplum/core';
import { KenyaIcd11System } from '@medplum/core';
import type { Encounter, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import ConditionModal from './ConditionModal';

const mockPatient: WithId<Patient> = {
  resourceType: 'Patient',
  id: 'patient-123',
  name: [{ given: ['John'], family: 'Doe' }],
};

const mockEncounter: WithId<Encounter> = {
  resourceType: 'Encounter',
  id: 'encounter-123',
  status: 'in-progress',
  class: {
    system: 'http://terminology.hl7.org/CodeSystem/v3-ActCode',
    code: 'AMB',
  },
  subject: { reference: 'Patient/patient-123' },
};

describe('ConditionModal', () => {
  let medplum: MockClient;

  beforeEach(() => {
    medplum = new MockClient();
    vi.clearAllMocks();
  });

  const setup = (props: Partial<Parameters<typeof ConditionModal>[0]> = {}): ReturnType<typeof render> => {
    return render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ConditionModal patient={mockPatient} encounter={mockEncounter} onSubmit={vi.fn()} {...props} />
        </MantineProvider>
      </MedplumProvider>
    );
  };

  test('renders form fields', () => {
    setup();
    expect(screen.getByText('ICD-10 Code')).toBeInTheDocument();
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });

  test('renders required field indicators', () => {
    setup();
    const requiredMarkers = screen.getAllByText('*');
    expect(requiredMarkers.length).toBeGreaterThan(0);
  });

  test('renders ICD-10 code input', () => {
    setup();
    expect(screen.getByText('ICD-10 Code')).toBeInTheDocument();
  });

  test('renders status input', () => {
    setup();
    expect(screen.getByText('Status')).toBeInTheDocument();
  });

  test('renders save button', () => {
    setup();
    const saveButton = screen.getByRole('button', { name: 'Save' });
    expect(saveButton).toBeInTheDocument();
  });

  test('form is wrapped in Form component', () => {
    const { container } = setup();
    const form = container.querySelector('form');
    expect(form).toBeInTheDocument();
  });
});

describe('ConditionModal in a Kenya project', () => {
  test('diagnoses are coded in ICD-11 from KNHTS, shaped for DHA', async () => {
    const medplum = new MockClient();
    vi.spyOn(medplum, 'getProject').mockReturnValue({
      resourceType: 'Project',
      id: 'project-ke',
      setting: [{ name: 'countryPack', valueString: 'kenya' }],
    });
    const realGet = medplum.get.bind(medplum);
    vi.spyOn(medplum, 'get').mockImplementation(((url: string | URL, options?: RequestInit) =>
      url.toString().includes('$knhts-search')
        ? Promise.resolve({
            resourceType: 'ValueSet',
            expansion: {
              contains: [{ system: KenyaIcd11System, code: '1F40.Z', display: 'Malaria, unspecified' }],
            },
          })
        : realGet(url, options)) as typeof medplum.get);
    const onSubmit = vi.fn();
    render(
      <MedplumProvider medplum={medplum}>
        <MantineProvider>
          <ConditionModal patient={mockPatient} encounter={mockEncounter} onSubmit={onSubmit} />
        </MantineProvider>
      </MedplumProvider>
    );
    // No ICD-10 picker in Kenya
    expect(screen.queryByText('ICD-10 Code')).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /Diagnosis \(ICD-11\)/ }), {
        target: { value: 'malaria' },
      });
    });
    fireEvent.click(await screen.findByText('Malaria, unspecified (1F40.Z)', {}, { timeout: 3000 }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        code: expect.objectContaining({
          coding: [expect.objectContaining({ system: KenyaIcd11System, code: '1F40.Z' })],
        }),
        category: [expect.objectContaining({ coding: [expect.objectContaining({ code: 'encounter-diagnosis' })] })],
        verificationStatus: expect.objectContaining({ coding: [expect.objectContaining({ code: 'provisional' })] }),
        encounter: expect.objectContaining({ reference: 'Encounter/encounter-123' }),
      })
    );
    expect(onSubmit.mock.calls[0][0].meta?.profile).toBeUndefined();
  });
});
