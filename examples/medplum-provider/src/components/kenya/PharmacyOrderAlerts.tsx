// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { KenyaDepartmentSystem } from '@medplum/core';
import { useMedplum } from '@medplum/react';
import type { JSX } from 'react';
import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { askForBrowserNotifications, kenyaAlert } from './kenyaAlert';

/** How often the pharmacy queue is checked for new prescriptions. */
const PollMs = 20_000;

/**
 * New prescriptions for the pharmacy, on every page of Afiax Provider: a pop-up with a sound, and a
 * browser notification when the app is in another tab. Urgent ones (stat, asap, urgent) stay until
 * closed. Clicking opens the pharmacy's Today view.
 * @returns Nothing visible (it shows notifications).
 */
export function PharmacyOrderAlerts(): JSX.Element | null {
  const medplum = useMedplum();
  const navigate = useNavigate();
  const seen = useRef<Set<string>>(undefined);

  useEffect(() => {
    askForBrowserNotifications();
    let stopped = false;
    const tick = async (): Promise<void> => {
      const tasks = await medplum.searchResources(
        'Task',
        new URLSearchParams([
          ['performer', `${KenyaDepartmentSystem}|pharmacy`],
          ['status', 'requested'],
          ['_sort', '-authored-on'],
          ['_count', '50'],
          ['_elements', 'id,description,priority,authoredOn'],
        ]),
        { cache: 'no-cache' }
      );
      if (stopped) {
        return;
      }
      const before = seen.current;
      seen.current = new Set(tasks.map((t) => t.id));
      if (!before) {
        return; // the first look only learns what is there
      }
      const fresh = tasks.filter((t) => !before.has(t.id));
      if (fresh.length === 0) {
        return;
      }
      const urgent = fresh.some((t) => t.priority && t.priority !== 'routine');
      const title = `${urgent ? 'URGENT: ' : ''}${fresh.length === 1 ? 'New prescription' : `${fresh.length} new prescriptions`}`;
      const body = fresh
        .map((t) => t.description)
        .filter(Boolean)
        .slice(0, 3)
        .join(', ');
      kenyaAlert(title, body || 'Open Pharmacy to see it.', urgent, urgent ? 'red' : 'blue', () =>
        navigate('/kenya/pharmacy')?.catch(console.error)
      );
    };
    const run = (): void => {
      tick().catch(() => undefined);
    };
    run();
    const timer = setInterval(run, PollMs);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [medplum, navigate]);

  return null;
}
