import { AppState } from 'react-native';
import { create } from 'zustand';

import { readSystemColors } from '../native/materialYou';
import type { SystemColors } from './material';

/**
 * The wallpaper's colours, kept current.
 *
 * Read once at start and again whenever the app comes back to the front —
 * a new wallpaper is chosen in another app, so returning is when it would
 * show. Reading is one synchronous native call of a few dozen colour
 * lookups; the store only changes when the colours actually did, so the
 * theme isn't rebuilt on every resume.
 */

interface SystemColorsStore {
  colors: SystemColors | null;
  refresh: () => void;
}

function keyOf(colors: SystemColors | null): string {
  if (!colors) return '';
  return JSON.stringify([colors.light, colors.dark, colors.palettes]);
}

export const useSystemColorsStore = create<SystemColorsStore>((set, get) => ({
  colors: readSystemColors(),
  refresh: () => {
    const next = readSystemColors();
    if (keyOf(next) === keyOf(get().colors)) return;
    set({ colors: next });
  },
}));

let watching = false;

/** Re-reads on every return to the front. Idempotent. */
export function watchSystemColors(): void {
  if (watching) return;
  watching = true;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') useSystemColorsStore.getState().refresh();
  });
}
