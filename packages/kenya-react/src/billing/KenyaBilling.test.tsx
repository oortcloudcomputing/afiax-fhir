// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaInsuranceTypeSystem, KenyaShaInterventionSystem } from '@medplum/core';
import type {
  ChargeItem,
  Claim,
  Coverage,
  Encounter,
  Invoice,
  Organization,
  Parameters,
  Patient,
  ValueSet,
} from '@medplum/fhirtypes';
import { MockClient } from '@medplum/mock';
import { within } from '@testing-library/react';
import { act, fireEvent, renderWithMedplum, screen, waitFor } from '../test-utils/render';
import { KenyaPatientCover } from './KenyaPatientCover';
import { KenyaVisitBilling } from './KenyaVisitBilling';
import { KenyaVisitClaim } from './KenyaVisitClaim';

async function visit(medplum: MockClient): Promise<{ patient: Patient; encounter: Encounter; charge: ChargeItem }> {
  const facility = await medplum.createResource<Organization>({ resourceType: 'Organization', name: 'Afya Clinic' });
  const patient = await medplum.createResource<Patient>({
    resourceType: 'Patient',
    name: [{ given: ['Akinyi'], family: 'Odhiambo' }],
  });
  const encounter = await medplum.createResource<Encounter>({
    resourceType: 'Encounter',
    status: 'finished',
    class: { code: 'AMB' },
    subject: { reference: `Patient/${patient.id}` },
    serviceProvider: { reference: `Organization/${facility.id}` },
    participant: [{ individual: { reference: 'Practitioner/dr1' } }],
  });
  const charge = await medplum.createResource<ChargeItem>({
    resourceType: 'ChargeItem',
    status: 'billable',
    code: { text: 'Consultation' },
    subject: { reference: `Patient/${patient.id}` },
    context: { reference: `Encounter/${encounter.id}` },
    quantity: { value: 1 },
    priceOverride: { value: 500, currency: 'KES' },
  });
  return { patient, encounter, charge };
}

function mockPost(medplum: MockClient, operations: Record<string, Parameters>): jest.SpyInstance {
  const realPost = medplum.post.bind(medplum);
  return jest.spyOn(medplum, 'post').mockImplementation(((url: string | URL, body: unknown) => {
    for (const [operation, result] of Object.entries(operations)) {
      if (url.toString().includes(operation)) {
        return Promise.resolve(result);
      }
    }
    return realPost(url, body);
  }) as typeof medplum.post);
}

describe('KenyaPatientCover', () => {
  test('adds SHA cover and checks eligibility', async () => {
    const medplum = new MockClient();
    const sha = await medplum.createResource<Organization>({
      resourceType: 'Organization',
      name: 'Social Health Authority',
      identifier: [{ system: KenyaInsuranceTypeSystem, value: 'sha' }],
    });
    const { patient } = await visit(medplum);
    const postSpy = mockPost(medplum, {
      '$check-coverage': {
        resourceType: 'Parameters',
        parameter: [
          { name: 'eligible', valueBoolean: true },
          { name: 'message', valueString: 'Member is eligible' },
        ],
      },
    });
    const onChange = jest.fn();
    await act(async () => {
      renderWithMedplum(medplum, <KenyaPatientCover patient={patient} onChange={onChange} />);
    });
    expect(await screen.findByText('No insurance cover recorded.')).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'ID number' }), { target: { value: '12345678' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add SHA cover' }));
    });
    expect(await screen.findByTestId('coverage-list')).toHaveTextContent('National ID: 12345678');
    const coverages = await medplum.searchResources('Coverage', { beneficiary: `Patient/${patient.id}` });
    expect((coverages[0] as Coverage).payor?.[0].reference).toBe(`Organization/${sha.id}`);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: coverages[0].id })]),
      expect.anything()
    );
    expect(screen.queryByRole('button', { name: 'Add SHA cover' })).not.toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Check eligibility' }));
    });
    expect(postSpy).toHaveBeenCalledWith(medplum.fhirUrl('Coverage', coverages[0].id, '$check-coverage'));
    expect(await screen.findByTestId('coverage-check-result')).toHaveTextContent('Member is eligible');
  });

  test('without the SHA organisation, cover cannot be added', async () => {
    const medplum = new MockClient();
    const { patient } = await visit(medplum);
    await act(async () => {
      renderWithMedplum(medplum, <KenyaPatientCover patient={patient} />);
    });
    expect(await screen.findByText(/The SHA is not set up/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add SHA cover' })).not.toBeInTheDocument();
  });
});

