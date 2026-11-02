import { create } from 'zustand';

/**
 * Whether the full player is showing, and which of its panels.
 *
 * The player used to be a screen on the root stack, and Android's stack
 * detaches the screen underneath — which is what left a black rectangle
 * behind after a swipe-down dismissal. As an overlay above the navigator it
 * never unmounts anything, so there is nothing to leave unpainted.
 */

interface PlayerUiStore {
  open: boolean;
  /** The queue panel, which lives inside the player rather than beside it. */
  queueOpen: boolean;
  /** The lyrics panel. A sibling of the queue, and mutually exclusive with it. */
  lyricsOpen: boolean;

  openPlayer: () => void;
  closePlayer: () => void;
  openQueue: () => void;
  closeQueue: () => void;
  openLyrics: () => void;
  closeLyrics: () => void;
}

export const usePlayerUiStore = create<PlayerUiStore>((set) => ({
  open: false,
  queueOpen: false,
  lyricsOpen: false,

  openPlayer: () => set({ open: true }),
  // Both panels close with the player: they belong to it, and leaving one
  // open would have it reappear the next time the player opens.
  closePlayer: () => set({ open: false, queueOpen: false, lyricsOpen: false }),
  // Opening one dismisses the other. They occupy the same space, and stacking
  // them would leave the hidden one to reappear when the top one is closed.
  openQueue: () => set({ queueOpen: true, lyricsOpen: false }),
  closeQueue: () => set({ queueOpen: false }),
  openLyrics: () => set({ lyricsOpen: true, queueOpen: false }),
  closeLyrics: () => set({ lyricsOpen: false }),
}));
