// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaPatientIdentifierSystems } from '@medplum/core';
import type { Parameters, Patient } from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { KenyaPatientWizard } from './KenyaPatientWizard';

function registryFound(): Parameters {
  return {
    resourceType: 'Parameters',
    parameter: [
      {
        name: 'result',
        valueString: JSON.stringify({
          message: {
            found: 1,
            client_registry_id: 'CR-0001',
            first_name: 'Baraka',
            last_name: 'Mwangi',
            date_of_birth: '1990-01-15',
            gender: 'male',
          },
        }),
      },
    ],
  };
}

describe('KenyaPatientWizard', () => {
  test('registers a person found in the DHA Client Registry', async () => {
    const medplum = new MockClient();
    const realPost = medplum.post.bind(medplum);
    const postSpy = jest.spyOn(medplum, 'post').mockImplementation(((url: string | URL, body: unknown) => {
      if (url.toString().includes('$kenya-registry-lookup')) {
        return Promise.resolve(registryFound());
      }
      return realPost(url, body);
    }) as typeof medplum.post);
    const onRegistered = jest.fn();

    await act(async () => {
      renderWithMedplum(medplum, <KenyaPatientWizard onRegistered={onRegistered} />);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('ID Number'), { target: { value: '12345678' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search DHA Registry' }));
    });
    // The lookup goes through the FHIR operation, not the admin-only endpoint
    expect(postSpy).toHaveBeenCalledWith(
      medplum.fhirUrl('Patient', '$kenya-registry-lookup'),
      expect.objectContaining({
        parameter: [
          { name: 'identificationType', valueString: 'National ID' },
          { name: 'identificationNumber', valueString: '12345678' },
        ],
      })
    );

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Check System Records' }));
    });
    // No existing record, so the wizard moves on to the registration form
    expect(await screen.findByLabelText(/Given Name/)).toHaveValue('Baraka');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Patient' }));
    });

    await waitFor(() => expect(onRegistered).toHaveBeenCalled());
    const patient = onRegistered.mock.calls[0][0] as Patient;
    expect(patient.name?.[0]).toMatchObject({ family: 'Mwangi', given: ['Baraka'] });
    expect(patient.identifier).toContainEqual(
      expect.objectContaining({ system: KenyaPatientIdentifierSystems['National ID'], value: '12345678' })
    );
  });

  test('without onRegistered it opens the new patient', async () => {
    const medplum = new MockClient();
    const realPost = medplum.post.bind(medplum);
    jest
      .spyOn(medplum, 'post')
      .mockImplementation(((url: string | URL, body: unknown) =>
        url.toString().includes('$kenya-registry-lookup')
          ? Promise.resolve(registryFound())
          : realPost(url, body)) as typeof medplum.post);
    const navigate = jest.fn();

    await act(async () => {
      renderWithMedplum(medplum, <KenyaPatientWizard />, navigate);
    });
    await act(async () => {
      fireEvent.change(screen.getByLabelText('ID Number'), { target: { value: '12345678' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Search DHA Registry' }));
    });
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'Check System Records' }));
    });
    // No existing record, so the wizard moves on to the registration form
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create Patient' }));
    });
    await waitFor(() => expect(navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/Patient\/.+/)));
  });
});
