import TrackPlayer from '@rntp/player';
import { create } from 'zustand';

import { setupPlayer } from '../player/setup';
import { toMediaItems } from '../player/trackMapping';
import type { Child } from '../types/subsonic';
import { useServerStore } from './useServerStore';

/**
 * Queue operations.
 *
 * The player owns the authoritative queue — duplicating it here would mean two
 * sources of truth that drift the moment playback advances on its own. This
 * store holds only what the player can't: initialization state, and the
 * actions that translate Subsonic songs into player calls.
 *
 * Read live playback state through the player's own hooks (useActiveMediaItem,
 * useIsPlaying, useProgress) rather than mirroring it here.
 */

interface PlayerStore {
  ready: boolean;
  /** Set when initialization fails, so UI can explain rather than hang. */
  error: string | null;

  init: () => void;

  /** Replaces the queue and starts playing at `startIndex`. */
  playNow: (songs: Child[], startIndex?: number) => Promise<void>;
  /** Inserts directly after the current track. */
  playNext: (songs: Child[]) => Promise<void>;
  /** Appends to the end of the queue. */
  addToQueue: (songs: Child[]) => Promise<void>;

  removeFromQueue: (index: number) => void;
  moveInQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
}

/**
 * Media items can only be built once a connection exists, since the stream URL
 * embeds whichever base address is currently live.
 */
async function buildItems(songs: Child[]) {
  const client = useServerStore.getState().client;
  if (!client) throw new Error('Not connected to a server');
  return toMediaItems(client, songs);
}

export const usePlayerStore = create<PlayerStore>((set, get) => ({
  ready: false,
  error: null,

  init: () => {
    if (get().ready) return;
    try {
      setupPlayer();
      set({ ready: true, error: null });
    } catch (error) {
      set({ ready: false, error: error instanceof Error ? error.message : String(error) });
    }
  },

  playNow: async (songs, startIndex = 0) => {
    if (songs.length === 0) return;
    get().init();

    // Build before touching the queue: if URL construction fails, the current
    // queue is left intact rather than cleared into an empty player.
    const items = await buildItems(songs);

    TrackPlayer.setMediaItems(items, startIndex);
    TrackPlayer.play();
  },

  playNext: async (songs) => {
    if (songs.length === 0) return;
    get().init();

    const items = await buildItems(songs);
    const activeIndex = TrackPlayer.getActiveMediaItemIndex();

    // With nothing playing there is no "next", so this degrades to an append.
    if (activeIndex == null) {
      TrackPlayer.addMediaItems(items);
      return;
    }

    TrackPlayer.insertMediaItems(activeIndex + 1, items);
  },

  addToQueue: async (songs) => {
    if (songs.length === 0) return;
    get().init();
    TrackPlayer.addMediaItems(await buildItems(songs));
  },

  removeFromQueue: (index) => {
    TrackPlayer.removeMediaItem(index);
  },

  moveInQueue: (fromIndex, toIndex) => {
    TrackPlayer.moveMediaItem(fromIndex, toIndex);
  },

  clearQueue: () => {
    TrackPlayer.clear();
  },
}));
