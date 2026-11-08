// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

export interface LogoProps {
  readonly width: number;
}

/**
 * The My Afiax wordmark: "My" in Midnight Blue and "Afiax" in Cerulean (Afiax brand colours).
 * @param props - The logo properties.
 * @returns The wordmark as an inline SVG, scaled to the given width.
 */
export function Logo(props: LogoProps): JSX.Element {
  const width = props.width;
  const height = Math.round((60 / 300) * width);
  return (
    <svg
      viewBox="0 0 300 60"
      xmlns="http://www.w3.org/2000/svg"
      style={{ width, height }}
      role="img"
      aria-label="My Afiax"
    >
      <text x="0" y="46" fontFamily="'DM Sans', sans-serif" fontSize="48" fontWeight="700">
        <tspan fill="#1B2A4A">My </tspan>
        <tspan fill="#00A9E0">Afiax</tspan>
      </text>
    </svg>
  );
}
