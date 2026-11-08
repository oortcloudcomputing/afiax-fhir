// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Select, Text } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { AccessPolicy, Reference, UserConfiguration } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useState } from 'react';

/** A Kenya staff role as returned by POST admin/projects/:id/kenya/staff-roles. */
export interface KenyaStaffRoleOption {
  readonly code: string;
  readonly display: string;
  readonly description: string;
  readonly admin: boolean;
  readonly userConfiguration: Reference<UserConfiguration>;
  readonly accessPolicy?: Reference<AccessPolicy>;
}

export interface KenyaStaffRoleSelectProps {
  readonly projectId: string;
  readonly onChange: (role: KenyaStaffRoleOption | undefined) => void;
}

/**
 * Role picker for inviting Kenya facility staff. Loading it creates (or refreshes) the role menus and
 * access policies in the project, so a role always points at the current definitions.
 * @param props - The component props.
 * @returns The role picker.
 */
export function KenyaStaffRoleSelect(props: KenyaStaffRoleSelectProps): JSX.Element {
  const medplum = useMedplum();
  const { projectId, onChange } = props;
  const [roles, setRoles] = useState<KenyaStaffRoleOption[]>();
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    medplum
      .post<KenyaStaffRoleOption[]>(`admin/projects/${projectId}/kenya/staff-roles`, {})
      .then(setRoles)
      .catch((err) => setError(normalizeErrorString(err)));
  }, [medplum, projectId]);

  const role = roles?.find((r) => r.code === selected);
  return (
    <div>
      <Select
        label="Staff role"
        description="Sets the person's menu and what they can see and change. Leave empty to choose an access policy by hand."
        placeholder={roles ? 'Choose a role' : 'Loading roles…'}
        data={(roles ?? []).map((r) => ({ value: r.code, label: r.display }))}
        value={selected}
        clearable
        error={error}
        onChange={(code) => {
          setSelected(code);
          onChange(roles?.find((r) => r.code === code));
        }}
      />
      {role && (
        <Text size="sm" c="dimmed" mt={4}>
          {role.description}
        </Text>
      )}
    </div>
  );
}
