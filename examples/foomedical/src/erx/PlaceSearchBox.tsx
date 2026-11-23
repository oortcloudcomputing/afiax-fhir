// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Type a place, pick one of the matches.

import { Autocomplete, Loader } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import type { JSX } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Place, PlaceSearch } from './places';

export interface PlaceSearchBoxProps {
  readonly search: PlaceSearch;
  readonly onPick: (place: Place) => void;
  readonly label?: string;
  readonly placeholder?: string;
}

/**
 * A search box for places (waits until typing pauses).
 * @param props - The component props.
 * @returns The box.
 */
export function PlaceSearchBox(props: PlaceSearchBoxProps): JSX.Element {
  const { search, onPick, label, placeholder = 'Area, estate, street or building' } = props;
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; places: Place[] }>();
  const [searching, setSearching] = useState(false);
  const latest = useRef('');

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 3) {
      return undefined;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      search(q)
        .then((places) => {
          if (latest.current === q) {
            setFound({ query: q, places });
          }
        })
        .catch(() => undefined)
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const places = found?.query === query.trim() ? found.places : [];
  return (
    <Autocomplete
      label={label}
      placeholder={placeholder}
      leftSection={<IconSearch size={16} />}
      rightSection={searching ? <Loader size="xs" /> : null}
      value={query}
      onChange={setQuery}
      data={places.map((p, i) => ({ value: `${i}`, label: p.label }))}
      filter={({ options }) => options}
      onOptionSubmit={(value) => {
        const place = places[Number(value)];
        if (place) {
          setQuery(place.label);
          onPick(place);
        }
      }}
      comboboxProps={{ withinPortal: false }}
    />
  );
}
