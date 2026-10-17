// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import type { JSX } from 'react';

import { useSitePreferences } from './use-site-preferences';

function parseNumericPrice(price: string): number | undefined {
  const normalized = price.replace(/\$/g, '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return undefined;
  }

  return Number.parseFloat(normalized);
}

function formatCurrency(value: number): string {
  let fractionDigits = 2;
  if (value >= 100) {
    fractionDigits = 0;
  } else if (value >= 10) {
    fractionDigits = 1;
  }

  return `$${value.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}

function convertUnit(unit: string, billingView: 'hour' | 'month'): string {
  if (billingView === 'month') {
    return unit;
  }

  return unit.replace(/per month/i, 'per hr').replace(/\/ month/i, '/ hr');
}

export function PriceTag(props: {
  readonly price: string;
  readonly unit: string;
  readonly prefix?: string;
}): JSX.Element {
  const { price, unit, prefix } = props;
  const { billingView } = useSitePreferences();
  const numericPrice = parseNumericPrice(price);
  const canConvert = numericPrice !== undefined && /month/i.test(unit);

  const displayedPrice = canConvert
    ? formatCurrency(billingView === 'hour' ? numericPrice / 720 : numericPrice)
    : price;
  const displayedUnit = canConvert ? convertUnit(unit, billingView) : unit;

  return (
    <div className="price-lockup">
      {prefix ? <span className="price-prefix">{prefix}</span> : null}
      <span className="price-amount">{displayedPrice}</span>
      <span className="price-unit">{displayedUnit}</span>
    </div>
  );
}
