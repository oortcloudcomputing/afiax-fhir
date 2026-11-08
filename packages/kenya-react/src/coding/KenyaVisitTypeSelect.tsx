// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Select } from '@mantine/core';
import { KenyaEncounterTypes } from '@medplum/core';
import type { JSX } from 'react';

export interface KenyaVisitTypeSelectProps {
  readonly label?: string;
  readonly required?: boolean;
  readonly value: string | null;
  readonly onChange: (code: string | null) => void;
}

/**
 * Picker for the KNHTS visit type (outpatient, emergency, MCH, ANC, ...).
 * @param props - The component props.
 * @returns The picker.
 */
export function KenyaVisitTypeSelect(props: KenyaVisitTypeSelectProps): JSX.Element {
  return (
    <Select
      label={props.label ?? 'Visit type'}
      required={props.required}
      data={KenyaEncounterTypes.map((t) => ({ value: t.code, label: t.display }))}
      value={props.value}
      onChange={props.onChange}
      allowDeselect={false}
    />
  );
}
