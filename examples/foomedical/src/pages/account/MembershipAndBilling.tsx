// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Box, Table, Title } from '@mantine/core';
import { formatCoding, formatDate, formatMoney, getReferenceString } from '@medplum/core';
import type { Coverage, Patient, PaymentNotice } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { InfoSection } from '../../components/InfoSection';

function CoverageTable({ coverages }: { coverages: Coverage[] }): JSX.Element {
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Insurer</Table.Th>
          <Table.Th>Member number</Table.Th>
          <Table.Th>Relationship to member</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {coverages.map((c) => (
          <Table.Tr key={c.id}>
            <Table.Td>{c.payor?.[0]?.display || '-'}</Table.Td>
            <Table.Td>{c.subscriberId || '-'}</Table.Td>
            <Table.Td>{formatCoding(c.relationship?.coding?.[0]) || '-'}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

function PaymentTable({ payments }: { payments: PaymentNotice[] }): JSX.Element {
  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Date</Table.Th>
          <Table.Th>Receipt</Table.Th>
          <Table.Th>Amount</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {payments.map((p) => (
          <Table.Tr key={p.id}>
            <Table.Td>{formatDate(p.paymentDate) || '-'}</Table.Td>
            <Table.Td>{p.identifier?.[0]?.value || '-'}</Table.Td>
            <Table.Td>{p.amount ? formatMoney(p.amount) : '-'}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

export function MembershipAndBilling(): JSX.Element {
  const medplum = useMedplum();
  const patient = medplum.getProfile() as Patient;
  const coverages = medplum
    .searchResources('Coverage', {
      beneficiary: getReferenceString(patient),
    })
    .read();
  const payments = medplum.searchResources('PaymentNotice', { _sort: '-created' }).read();

  return (
    <Box p="xl">
      <Title mb="xl">Cover and payments</Title>
      <InfoSection title="Your cover">
        {coverages.length === 0 ? <Box p="xl">No cover on record</Box> : <CoverageTable coverages={coverages} />}
      </InfoSection>
      <InfoSection title="Payments">
        {payments.length === 0 ? <Box p="xl">No payments on record</Box> : <PaymentTable payments={payments} />}
      </InfoSection>
    </Box>
  );
}
