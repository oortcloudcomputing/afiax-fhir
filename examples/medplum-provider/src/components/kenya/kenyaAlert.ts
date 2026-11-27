// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
import { showNotification } from '@mantine/notifications';

/**
 * A short two-tone alert (no sound file): repeated when loud.
 * @param loud - Whether it is urgent (an emergency referral, a stat prescription).
 */
export function kenyaBeep(loud: boolean): void {
  try {
    const ctx = new AudioContext();
    const tones = loud ? [880, 660, 880, 660] : [660, 880];
    tones.forEach((hz, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = hz;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.15);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 1500);
  } catch {
    // No audio (autoplay blocked before any click): the pop-up still shows
  }
}

/** Asks once for browser notifications, so alerts reach staff working in another tab. */
export function askForBrowserNotifications(): void {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission().catch(() => undefined);
  }
}

/**
 * An alert in Afiax Provider: a pop-up with a sound, and a browser notification when the app is in
 * another tab or minimised.
 * @param title - The title.
 * @param body - The message.
 * @param loud - Whether it is urgent (stays until closed, longer sound).
 * @param color - The pop-up colour.
 * @param onClick - Where clicking the pop-up or notification goes.
 */
export function kenyaAlert(title: string, body: string, loud: boolean, color: string, onClick: () => void): void {
  showNotification({ title, message: body, color, autoClose: loud ? false : 15_000, onClick, style: { cursor: 'pointer' } });
  kenyaBeep(loud);
  if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
    const n = new Notification(title, { body, tag: title });
    n.onclick = () => {
      window.focus();
      onClick();
    };
  }
}
