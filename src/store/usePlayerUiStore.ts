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

  openPlayer: (origin: OriginRect) => void;
  closePlayer: () => void;
  openQueue: () => void;
  closeQueue: () => void;
}

export const usePlayerUiStore = create<PlayerUiStore>((set) => ({
  open: false,
  origin: null,
  queueOpen: false,

  openPlayer: (origin) => set({ open: true, origin }),
  // The queue closes with the player: it is a panel of the player, and
  // leaving it open would have it reappear over the next expansion.
  closePlayer: () => set({ open: false, queueOpen: false }),
  openQueue: () => set({ queueOpen: true }),
  closeQueue: () => set({ queueOpen: false }),
}));
