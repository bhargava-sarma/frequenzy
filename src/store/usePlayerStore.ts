import TrackPlayer, { Event, RepeatMode } from '@rntp/player';
import { create } from 'zustand';

import { setupPlayer } from '../player/setup';
import { songFromMediaItem, toMediaItems } from '../player/trackMapping';
import type { Child } from '../types/subsonic';
import { useServerStore } from './useServerStore';

/**
 * Queue operations.
 *
 * The player owns the authoritative queue — duplicating it here would mean
 * two sources of truth that drift the moment playback advances on its own.
 * This store holds only what the player can't: initialisation state, the
 * size of the hand-picked region at the front of the queue, what the queue
 * is playing *from*, and the actions that translate Subsonic songs into
 * player calls.
 *
 * Read live playback state through the player's own hooks (useActiveMediaItem,
 * useIsPlaying, useProgress) rather than mirroring it here.
 *
 * THE TWO-TIER QUEUE
 *
 *   [ now playing ][ playing next — hand-picked ][ the rest of the context ]
 *
 * Adds insert at the end of the hand-picked region, so they play in the
 * order you added them and always before the remainder of whatever album or
 * playlist is running. Pressing Play replaces everything and empties it.
 */

export type RepeatSetting = 'off' | 'all' | 'one';

export type SourceKind =
  | 'album'
  | 'playlist'
  | 'liked'
  | 'artist'
  | 'genre'
  | 'radio'
  | 'mix'
  | 'search'
  | 'history'
  | 'restored';

/** What the queue was started from, for the player's "Playing from" line. */
export interface QueueSource {
  kind: SourceKind;
  label: string;
}

interface PlayerStore {
  ready: boolean;
  error: string | null;
  /** How many hand-picked tracks sit directly after the active one. */
  priorityCount: number;
  /**
   * Whether the queue is shuffled. Here rather than in the player screen
   * because shuffle starts from albums, playlists and artists too.
   */
  shuffled: boolean;
  /**
   * Repeat, mirrored from the player. The player screen unmounts when it
   * closes; held there, the control came back reading Off while the player
   * was still repeating.
   */
  repeat: RepeatSetting;
  speed: number;
  source: QueueSource | null;

  init: () => void;

  /** Replaces the queue and starts playing at `startIndex`. */
  playNow: (songs: Child[], startIndex?: number, source?: QueueSource) => Promise<void>;
  /** Replaces the queue with a shuffled copy and plays from the top. */
  shufflePlay: (songs: Child[], source?: QueueSource) => Promise<void>;
  /** Reshuffles what's left, or restores the running order. */
  setShuffled: (shuffled: boolean) => Promise<void>;
  /** Inserts at the front of the hand-picked region — plays next. */
  playNext: (songs: Child[]) => Promise<void>;
  /** Plays one track immediately without disturbing the rest of the queue. */
  playTrackNow: (song: Child) => Promise<void>;
  /** Inserts at the end of the hand-picked region. */
  addToQueue: (songs: Child[]) => Promise<void>;
  /**
   * Loads a queue without starting it — restoring the last session.
   *
   * Sent once, never re-fired: if the controller hasn't bound yet the send is
   * dropped and this throws, which is the safe failure. A re-send landing
   * after the bind could replace a queue the service is still playing.
   */
  loadPaused: (
    songs: Child[],
    startIndex: number,
    position: number,
    source?: QueueSource | null,
  ) => Promise<void>;

  removeFromQueue: (index: number) => void;
  /** Moves an upcoming track to play straight after the current one. */
  moveToNext: (index: number) => void;
  /** Moves an upcoming track one slot earlier or later. */
  nudge: (index: number, direction: -1 | 1) => void;
  /** Drops everything after the current track. */
  clearUpcoming: () => void;
  clearQueue: () => void;

  cycleRepeat: () => void;
  setSpeed: (speed: number) => void;
}

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
 * Writes and reads do not travel the same path: `addMediaItems` and friends
 * are void TurboModule methods dispatched onto the native method queue,
 * while `getQueue` is synchronous and runs inline on the JS thread. A read
 * taken straight after a write sees the queue as it was *before* the write —
 * every time — so this fires the mutation once and polls only the
 * confirmation. (Re-running the mutation per failed check once queued a
 * swiped track twice.)
 *
 * `refire` re-sends once after a grace period, only for replace-style
 * changes: commands issued before the MediaController binds are dropped
 * silently, which is what made the very first play need two taps. Never set
 * it for an append.
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
    if (elapsed >= timeoutMs) throw new Error('The player did not accept the change in time.');
    if (refire && !refired && elapsed >= REFIRE_AFTER_MS) {
      refired = true;
      mutate();
    }
    await sleep(CONFIRM_INTERVAL_MS);
  }
}

