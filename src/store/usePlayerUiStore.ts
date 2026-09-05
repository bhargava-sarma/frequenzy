import { create } from 'zustand';

/**
 * Whether the full player is showing, and where it grew from.
 *
 * The player used to be a screen on the root stack. Two things were wrong
 * with that. Android's stack detaches the screen underneath, which is what
 * left a black rectangle behind after a swipe-down dismissal; and a stack can
 * only slide a screen in from an edge, when what this should do is expand out
 * of the dock you pressed.
 *
 * As an overlay above the navigator it never unmounts anything, so there is
 * nothing to leave unpainted, and the transition is ours to write.
 */

export interface OriginRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PlayerUiStore {
  open: boolean;
  /** Window coordinates of the control that opened it, for the expansion. */
  origin: OriginRect | null;
  /** The queue panel, which lives inside the player rather than beside it. */
  queueOpen: boolean;
  /** The lyrics panel. A sibling of the queue, and mutually exclusive with it. */
  lyricsOpen: boolean;

  openPlayer: (origin: OriginRect) => void;
  closePlayer: () => void;
  openQueue: () => void;
  closeQueue: () => void;
  openLyrics: () => void;
  closeLyrics: () => void;
}

export const usePlayerUiStore = create<PlayerUiStore>((set) => ({
  open: false,
  origin: null,
  queueOpen: false,
  lyricsOpen: false,

  openPlayer: (origin) => set({ open: true, origin }),
  // Both panels close with the player: they belong to it, and leaving one
  // open would have it reappear over the next expansion.
  closePlayer: () => set({ open: false, queueOpen: false, lyricsOpen: false }),
  // Opening one dismisses the other. They occupy the same space, and stacking
  // them would leave the hidden one to reappear when the top one is closed.
  openQueue: () => set({ queueOpen: true, lyricsOpen: false }),
  closeQueue: () => set({ queueOpen: false }),
  openLyrics: () => set({ lyricsOpen: true, queueOpen: false }),
  closeLyrics: () => set({ lyricsOpen: false }),
}));
