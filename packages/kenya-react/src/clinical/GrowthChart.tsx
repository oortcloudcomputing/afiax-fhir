// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { SimpleGrid, Stack, Text } from '@mantine/core';
import { formatDate, KenyaBmiLoinc } from '@medplum/core';
import type { Observation } from '@medplum/fhirtypes';
import type { JSX } from 'react';
import type { GrowthPoint as Point } from './clinical-utils';
import { getGrowthPoints } from './clinical-utils';

interface Series {
  readonly loinc: string;
  readonly title: string;
  readonly unit: string;
}

const series: readonly Series[] = [
  { loinc: '29463-7', title: 'Weight', unit: 'kg' },
  { loinc: '8302-2', title: 'Height', unit: 'cm' },
  { loinc: KenyaBmiLoinc, title: 'BMI', unit: 'kg/m²' },
];

/**
 * Growth chart: weight, height and BMI over time (DHA FUNC-CPOE-001 "BMI/Growth Charts").
 * @param props - The observations.
 * @param props.observations - Weight, height and BMI observations.
 * @returns The charts.
 */
export function GrowthChart({ observations }: { readonly observations: readonly Observation[] }): JSX.Element {
  const all = series.map((s) => ({ ...s, points: getGrowthPoints(observations, s.loinc) }));
  if (all.every((s) => s.points.length === 0)) {
    return <Text c="dimmed">No weight, height or BMI recorded yet.</Text>;
  }
  return (
    <SimpleGrid cols={{ base: 1, sm: 3 }} data-testid="growth-chart">
      {all.map((s) => (
        <LineChart key={s.loinc} title={s.title} unit={s.unit} points={s.points} />
      ))}
    </SimpleGrid>
  );
}

const W = 260;
const H = 140;
const PAD = 28;

function LineChart({ title, unit, points }: { title: string; unit: string; points: Point[] }): JSX.Element {
  const last = points.at(-1);
  if (!last) {
    return (
      <Stack gap={4}>
        <Text fw={500}>{title}</Text>
        <Text size="sm" c="dimmed">
          Not recorded
        </Text>
      </Stack>
    );
  }
  const minT = points[0].time;
  const maxT = Math.max(last.time, minT + 1);
  const values = points.map((p) => p.value);
  const minV = Math.min(...values);
  const maxV = Math.max(...values, minV + 1);
  const x = (t: number): number => PAD + ((t - minT) / (maxT - minT)) * (W - 2 * PAD);
  const y = (v: number): number => H - PAD - ((v - minV) / (maxV - minV)) * (H - 2 * PAD);
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.time).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');

  return (
    <Stack gap={4}>
      <Text fw={500}>
        {title}: {last.value} {unit}
      </Text>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`${title} over time`}>
        <line x1={PAD} y1={H - PAD} x2={W - PAD} y2={H - PAD} stroke="currentColor" opacity={0.3} />
        <line x1={PAD} y1={PAD} x2={PAD} y2={H - PAD} stroke="currentColor" opacity={0.3} />
        <text x={2} y={PAD} fontSize={9} fill="currentColor">
          {maxV}
        </text>
        <text x={2} y={H - PAD} fontSize={9} fill="currentColor">
          {minV}
        </text>
        <text x={PAD} y={H - 8} fontSize={9} fill="currentColor">
          {formatDate(new Date(minT).toISOString())}
        </text>
        <text x={W - PAD} y={H - 8} fontSize={9} fill="currentColor" textAnchor="end">
          {formatDate(new Date(last.time).toISOString())}
        </text>
        <path d={path} fill="none" stroke="var(--mantine-color-blue-6)" strokeWidth={2} />
        {points.map((p) => (
          <circle key={p.time} cx={x(p.time)} cy={y(p.value)} r={3} fill="var(--mantine-color-blue-6)" />
        ))}
      </svg>
    </Stack>
  );
}
