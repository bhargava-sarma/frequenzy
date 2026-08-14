import TrackPlayer, { Event } from '@rntp/player';
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
 * store holds only what the player can't: initialization state, the size of
 * the hand-picked region at the front of the queue, and the actions that
 * translate Subsonic songs into player calls.
 *
 * Read live playback state through the player's own hooks (useActiveMediaItem,
 * useIsPlaying, useProgress) rather than mirroring it here.
 *
 * THE TWO-TIER QUEUE
 *
 * Pressing Play on an album is a different intent from adding one track to the
 * queue, and a single flat list can't tell them apart — an added track landing
 * at the end of a 14-track album would not be heard for an hour. So the queue
 * has two regions, as Apple Music does:
 *
 *   [ now playing ][ playing next — hand-picked ][ the rest of the context ]
 *
 * Adds insert at the end of the hand-picked region, so they play in the order
 * you added them and always before the remainder of whatever album or playlist
 * is running. Pressing Play replaces everything and empties the region.
 */

interface PlayerStore {
  ready: boolean;
  /** Set when initialization fails, so UI can explain rather than hang. */
  error: string | null;
  /**
   * How many hand-picked tracks sit directly after the active one. Drives the
   * "Playing next" grouping on the queue screen.
   */
  priorityCount: number;

  init: () => void;

  /** Replaces the queue and starts playing at `startIndex`. */
  playNow: (songs: Child[], startIndex?: number) => Promise<void>;
  /** Replaces the queue with a shuffled copy and plays from the top. */
  shufflePlay: (songs: Child[]) => Promise<void>;
  /** Inserts at the front of the hand-picked region — plays next. */
  playNext: (songs: Child[]) => Promise<void>;
  /** Inserts at the end of the hand-picked region. */
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

/**
 * Fisher-Yates on a copy.
 *
 * Shuffling the list here rather than using the player's own shuffle mode
 * keeps the queue you see and the queue that plays identical. The native
 * shuffle reorders playback behind an unchanged queue, which would make the
 * hand-picked region point at the wrong tracks and the queue screen lie about
 * what comes next.
 */
function shuffled<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export const usePlayerStore = create<PlayerStore>((set, get) => {
  /**
   * Shrinks the hand-picked region as playback moves into it.
   *
   * Tracked by how far the active index moved rather than by matching ids,
   * because the same track can legitimately appear in the queue more than
   * once and ids would not tell those copies apart.
   */
  let lastActiveIndex = -1;
  let subscribed = false;

  function watchQueuePosition() {
    if (subscribed) return;
    subscribed = true;

    TrackPlayer.addEventListener(Event.MediaItemTransition, ({ index }) => {
      const advancedBy = index - lastActiveIndex;
      lastActiveIndex = index;

      if (advancedBy > 0) {
        set({ priorityCount: Math.max(0, get().priorityCount - advancedBy) });
      }
    });
  }

  /** Where a hand-picked insert goes: after the active track and its region. */
  function priorityInsertIndex(): number | null {
    const activeIndex = TrackPlayer.getActiveMediaItemIndex();
    if (activeIndex == null) return null;
    return activeIndex + 1 + get().priorityCount;
  }

  return {
    ready: false,
    error: null,
    priorityCount: 0,

    init: () => {
      if (get().ready) return;
      try {
        setupPlayer();
        watchQueuePosition();
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

      // Everything hand-picked belonged to the queue that was just replaced.
      lastActiveIndex = startIndex;
      set({ priorityCount: 0 });

      TrackPlayer.play();
    },

    shufflePlay: async (songs) => {
      await get().playNow(shuffled(songs));
    },

    playNext: async (songs) => {
      if (songs.length === 0) return;
      get().init();

      const items = await buildItems(songs);
      const before = TrackPlayer.getQueue().length;
      const activeIndex = TrackPlayer.getActiveMediaItemIndex();

      // With nothing playing there is no "next", so this degrades to starting
      // playback rather than quietly stacking up an unheard queue.
      if (activeIndex == null) {
        await get().playNow(songs);
        return;
      }

      await applyQueueChange(
        () => TrackPlayer.insertMediaItems(activeIndex + 1, items),
        () => TrackPlayer.getQueue().length > before,
      );

      set({ priorityCount: get().priorityCount + items.length });
    },

    addToQueue: async (songs) => {
      if (songs.length === 0) return;
      get().init();

      const items = await buildItems(songs);
      const before = TrackPlayer.getQueue().length;
      const insertAt = priorityInsertIndex();

      if (insertAt == null) {
        await get().playNow(songs);
        return;
      }

      await applyQueueChange(
        () => TrackPlayer.insertMediaItems(insertAt, items),
        () => TrackPlayer.getQueue().length > before,
      );

      set({ priorityCount: get().priorityCount + items.length });
    },

    removeFromQueue: (index) => {
      const activeIndex = TrackPlayer.getActiveMediaItemIndex() ?? -1;
      const count = get().priorityCount;

      // Removing from inside the hand-picked region shrinks it; removing from
      // the context after it leaves it alone.
      if (index > activeIndex && index <= activeIndex + count) {
        set({ priorityCount: count - 1 });
      }

      TrackPlayer.removeMediaItem(index);
    },

    moveInQueue: (fromIndex, toIndex) => {
      TrackPlayer.moveMediaItem(fromIndex, toIndex);
    },

    clearQueue: () => {
      lastActiveIndex = -1;
      set({ priorityCount: 0 });
      TrackPlayer.clear();
    },
  };
});
