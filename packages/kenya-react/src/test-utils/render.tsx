// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import type { MedplumClient } from '@medplum/core';
import { MedplumProvider } from '@medplum/react';
import type { RenderResult } from '@testing-library/react';
import { act, fireEvent, screen, render as testingLibraryRender, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

export { act, fireEvent, screen, waitFor };

/**
 * Renders a component inside Mantine and Medplum providers, as an app would.
 * @param medplum - The Medplum client, typically a MockClient.
 * @param ui - The component to render.
 * @param navigate - The navigate function the app would supply.
 * @returns The rendered result.
 */
export function renderWithMedplum(
  medplum: MedplumClient,
  ui: ReactNode,
  navigate: (path: string) => void = () => undefined
): RenderResult {
  return testingLibraryRender(
    <MantineProvider>
      <MedplumProvider medplum={medplum} navigate={navigate}>
        {ui}
        <Notifications />
      </MedplumProvider>
    </MantineProvider>
  );
}
