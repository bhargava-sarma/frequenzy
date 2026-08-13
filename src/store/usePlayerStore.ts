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

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Applies a queue mutation, retrying until the native controller has bound.
 *
 * setupPlayer starts an asynchronous MediaController connection, and until it
 * completes every command hits a null controller and is silently dropped —
 * the native side is a `mc?.send(...)` null-safe call with no queueing. That
 * is why the very first play used to need two taps: the first set the queue
 * and pressed play into the void, and only the second found a live controller.
 *
 * Queue reads and writes both dispatch through the same main-thread handler,
 * so they run in order: if `verify` still fails right after a mutation, the
 * controller genuinely wasn't up. The player is initialized at app start, so
 * in practice this succeeds on the first attempt and this loop never spins.
 */
async function applyWhenReady(
  mutate: () => void,
  verify: () => boolean,
  timeoutMs = 3000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    mutate();
    if (verify()) return;

    if (Date.now() >= deadline) {
      throw new Error('The player did not become ready in time.');
    }
    await sleep(50);
  }
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

    await applyWhenReady(
      () => TrackPlayer.setMediaItems(items, startIndex),
      () => TrackPlayer.getQueue().length > 0,
    );

    TrackPlayer.play();
  },

  playNext: async (songs) => {
    if (songs.length === 0) return;
    get().init();

    const items = await buildItems(songs);
    const before = TrackPlayer.getQueue().length;
    const activeIndex = TrackPlayer.getActiveMediaItemIndex();

    // With nothing playing there is no "next", so this degrades to an append.
    await applyWhenReady(
      () =>
        activeIndex == null
          ? TrackPlayer.addMediaItems(items)
          : TrackPlayer.insertMediaItems(activeIndex + 1, items),
      () => TrackPlayer.getQueue().length > before,
    );
  },

  addToQueue: async (songs) => {
    if (songs.length === 0) return;
    get().init();

    const items = await buildItems(songs);
    const before = TrackPlayer.getQueue().length;

    await applyWhenReady(
      () => TrackPlayer.addMediaItems(items),
      () => TrackPlayer.getQueue().length > before,
    );
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
