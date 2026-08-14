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

/** How often to re-check that a queue change has landed. */
const CONFIRM_INTERVAL_MS = 25;
/** Grace period before a replace-style change is assumed lost and re-sent. */
const REFIRE_AFTER_MS = 750;

/**
 * Applies a queue change, then waits for the player to confirm it.
 *
 * Writes and reads do not travel the same path. `addMediaItems` and friends
 * return void, and React Native dispatches void TurboModule methods onto the
 * native method-call queue; `getQueue` is a blocking synchronous method, which
 * runs inline on the JS thread. So a read taken straight after a write sees
 * the queue as it was *before* the write — every time, not intermittently.
 *
 * That is why this fires the mutation once and polls only the confirmation.
 * The earlier version re-ran the mutation on each failed check, so its first
 * check always failed and one swipe reliably queued a track twice.
 *
 * `refire` re-sends once after a grace period, and is only for replace-style
 * changes: setMediaItems overwrites the queue, so a second send cannot
 * duplicate anything. It exists because commands issued before the
 * MediaController has bound are dropped silently by the native module — a
 * `mc?.send(...)` null-safe call with no queueing — which is what made the
 * very first play need two taps. Never set it for an append.
 */
async function applyQueueChange(
  mutate: () => void,
  confirm: () => boolean,
  { refire = false, timeoutMs = 3000 }: { refire?: boolean; timeoutMs?: number } = {},
): Promise<void> {
  mutate();

  const started = Date.now();
  let refired = false;

  for (;;) {
    if (confirm()) return;

    const elapsed = Date.now() - started;
    if (elapsed >= timeoutMs) {
      throw new Error('The player did not accept the change in time.');
    }
    if (refire && !refired && elapsed >= REFIRE_AFTER_MS) {
      refired = true;
      mutate();
    }

    await sleep(CONFIRM_INTERVAL_MS);
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

    // A non-empty queue is proof the controller is live, which is all this
    // needs to establish — play() is dispatched on the same native queue as
    // setMediaItems, so it cannot overtake it.
    await applyQueueChange(
      () => TrackPlayer.setMediaItems(items, startIndex),
      () => TrackPlayer.getQueue().length > 0,
      { refire: true },
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
    await applyQueueChange(
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

    await applyQueueChange(
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
