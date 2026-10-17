// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { JSX } from 'react';

interface SectionHeadingProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
}

export function SectionHeading(props: SectionHeadingProps): JSX.Element {
  const { eyebrow, title, description } = props;
  return (
    <div className="section-heading">
      <p className="eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="section-description">{description}</p>
    </div>
  );
}
