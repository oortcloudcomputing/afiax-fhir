// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
'use client';

import {
  Container as MedplumContainer,
  DescriptionList as MedplumDescriptionList,
  DescriptionListEntry as MedplumDescriptionListEntry,
  InfoBar as MedplumInfoBar,
  Panel as MedplumPanel,
  StatusBadge as MedplumStatusBadgeBase,
} from '@medplum/react';
import type { ComponentProps, JSX } from 'react';

export function Container(props: ComponentProps<typeof MedplumContainer>): JSX.Element {
  return <MedplumContainer {...props} />;
}

export function Panel(props: ComponentProps<typeof MedplumPanel>): JSX.Element {
  return <MedplumPanel {...props} />;
}

export function DescriptionList(props: ComponentProps<typeof MedplumDescriptionList>): JSX.Element {
  return <MedplumDescriptionList {...props} />;
}

export function DescriptionListEntry(props: ComponentProps<typeof MedplumDescriptionListEntry>): JSX.Element {
  return <MedplumDescriptionListEntry {...props} />;
}

export function InfoBar(props: ComponentProps<typeof MedplumInfoBar>): JSX.Element {
  return <MedplumInfoBar {...props} />;
}

export function InfoBarEntry(props: ComponentProps<typeof MedplumInfoBar.Entry>): JSX.Element {
  return <MedplumInfoBar.Entry {...props} />;
}

export function InfoBarKey(props: ComponentProps<typeof MedplumInfoBar.Key>): JSX.Element {
  return <MedplumInfoBar.Key {...props} />;
}

export function InfoBarValue(props: ComponentProps<typeof MedplumInfoBar.Value>): JSX.Element {
  return <MedplumInfoBar.Value {...props} />;
}

export function MedplumStatusBadge(props: ComponentProps<typeof MedplumStatusBadgeBase>): JSX.Element {
  return <MedplumStatusBadgeBase {...props} />;
}
