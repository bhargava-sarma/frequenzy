import TrackPlayer, { Event, RepeatMode, type MediaItem } from '@rntp/player';
import { create } from 'zustand';

import { localCopy } from '../offline/downloads';
import { afterQueueChange, noteSpeed, seekTo, startPlaybackSync } from '../player/playbackSync';
import { setupPlayer } from '../player/setup';
import { songFromMediaItem, toMediaItems } from '../player/trackMapping';
import type { Child } from '../types/subsonic';
import { useServerStore } from './useServerStore';
import { toast } from './useToastStore';

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
  | 'downloads'
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

interface Playable {
  /** The songs that will be queued — all of them, or the downloaded ones. */
  songs: Child[];
  items: MediaItem[];
  /** Where `startIndex` landed in `songs`. */
  start: number;
  /** Songs left out because they need the server and it can't be reached. */
  dropped: number;
}

/**
 * Turns songs into queue items.
 *
 * At home — connected through the home address — everything streams from
 * the server, downloaded or not: the network is free and fast there, and a
 * stream URL is something a Cast speaker can fetch, where a file on the
 * phone is not. Away from home and offline, downloaded tracks play from the
 * device, saving mobile data and needing no connection at all.
 *
 * The rest need a live address; when none answers, a list with downloaded
 * tracks in it plays just those instead of failing whole, and a list with
 * none fails as it always has. Known to be offline already, it doesn't make
 * anyone wait out another probe to learn that again — it plays what it has
 * and lets the probe run behind.
 */
async function buildPlayable(songs: Child[], startIndex = 0): Promise<Playable> {
  const { client, connection, connecting } = useServerStore.getState();
  if (client && connection?.kind === 'local') {
    return { songs, items: await toMediaItems(client, songs), start: startIndex, dropped: 0 };
  }

  const local = songs.map((song) => localCopy(song.id));
  const someLocal = local.some(Boolean);
  let canStream = local.every(Boolean);

  if (!canStream) {
    if (!client) {
      if (!someLocal) throw new Error('Not connected to a server');
    } else if (!connection && !connecting && someLocal) {
      void client.ensureConnection().catch(() => {});
    } else {
      try {
        const reached = await client.ensureConnection();
        // Reached home after all: stream everything, as above.
        if (reached.kind === 'local') {
          return { songs, items: await toMediaItems(client, songs), start: startIndex, dropped: 0 };
        }
        canStream = true;
      } catch (error) {
        if (!someLocal) throw error;
      }
    }
  }

  if (canStream) {
    return { songs, items: await toMediaItems(client, songs, localCopy), start: startIndex, dropped: 0 };
  }

  const keptIndices = local.flatMap((copy, index) => (copy ? [index] : []));
  const kept = keptIndices.map((index) => songs[index]);
  // The chosen track if it is downloaded, else the next one that is.
  const start = Math.max(0, keptIndices.findIndex((index) => index >= startIndex));
  return {
    songs: kept,
    items: await toMediaItems(client, kept, localCopy),
    start,
    dropped: songs.length - kept.length,
  };
}

