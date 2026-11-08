// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Stack } from '@mantine/core';
import { getReferenceString } from '@medplum/core';
import type { Resource, ResourceType } from '@medplum/fhirtypes';
import { ConditionIhrPanel } from '@medplum/kenya-react';
import { Document, LinkTabs, useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useParams } from 'react-router';
import classes from './ResourcePage.module.css';
import { useResourceType } from './useResourceType';

const tabs = ['Details', 'Edit', 'History'];

export function ResourcePage(): JSX.Element | null {
  const navigate = useNavigate();
  const medplum = useMedplum();
  const { resourceType, id } = useParams();
  const [resource, setResource] = useState<Resource | undefined>(undefined);

  useResourceType(resourceType, { onInvalidResourceType: () => navigate('..')?.catch(console.error) });

  useEffect(() => {
    if (resourceType && id) {
      medplum
        .readResource(resourceType as ResourceType, id)
        .then(setResource)
        .catch(console.error);
    }
  }, [medplum, resourceType, id, navigate]);

  if (!resource) {
    return null;
  }

  return (
    <Document key={getReferenceString(resource)}>
      <Stack>
        {/* Kenya: IHR (2005) notification of a notifiable diagnosis (shown only in Kenya projects) */}
        {resource.resourceType === 'Condition' && <ConditionIhrPanel condition={resource} />}
        <LinkTabs variant="pills" baseUrl={`/${resourceType}/${id}`} tabs={tabs} classNames={classes} />
        <Outlet />
      </Stack>
    </Document>
  );
}
