// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert } from '@mantine/core';
import { KenyaOfferRequests } from '@medplum/kenya-react';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { getConfig } from '../../config';

/**
 * Offer requests of the Afiax Prescription Network (ADR-016 §3b): a chemist answers nearby
 * patients' requests for a price, then prepares and hands over the chosen ones.
 * @returns The page.
 */
export function OfferRequestsPage(): JSX.Element {
  const servicesUrl = getConfig().afiaxServicesUrl;
  return (
    <Document>
      {servicesUrl ? (
        <KenyaOfferRequests servicesUrl={servicesUrl} />
      ) : (
        <Alert color="orange" title="Offer requests are not set up here">
          This Afiax Provider has no afiax-services address (MEDPLUM_AFIAX_SERVICES_URL). Contact your Afiax
          administrator.
        </Alert>
      )}
    </Document>
  );
}
