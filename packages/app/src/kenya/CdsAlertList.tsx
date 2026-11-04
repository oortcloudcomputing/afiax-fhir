// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Alert, Stack, Text } from '@mantine/core';
import type { KenyaCdsAlert, KenyaCdsSeverity } from '@medplum/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import type { JSX } from 'react';

const colors: Record<KenyaCdsSeverity, string> = { high: 'red', moderate: 'orange', low: 'yellow' };

export interface CdsAlertListProps {
  readonly alerts: readonly KenyaCdsAlert[];
  readonly emptyText?: string;
}

/**
 * Shows clinical decision support alerts, most severe first, each with its recommendation and evidence.
 * @param props - The component props.
 * @param props.alerts - The alerts.
 * @param props.emptyText - Text shown when there are no alerts.
 * @returns The list.
 */
export function CdsAlertList({ alerts, emptyText }: CdsAlertListProps): JSX.Element | null {
  if (alerts.length === 0) {
    return emptyText ? (
      <Alert color="green" icon={<IconCircleCheck size={16} />} data-testid="cds-clear">
        {emptyText}
      </Alert>
    ) : null;
  }
  return (
    <Stack gap="xs" data-testid="cds-alerts">
      {alerts.map((alert) => (
        <Alert
          key={`${alert.id}|${alert.implicated.join(',')}`}
          color={colors[alert.severity]}
          icon={alert.severity === 'high' ? <IconAlertTriangle size={16} /> : <IconInfoCircle size={16} />}
          title={alert.title}
        >
          <Text size="sm">{alert.detail}</Text>
          <Text size="sm" fw={500}>
            {alert.recommendation}
          </Text>
          <Text size="xs" c="dimmed">
            Evidence: {alert.evidence}
          </Text>
        </Alert>
      ))}
    </Stack>
  );
}
