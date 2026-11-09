// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { KenyaDepartmentCode } from '@medplum/core';
import { KenyaDepartmentQueue } from '@medplum/kenya-react';
import { Document } from '@medplum/react';
import type { JSX } from 'react';
import { useNavigate, useParams } from 'react-router';

/**
 * Kenya department queues (pharmacy, laboratory, radiology, ...): the orders routed to a department.
 * @returns The queue page.
 */
export function DepartmentQueuePage(): JSX.Element {
  const navigate = useNavigate();
  const { department = 'pharmacy' } = useParams() as { department?: KenyaDepartmentCode };
  return (
    <Document>
      <KenyaDepartmentQueue
        department={department}
        onDepartmentChange={(value) => navigate(`/kenya/queue/${value}`)?.catch(console.error)}
      />
    </Document>
  );
}
