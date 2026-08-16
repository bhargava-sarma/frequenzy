import { create } from 'zustand';

import type { OriginRect } from './usePlayerUiStore';

/**
 * Where the last press happened, so the screen it opens can grow out of it.
 *
 * A detail screen has no idea which row you tapped — the navigator hands it
 * route params, not coordinates. Rather than thread a rect through every
 * navigate() call, every pressable records where it was, and whichever screen
 * mounts next takes it.
 *
 * Recorded presses expire. Most presses don't navigate anywhere, and a screen
 * opening a minute later from a notification or a back gesture should rise
 * from nothing in particular rather than from a button pressed long ago.
 */

/** How long a recorded press stays usable as an origin. */
const ORIGIN_TTL_MS = 600;

interface RecordedOrigin extends OriginRect {
  at: number;
}

interface TransitionStore {
  origin: RecordedOrigin | null;
  recordOrigin: (rect: OriginRect) => void;
  /** Takes the origin and clears it, so it is used by exactly one screen. */
  consumeOrigin: () => OriginRect | null;
}

export const useTransitionStore = create<TransitionStore>((set, get) => ({
  origin: null,

  recordOrigin: (rect) => set({ origin: { ...rect, at: Date.now() } }),

  consumeOrigin: () => {
    const current = get().origin;
    set({ origin: null });

    if (!current) return null;
    if (Date.now() - current.at > ORIGIN_TTL_MS) return null;

    const { at: _at, ...rect } = current;
    return rect;
  },
}));
