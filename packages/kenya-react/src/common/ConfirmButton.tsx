// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import type { ButtonProps } from '@mantine/core';
import { Button, Group, Modal, Text } from '@mantine/core';
import type { JSX, ReactNode } from 'react';
import { useState } from 'react';

export interface ConfirmButtonProps extends Omit<ButtonProps, 'onClick'> {
  readonly children: ReactNode;
  /** Title of the confirmation dialog. */
  readonly title: string;
  /** What will happen, shown in the dialog. */
  readonly message: ReactNode;
  /** Label of the button that confirms (defaults to the button's own text). */
  readonly confirmLabel?: string;
  readonly confirmColor?: string;
  readonly onConfirm: () => void | Promise<void>;
}

/**
 * A button that asks "are you sure?" before acting, for steps that cannot be undone from the screen
 * (for example dispensing a medicine).
 * @param props - The component props.
 * @returns The button and its confirmation dialog.
 */
export function ConfirmButton(props: ConfirmButtonProps): JSX.Element {
  const { children, title, message, confirmLabel, confirmColor, onConfirm, ...buttonProps } = props;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm(): Promise<void> {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
      setOpen(false);
    }
  }

  return (
    <>
      <Button {...buttonProps} onClick={() => setOpen(true)}>
        {children}
      </Button>
      <Modal opened={open} onClose={() => setOpen(false)} title={title} centered>
        <Text mb="md">{message}</Text>
        <Group justify="flex-end">
          <Button variant="default" onClick={() => setOpen(false)} disabled={busy}>
            Go back
          </Button>
          <Button color={confirmColor} onClick={() => confirm()} loading={busy}>
            {confirmLabel ?? children}
          </Button>
        </Group>
      </Modal>
    </>
  );
}
