// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { MockClient } from '@medplum/mock';
import { MedplumProvider } from '@medplum/react';
import { act, render, screen } from '@testing-library/react';
import { Suspense } from 'react';
import type { JSX } from 'react';
import { MemoryRouter } from 'react-router';
import { measurementsMeta } from './health-record/Measurement.data';
import { GetCare } from './GetCarePage';
import { HomePage } from './HomePage';

async function setup(element: JSX.Element): Promise<void> {
  await act(async () => {
    render(
      <MemoryRouter>
        <MedplumProvider medplum={new MockClient()}>
          <MantineProvider>
            <Suspense fallback={<div>Loading...</div>}>{element}</Suspense>
          </MantineProvider>
        </MedplumProvider>
      </MemoryRouter>
    );
  });
}

test('Home page links only to working parts of the portal', async () => {
  await setup(<HomePage />);
  expect(screen.getByText('Get care')).toBeInTheDocument();
  for (const title of ['Health record', 'Medicines', 'Care plan', 'Messages']) {
    expect(screen.getByText(title)).toBeInTheDocument();
  }
  expect(document.body.textContent).not.toMatch(/Walgreens|FSA|HSA|Lorem/);
});

test('Get care has no placeholder questions', async () => {
  await setup(<GetCare />);
  expect(await screen.findByText('Get care')).toBeInTheDocument();
  expect(document.body.textContent).not.toMatch(/Question 1/);
});

test('Vital signs use metric units and valid UCUM codes', () => {
  const datasets = Object.values(measurementsMeta).flatMap((m) => m.chartDatasets);
  expect(datasets.map((d) => d.unit)).not.toEqual(expect.arrayContaining(['in', 'lbs']));
  expect(measurementsMeta.height.chartDatasets[0].ucum).toBe('cm');
  expect(measurementsMeta.weight.chartDatasets[0].ucum).toBe('kg');
  expect(measurementsMeta['body-temperature'].chartDatasets[0].ucum).toBe('Cel');
  const bp = measurementsMeta['blood-pressure'].chartDatasets;
  expect(bp.map((d) => d.code).sort()).toEqual(['8462-4', '8480-6']);
});