describe('KenyaVisitBilling', () => {
  test('creates the bill after confirmation and records a payment', async () => {
    const medplum = new MockClient();
    const { patient, encounter, charge } = await visit(medplum);
    await medplum.createResource<Invoice>({
      resourceType: 'Invoice',
      status: 'issued',
      identifier: [{ system: 'https://afiax.africa/kenya/identifier/invoice-number', value: 'INV-1' }],
      subject: { reference: `Patient/${patient.id}` },
      date: new Date().toISOString(),
      lineItem: [{ chargeItemReference: { reference: `ChargeItem/${charge.id}` } }],
      totalGross: { value: 500, currency: 'KES' },
    });
    const postSpy = mockPost(medplum, {
      '$kenya-invoice': {
        resourceType: 'Parameters',
        parameter: [{ name: 'total', valueMoney: { value: 500, currency: 'KES' } }],
      },
      '$kenya-payment': {
        resourceType: 'Parameters',
        parameter: [
          { name: 'receiptNumber', valueString: 'RCT-1' },
          { name: 'balance', valueMoney: { value: 0, currency: 'KES' } },
        ],
      },
    });
    await act(async () => {
      renderWithMedplum(medplum, <KenyaVisitBilling encounter={encounter} />);
    });
    expect(await screen.findByText('Bill INV-1')).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Create bill' }));
    });
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Bill 1 unbilled charge(s), KES 500');
    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'Create bill' }));
    });
    expect(postSpy).toHaveBeenCalledWith(
      medplum.fhirUrl('Encounter', encounter.id as string, '$kenya-invoice'),
      expect.anything()
    );

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: 'Amount (KES)' }), { target: { value: '500' } });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Record payment' }));
    });
    expect(postSpy).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: expect.stringContaining('$kenya-payment') }),
      {
        resourceType: 'Parameters',
        parameter: [
          { name: 'method', valueCode: 'cash' },
          { name: 'amount', valueDecimal: 500 },
        ],
      }
    );
    expect(await screen.findByTestId('payment-receipt')).toHaveTextContent('Receipt RCT-1. Balance KES 0.');
  });
});

describe('KenyaVisitClaim', () => {
  test('the cashier picks an SHA code per charge and makes the claim', async () => {
    const medplum = new MockClient();
    const { patient, encounter } = await visit(medplum);
    const coverage = await medplum.createResource<Coverage>({
      resourceType: 'Coverage',
      status: 'active',
      beneficiary: { reference: `Patient/${patient.id}` },
      payor: [{ reference: 'Organization/sha' }],
    });
    const consult = { system: KenyaShaInterventionSystem, code: 'SHA-01-001', display: 'Outpatient consultation' };
    const realGet = medplum.get.bind(medplum);
    jest
      .spyOn(medplum, 'get')
      .mockImplementation(((url: string | URL, options?: RequestInit) =>
        url.toString().includes('$knhts-search')
          ? Promise.resolve({ resourceType: 'ValueSet', expansion: { contains: [consult] } } as ValueSet)
          : realGet(url, options)) as typeof medplum.get);

    await act(async () => {
      renderWithMedplum(medplum, <KenyaVisitClaim patient={patient} encounter={encounter} shaCoverage={coverage} />);
    });
    const make = await screen.findByRole('button', { name: 'Make SHA claim' });
    expect(make).toBeDisabled();
    expect(screen.getByText(/no diagnosis/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(screen.getByRole('textbox', { name: /SHA benefit code for Consultation/ }), {
        target: { value: 'outp' },
      });
    });
    fireEvent.click(await screen.findByText('Outpatient consultation (SHA-01-001)', {}, { timeout: 3000 }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Make SHA claim' }));
    });

    await waitFor(async () => {
      const claims = await medplum.searchResources('Claim', { patient: `Patient/${patient.id}` });
      expect(claims).toHaveLength(1);
      expect(claims[0] as Claim).toMatchObject({
        provider: encounter.serviceProvider,
        insurance: [{ coverage: { reference: `Coverage/${coverage.id}` } }],
        item: [{ productOrService: { coding: [consult] }, net: { value: 500 } }],
      });
    });
  });

  test('without SHA cover it explains what is missing', async () => {
    const medplum = new MockClient();
    const { patient, encounter } = await visit(medplum);
    await act(async () => {
      renderWithMedplum(medplum, <KenyaVisitClaim patient={patient} encounter={encounter} />);
    });
    expect(await screen.findByText(/no active SHA cover/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Make SHA claim' })).not.toBeInTheDocument();
  });
});
