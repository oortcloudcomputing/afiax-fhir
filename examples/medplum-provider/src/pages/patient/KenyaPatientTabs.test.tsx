// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { Condition, Project } from '@medplum/fhirtypes';
import { HomerSimpson, MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, test, vi } from 'vitest';
import { App } from '../../App';
import { act, render, screen } from '../../test-utils/render';
import { getPatientPageTabs } from './PatientPage.utils';

const kenyaProject: Project = {
  resourceType: 'Project',
  id: 'project-ke',
  setting: [{ name: 'countryPack', valueString: 'kenya' }],
};

function kenyaClient(): MockClient {
  const medplum = new MockClient();
  vi.spyOn(medplum, 'getProject').mockReturnValue(kenyaProject);
  return medplum;
}

async function setup(medplum: MockClient, url: string): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter initialEntries={[url]}>
        <MedplumProvider medplum={medplum}>
          <App />
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

describe('Kenya patient chart in the provider app', () => {
  test('Kenya projects get the Clinical summary and National records tabs, and no DoseSpot tab', () => {
    const doseSpotMember = {
      resourceType: 'ProjectMembership' as const,
      project: { reference: 'Project/p' },
      user: { reference: 'User/u' },
      profile: { reference: 'Practitioner/p' },
      identifier: [{ system: 'https://dosespot.com/clinician-id', value: '1' }],
    };
    const kenyaTabs = getPatientPageTabs(doseSpotMember, true).map((t) => t.label);
    expect(kenyaTabs).toEqual(expect.arrayContaining(['Clinical summary', 'Vaccinations', 'National records']));
    expect(kenyaTabs).not.toContain('DoseSpot');
    expect(getPatientPageTabs(undefined).map((t) => t.label)).not.toContain('Clinical summary');
  });

  test('the Clinical summary tab shows the Kenya clinical summary', async () => {
    await setup(kenyaClient(), `/Patient/${HomerSimpson.id}/kenya-summary`);
    expect(await screen.findByText('Clinical summary', { selector: 'h4' })).toBeInTheDocument();
  });

  test('the Vaccinations tab shows the history and the record form', async () => {
    await setup(kenyaClient(), `/Patient/${HomerSimpson.id}/kenya-immunizations`);
    expect(await screen.findByText('Record vaccination')).toBeInTheDocument();
    expect(screen.getByText('Vaccination history')).toBeInTheDocument();
  });

  test('the National records tab shows the DHA identity and SHR publication panels', async () => {
    await setup(kenyaClient(), `/Patient/${HomerSimpson.id}/kenya-national`);
    expect(await screen.findByText('DHA Client Registry')).toBeInTheDocument();
    expect(screen.getByText('Kenya SHR Publication')).toBeInTheDocument();
  });

  test('a diagnosis page shows the IHR panel in Kenya projects', async () => {
    const medplum = kenyaClient();
    const condition = await medplum.createResource<Condition>({
      resourceType: 'Condition',
      subject: { reference: `Patient/${HomerSimpson.id}` },
      code: { coding: [{ system: 'http://id.who.int/icd/release/11/mms', code: '1F40.Z', display: 'Malaria' }] },
    });
    await setup(medplum, `/Condition/${condition.id}`);
    expect(await screen.findByText('IHR (2005) International Notification')).toBeInTheDocument();
  });
});