/** Says what was left out when only the downloaded tracks could be queued. */
function reportDropped(playable: Playable, verb: 'Playing' | 'Queued') {
  if (playable.dropped === 0) return;
  const count = playable.songs.length;
  toast.show(`Offline · ${verb.toLowerCase()} ${count} downloaded track${count === 1 ? '' : 's'}`, {
    icon: 'offline',
    detail: `${playable.dropped} not downloaded`,
  });
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Grace period before a replace that didn't land is sent again. */
const REFIRE_AFTER_MS = 750;

/**
 * Applies a queue change and waits for the player to take it.
 *
 * Writes are void TurboModule calls, queued to the native module thread;
 * the player announces each with QueueChanged once it has been handed to
 * its own thread, so a read made after that event sees the change. This
 * waits for the event — it used to poll a full copy of the queue every
 * 25 ms, and on a long playlist each of those copies stalled the app.
 *
 * `verify` is read once, after the event — or after the wait runs out,
 * since a change can land without being announced one event per edit.
 * With `refire` a replace that didn't land is sent once more (it is what
 * made the very first play need two taps, back when a command sent before
 * the controller bound was dropped). Never set `refire` for an append.
 * `events` is how many changes `mutate` makes, so a remove-then-add waits
 * for both.
 */
async function applyQueueChange(
  mutate: () => void,
  verify?: () => boolean,
  { refire = false, timeoutMs = 3000, events = 1 }: { refire?: boolean; timeoutMs?: number; events?: number } = {},
): Promise<void> {
  const announced = await afterQueueChange(mutate, timeoutMs, events);
  // The queue itself is the answer when there is a way to read it; the
  // event is only the cue to look.
  if (verify ? verify() : announced) return;
  if (refire && verify) {
    await sleep(REFIRE_AFTER_MS);
    if (verify()) return;
    await afterQueueChange(mutate, timeoutMs, events);
    if (verify()) return;
  }
  throw new Error('The player did not accept the change in time.');
}

/** The player's queue length, read fresh. One full copy of the queue: only on a user action. */
function freshQueueLength(): number {
  try {
    return TrackPlayer.getQueue().length;
  } catch {
    return 0;
  }
}

/** Whether the player is now on the item a replace asked for. One small read. */
function landedOn(item: MediaItem | undefined): boolean {
  if (!item) return false;
  try {
    return TrackPlayer.getActiveMediaItem()?.mediaId === item.mediaId;
  } catch {
    return false;
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

  /**
   * Replaces the queue and starts it. Returns the songs actually queued —
   * fewer than given when offline and only some are downloaded.
   */
  async function startQueue(songs: Child[], startIndex: number, source?: QueueSource): Promise<Child[]> {
    if (songs.length === 0) return [];
    get().init();

    // Build before touching the queue: if URL construction fails, the
    // current queue is left intact rather than cleared.
    const playable = await buildPlayable(songs, startIndex);
    const { items } = playable;
    if (items.length === 0) return [];
    const start = Math.min(Math.max(0, playable.start), items.length - 1);

    await applyQueueChange(
      () => TrackPlayer.setMediaItems(items, start),
      () => landedOn(items[start]),
      { refire: true },
    );

    // Only once the player has it: a rejected change must not leave the
    // remembered running order describing a queue that never loaded.
    original = playable.songs;
    lastActiveIndex = start;
    set({ priorityCount: 0, shuffled: false, source: source ?? null });
    TrackPlayer.play();
    reportDropped(playable, 'Playing');
    return playable.songs;
  }

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
        // The single reader of player state everything else draws from.
        startPlaybackSync();
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
      await startQueue(songs, startIndex, source);
    },

    shufflePlay: async (songs, source) => {
      const kept = await startQueue(shuffleList(songs), 0, source);
      // startQueue recorded the shuffled order; put the original back, since
      // that is what "shuffle off" has to restore — only what was queued.
      const queued = new Set(kept.map((song) => song.id));
      original = songs.filter((song) => queued.has(song.id));
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
          if (activeIndex == null) return;
          // A fresh copy: the order below is planned from exactly what is queued.
          const queue = TrackPlayer.getQueue();
          if (queue.length === 0) return;

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

          const items = tail.length > 0 ? (await buildPlayable(tail)).items : [];
          if (TrackPlayer.getActiveMediaItemIndex() !== activeIndex) continue;

          const length = freshQueueLength();
          if (length <= from && items.length === 0) return;

          const removing = length > from;
          const adding = items.length > 0;
          await applyQueueChange(
            () => {
              if (removing) TrackPlayer.removeMediaItems(from, length);
              if (adding) TrackPlayer.addMediaItems(items);
            },
            () => freshQueueLength() === from + items.length,
            { events: (removing ? 1 : 0) + (adding ? 1 : 0) },
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

      // No active item means an empty queue: there is nothing to insert into.
      const activeIndex = TrackPlayer.getActiveMediaItemIndex();
      if (activeIndex == null) {
        await get().playNow([song]);
        return;
      }

      const { items } = await buildPlayable([song]);
      const before = freshQueueLength();
      const insertAt = activeIndex + 1;

      await applyQueueChange(
        () => TrackPlayer.insertMediaItems(insertAt, items),
        () => freshQueueLength() > before,
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
      if (activeIndex == null) {
        await get().playNow(songs);
        return;
      }

      const playable = await buildPlayable(songs);
      const { items } = playable;
      if (items.length === 0) return;
      const before = freshQueueLength();

      await applyQueueChange(
        () => TrackPlayer.insertMediaItems(activeIndex + 1, items),
        () => freshQueueLength() > before,
      );

      set({ priorityCount: get().priorityCount + items.length });
      reportDropped(playable, 'Queued');
    },

    addToQueue: async (songs) => {
      if (songs.length === 0) return;
      get().init();

      const insertAt = priorityInsertIndex();
      if (insertAt == null) {
        await get().playNow(songs);
        return;
      }

      const playable = await buildPlayable(songs);
      const { items } = playable;
      if (items.length === 0) return;
      const before = freshQueueLength();
      // The region may extend past the end if items were removed under it.
      const at = Math.min(insertAt, before);

      await applyQueueChange(
        () => TrackPlayer.insertMediaItems(at, items),
        () => freshQueueLength() > before,
      );

      set({ priorityCount: get().priorityCount + items.length });
      reportDropped(playable, 'Queued');
    },

    loadPaused: async (songs, startIndex, position, source = null) => {
      if (songs.length === 0) return;
      get().init();

      const playable = await buildPlayable(songs, startIndex);
      const { items } = playable;
      if (items.length === 0) return;
      const start = Math.min(Math.max(0, playable.start), items.length - 1);
      // The place in the track belongs to the track that was playing; if
      // that one couldn't be queued, the next starts from its top.
      const sameTrack = playable.songs[start]?.id === songs[Math.min(Math.max(0, startIndex), songs.length - 1)]?.id;

      // A last look, as close to the send as possible: something may have
      // started playing while the items were being built.
      if (TrackPlayer.getActiveMediaItemIndex() != null) return;
      // A load at launch can be held until the player's controller has
      // connected, and then runs; it is waited for rather than given up on.
      await applyQueueChange(
        () => TrackPlayer.setMediaItems(items, start),
        () => landedOn(items[start]),
        { timeoutMs: 6000 },
      );
      original = playable.songs;
      // Dispatched on the same native queue as the replace, so it lands
      // after the item is loaded rather than racing it.
      if (position > 1 && sameTrack) seekTo(position);

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
      // One fresh read per tap: a nudge just after another change must not
      // be bounded by a mirror that hasn't caught up yet.
      const length = freshQueueLength();
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
      const length = freshQueueLength();
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
      noteSpeed(clamped);
      set({ speed: clamped });
    },
  };
});
