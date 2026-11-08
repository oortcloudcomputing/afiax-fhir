// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { Select } from '@mantine/core';
import { normalizeErrorString } from '@medplum/core';
import type { Coding, ValueSet } from '@medplum/fhirtypes';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';

/** What to search for in KNHTS (see the server's $knhts-search operation). */
export type KnhtsSearchKind =
  | 'medication'
  | 'ingredient'
  | 'laboratory'
  | 'radiology'
  | 'intervention'
  | 'allergy'
  | 'diagnosis'
  | 'sha-intervention';

export interface KnhtsCodeInputProps {
  readonly kind: KnhtsSearchKind;
  readonly label: string;
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly value: Coding | undefined;
  readonly onChange: (value: Coding | undefined) => void;
}

/**
 * A searchable picker for national (KNHTS) codes: medicines from the HPT registry, investigations,
 * ICHI interventions, allergy codes, ICD-11 diagnoses or SHA benefit codes.
 * @param props - The component props.
 * @returns The picker.
 */
export function KnhtsCodeInput(props: KnhtsCodeInputProps): JSX.Element {
  const medplum = useMedplum();
  const { kind, value, onChange } = props;
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Coding[]>([]);
  const [error, setError] = useState<string>();
  const latest = useRef(0);

  useEffect(() => {
    const filter = search.trim();
    if (filter.length < 2 || (value && filter === label(value))) {
      return undefined;
    }
    const request = ++latest.current;
    const timer = setTimeout(() => {
      const url = medplum.fhirUrl('$knhts-search');
      url.searchParams.set('kind', kind);
      url.searchParams.set('filter', filter);
      medplum
        .get<ValueSet>(url, { cache: 'no-cache' })
        .then((result) => {
          if (request === latest.current) {
            setOptions(result.expansion?.contains ?? []);
            setError(undefined);
          }
        })
        .catch((err) => {
          if (request === latest.current) {
            setError(normalizeErrorString(err));
          }
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [medplum, kind, search, value]);

  const all = value && !options.some((o) => o.code === value.code) ? [value, ...options] : options;
  return (
    <Select
      label={props.label}
      placeholder={props.placeholder ?? 'Type to search KNHTS'}
      required={props.required}
      searchable
      clearable
      searchValue={search}
      onSearchChange={setSearch}
      data={all.map((c) => ({ value: c.code as string, label: label(c) }))}
      filter={({ options: items }) => items}
      value={value?.code ?? null}
      onChange={(code) => onChange(all.find((c) => c.code === code))}
      nothingFoundMessage={search.trim().length < 2 ? 'Type at least 2 letters' : 'No KNHTS match'}
      error={error}
    />
  );
}

function label(coding: Coding): string {
  return coding.display ? `${coding.display} (${coding.code})` : (coding.code ?? '');
}