/**
 * Fisher-Yates on a copy. Shuffling the list rather than using the player's
 * own shuffle mode keeps the queue you see and the queue that plays the
 * same; native shuffle reorders playback behind an unchanged queue.
 */
export function shuffleList<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const toSetting = (mode: RepeatMode): RepeatSetting =>
  mode === RepeatMode.One ? 'one' : mode === RepeatMode.All ? 'all' : 'off';

const toMode = (setting: RepeatSetting): RepeatMode =>
  setting === 'one' ? RepeatMode.One : setting === 'all' ? RepeatMode.All : RepeatMode.Off;

export const usePlayerStore = create<PlayerStore>((set, get) => {
  /**
   * Shrinks the hand-picked region as playback moves into it. Tracked by how
   * far the active index moved rather than by ids, because the same track
   * can legitimately appear in the queue more than once.
   */
  let lastActiveIndex = -1;
  let subscribed = false;

  function watchQueuePosition() {
    if (subscribed) return;
    subscribed = true;

    TrackPlayer.addEventListener(Event.MediaItemTransition, ({ index }) => {
      const movedBy = index - lastActiveIndex;
      lastActiveIndex = index;

      const count = get().priorityCount;
      if (count === 0 || movedBy === 0) return;
      // Forward eats into the region. Back grows it by the tracks stepped
      // over, so it still ends where the hand-picked tracks end: without
      // that, pressing Previous left the region covering the wrong tracks
      // and the next add landed ahead of ones queued before it.
      set({ priorityCount: Math.max(0, count - movedBy) });
    });
  }

  /** Where a hand-picked insert goes: after the active track and its region. */
  function priorityInsertIndex(): number | null {
    const activeIndex = TrackPlayer.getActiveMediaItemIndex();
    if (activeIndex == null) return null;
    return activeIndex + 1 + get().priorityCount;
  }

  /**
   * The collection currently playing, in the order it was given — what
   * turning shuffle off has to restore.
   */
  let original: Child[] = [];

  return {
    ready: false,
    error: null,
    priorityCount: 0,
    shuffled: false,
    repeat: 'off',
    speed: 1,
    source: null,

    init: () => {
      if (get().ready) return;
      try {
        setupPlayer();
        watchQueuePosition();
        // The native player outlives the JS runtime (music keeps going when
        // the app is swiped away), so whatever it is already doing is truth.
        let repeat: RepeatSetting = 'off';
        let speed = 1;
        try {
          repeat = toSetting(TrackPlayer.getRepeatMode());
          speed = TrackPlayer.getPlaybackSpeed() || 1;
          lastActiveIndex = TrackPlayer.getActiveMediaItemIndex() ?? -1;
        } catch {
          // Reads before the controller binds can fail; defaults are right then.
        }
        set({ ready: true, error: null, repeat, speed });
      } catch (error) {
        set({ ready: false, error: error instanceof Error ? error.message : String(error) });
      }
    },

    playNow: async (songs, startIndex = 0, source) => {
      if (songs.length === 0) return;
      get().init();

      // Build before touching the queue: if URL construction fails, the
      // current queue is left intact rather than cleared.
      const items = await buildItems(songs);
      const start = Math.min(Math.max(0, startIndex), items.length - 1);

      await applyQueueChange(
        () => TrackPlayer.setMediaItems(items, start),
        () => TrackPlayer.getQueue().length > 0,
        { refire: true },
      );

      // Only once the player has it: a rejected change must not leave the
      // remembered running order describing a queue that never loaded.
      original = songs;
      lastActiveIndex = start;
      set({ priorityCount: 0, shuffled: false, source: source ?? null });
      TrackPlayer.play();
    },

    shufflePlay: async (songs, source) => {
      await get().playNow(shuffleList(songs), 0, source);
      // playNow recorded the shuffled order; put the original back, since
      // that is what "shuffle off" has to restore.
      original = songs;
      set({ shuffled: true });
    },

    setShuffled: async (next) => {
      const was = get().shuffled;
      // The control answers the press; the queue follows.
      set({ shuffled: next });

      try {
        // Two passes at most: building the items can wait on a probe, and if
        // the track changed meanwhile the plan was made for another moment.
        for (let attempt = 0; attempt < 2; attempt++) {
          const activeIndex = TrackPlayer.getActiveMediaItemIndex();
          const queue = TrackPlayer.getQueue();
          if (activeIndex == null || queue.length === 0) return;

          // The JS runtime can restart under a queue that kept playing, and
          // what is queued is then the only running order there is.
          if (original.length === 0) {
            original = queue
              .map((item) => songFromMediaItem(item))
              .filter((song): song is Child => song != null);
          }
          if (original.length === 0) return;

          const currentId = queue[activeIndex]?.mediaId;
          /**
           * Only the context behind the hand-picked tracks is rebuilt. The
           * playing item stays, because replacing it stops the music; the
           * hand-picked ones stay, because they are not part of the
           * collection being reordered — rebuilding from just after the
           * current track used to throw them away.
           */
          const picked = Math.max(0, Math.min(get().priorityCount, queue.length - activeIndex - 1));
          const from = activeIndex + 1 + picked;

          let tail: Child[];
          if (next) {
            // Everything but one copy of what's playing, in a new order.
            let skippedCurrent = false;
            tail = shuffleList(
              original.filter((song) => {
                if (!skippedCurrent && song.id === currentId) {
                  skippedCurrent = true;
                  return false;
                }
                return true;
              }),
            );
          } else {
            // Back to the running order *from here*: what follows the playing
            // track in the collection, not the whole collection again.
            const at = original.findIndex((song) => song.id === currentId);
            if (at >= 0) {
              tail = original.slice(at + 1);
            } else {
              // A track queued by hand has no place in the running order, so
              // keep what was still to come and put that back in order.
              const upcoming = new Set(queue.slice(from).map((item) => item.mediaId));
              tail = original.filter((song) => upcoming.has(song.id));
            }
          }

          const items = tail.length > 0 ? await buildItems(tail) : [];
          if (TrackPlayer.getActiveMediaItemIndex() !== activeIndex) continue;

          const length = TrackPlayer.getQueue().length;
          if (length <= from && items.length === 0) return;

          await applyQueueChange(
            () => {
              if (length > from) TrackPlayer.removeMediaItems(from, length);
              if (items.length > 0) TrackPlayer.addMediaItems(items);
            },
            () => TrackPlayer.getQueue().length === from + items.length,
          );

          lastActiveIndex = activeIndex;
          return;
        }
      } catch (error) {
        set({ shuffled: was });
        throw error;
      }
    },

    playTrackNow: async (song) => {
      get().init();

      const activeIndex = TrackPlayer.getActiveMediaItemIndex();
      if (activeIndex == null || TrackPlayer.getQueue().length === 0) {
        await get().playNow([song]);
        return;
      }

      const items = await buildItems([song]);
      const before = TrackPlayer.getQueue().length;
      const insertAt = activeIndex + 1;

      await applyQueueChange(
        () => TrackPlayer.insertMediaItems(insertAt, items),
        () => TrackPlayer.getQueue().length > before,
      );

      // Skipping into it moves the active index forward, and the hand-picked
      // region shifts with it rather than being consumed.
      lastActiveIndex = insertAt;
      TrackPlayer.skipToIndex(insertAt);
      TrackPlayer.play();
    },

    playNext: async (songs) => {
      if (songs.length === 0) return;
      get().init();

      const activeIndex = TrackPlayer.getActiveMediaItemIndex();
      // With nothing playing there is no "next", so start playback rather
      // than quietly stacking an unheard queue.
      if (activeIndex == null || TrackPlayer.getQueue().length === 0) {
        await get().playNow(songs);
        return;
      }

      const items = await buildItems(songs);
      const before = TrackPlayer.getQueue().length;

      await applyQueueChange(
        () => TrackPlayer.insertMediaItems(activeIndex + 1, items),
        () => TrackPlayer.getQueue().length > before,
      );

      set({ priorityCount: get().priorityCount + items.length });
    },

    addToQueue: async (songs) => {
      if (songs.length === 0) return;
      get().init();

      const insertAt = priorityInsertIndex();
      if (insertAt == null || TrackPlayer.getQueue().length === 0) {
        await get().playNow(songs);
        return;
      }

      const items = await buildItems(songs);
      const before = TrackPlayer.getQueue().length;
      // The region may extend past the end if items were removed under it.
      const at = Math.min(insertAt, before);

      await applyQueueChange(
        () => TrackPlayer.insertMediaItems(at, items),
        () => TrackPlayer.getQueue().length > before,
      );

      set({ priorityCount: get().priorityCount + items.length });
    },

    loadPaused: async (songs, startIndex, position, source = null) => {
      if (songs.length === 0) return;
      get().init();

      const items = await buildItems(songs);
      const start = Math.min(Math.max(0, startIndex), items.length - 1);

      // A last look, as close to the send as possible: something may have
      // started playing while the items were being built.
      if (TrackPlayer.getQueue().length > 0) return;
      await applyQueueChange(
        () => TrackPlayer.setMediaItems(items, start),
        () => TrackPlayer.getQueue().length > 0,
        { timeoutMs: 1200 },
      );
      original = songs;
      // Dispatched on the same native queue as the replace, so it lands
      // after the item is loaded rather than racing it.
      if (position > 1) TrackPlayer.seekTo(position);

      lastActiveIndex = start;
      set({ priorityCount: 0, shuffled: false, source });
    },

    removeFromQueue: (index) => {
      const activeIndex = TrackPlayer.getActiveMediaItemIndex() ?? -1;
      const count = get().priorityCount;

      // Removing from inside the hand-picked region shrinks it.
      if (index > activeIndex && index <= activeIndex + count) {
        set({ priorityCount: count - 1 });
      }
      // Removing an already-played track shifts the active index back one,
      // which the transition tracker must know or the region drifts.
      if (index < activeIndex) lastActiveIndex = activeIndex - 1;

      TrackPlayer.removeMediaItem(index);
    },

    moveToNext: (index) => {
      const activeIndex = TrackPlayer.getActiveMediaItemIndex();
      if (activeIndex == null || index <= activeIndex + 1) return;

      const count = get().priorityCount;
      const inRegion = index <= activeIndex + count;
      TrackPlayer.moveMediaItem(index, activeIndex + 1);
      // A track pulled up from the context joins the hand-picked region;
      // one already in it just changes place.
      if (!inRegion) set({ priorityCount: count + 1 });
    },

    nudge: (index, direction) => {
      const activeIndex = TrackPlayer.getActiveMediaItemIndex() ?? -1;
      const target = index + direction;
      const length = TrackPlayer.getQueue().length;
      // Upcoming tracks only: moving across the playing track would change
      // what "previous" means mid-song.
      if (index <= activeIndex || target <= activeIndex || target >= length) return;
      TrackPlayer.moveMediaItem(index, target);

      // A move across the edge of the hand-picked region swaps a picked track
      // with one from the context. Both are now where you put them, so the
      // region takes both rather than disowning the one you chose earlier.
      const count = get().priorityCount;
      const edge = activeIndex + count;
      if (count > 0 && Math.min(index, target) === edge && Math.max(index, target) === edge + 1) {
        set({ priorityCount: count + 1 });
      }
    },

    clearUpcoming: () => {
      const activeIndex = TrackPlayer.getActiveMediaItemIndex();
      const length = TrackPlayer.getQueue().length;
      if (activeIndex == null || length <= activeIndex + 1) return;
      TrackPlayer.removeMediaItems(activeIndex + 1, length);
      set({ priorityCount: 0 });
    },

    clearQueue: () => {
      lastActiveIndex = -1;
      original = [];
      set({ priorityCount: 0, shuffled: false, source: null });
      TrackPlayer.clear();
    },

    cycleRepeat: () => {
      const order: RepeatSetting[] = ['off', 'all', 'one'];
      const next = order[(order.indexOf(get().repeat) + 1) % order.length];
      TrackPlayer.setRepeatMode(toMode(next));
      set({ repeat: next });
    },

    setSpeed: (speed) => {
      const clamped = Math.min(2, Math.max(0.5, Math.round(speed * 100) / 100));
      TrackPlayer.setPlaybackSpeed(clamped);
      set({ speed: clamped });
    },
  };
});
