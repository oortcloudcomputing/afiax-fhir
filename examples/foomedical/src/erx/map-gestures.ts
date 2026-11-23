// SPDX-FileCopyrightText: Copyright Orangebot, Inc. and Medplum contributors
// SPDX-License-Identifier: Apache-2.0
//
// Maps that sit inside a scrolling page (every map in My Afiax): on a phone, one finger scrolls the
// page and two fingers move the map, with a short hint; on a computer, the mouse wheel scrolls the
// page unless Ctrl is held. Our own small version of leaflet-gesture-handling.

import L from 'leaflet';

/** Map options for a map inside a scrolling page. */
export const pageMapOptions: L.MapOptions = {
  scrollWheelZoom: false,
  // Leaflet's tap emulation is not needed in today's mobile browsers
  tapHold: false,
};

/**
 * Lets the page scroll over the map: two fingers (or Ctrl + wheel) move and zoom it.
 * @param map - The map.
 * @returns A function that removes the handlers.
 */
export function pageGestures(map: L.Map): () => void {
  const container = map.getContainer();
  const hint = L.DomUtil.create('div', '', container);
  hint.setAttribute('aria-hidden', 'true');
  hint.style.cssText =
    'position:absolute;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(0,0,0,.45);color:#fff;font:500 14px sans-serif;text-align:center;padding:16px;' +
    'opacity:0;transition:opacity .2s;pointer-events:none';
  let hideTimer: ReturnType<typeof setTimeout> | undefined;
  const show = (text: string): void => {
    hint.textContent = text;
    hint.style.opacity = '1';
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hint.style.opacity = '0';
    }, 1200);
  };

  const touch = (e: TouchEvent): void => {
    if (e.touches.length >= 2) {
      map.dragging.enable();
      hint.style.opacity = '0';
    } else {
      map.dragging.disable();
    }
  };
  const move = (e: TouchEvent): void => {
    if (e.touches.length === 1) {
      show('Use two fingers to move the map');
    }
  };
  const wheel = (e: WheelEvent): void => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      map.setZoom(map.getZoom() + (e.deltaY < 0 ? 1 : -1));
    } else {
      show('Hold Ctrl and scroll to zoom the map');
    }
  };
  if (L.Browser.touch) {
    map.dragging.disable();
    container.addEventListener('touchstart', touch, { passive: true });
    container.addEventListener('touchmove', move, { passive: true });
  }
  container.addEventListener('wheel', wheel, { passive: false });
  return () => {
    clearTimeout(hideTimer);
    container.removeEventListener('touchstart', touch);
    container.removeEventListener('touchmove', move);
    container.removeEventListener('wheel', wheel);
    hint.remove();
  };
}

/**
 * A "show where I am" button on the map (our own small version of leaflet.locatecontrol).
 * @param onFound - Called with the phone's position.
 * @returns The control, to add to a map.
 */
export function locateControl(onFound: (position: { lat: number; lng: number }) => void): L.Control {
  const Locate = L.Control.extend({
    onAdd(): HTMLElement {
      const bar = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
      const button = L.DomUtil.create('a', '', bar);
      button.href = '#';
      button.role = 'button';
      button.title = 'Show where I am';
      button.setAttribute('aria-label', 'Show where I am');
      button.innerHTML = '&#9678;';
      button.style.cssText = 'font-size:18px;line-height:30px;text-align:center';
      L.DomEvent.disableClickPropagation(bar);
      L.DomEvent.on(button, 'click', (e) => {
        L.DomEvent.preventDefault(e);
        navigator.geolocation?.getCurrentPosition(
          (p) => onFound({ lat: p.coords.latitude, lng: p.coords.longitude }),
          () => {
            button.title = 'Allow My Afiax to use your location';
          },
          { enableHighAccuracy: true, timeout: 15_000 }
        );
      });
      return bar;
    },
  });
  return new Locate({ position: 'bottomright' });
}
