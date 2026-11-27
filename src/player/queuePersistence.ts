import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import TrackPlayer, { type MediaItem } from '@rntp/player';

import { songFromMediaItem } from './trackMapping';
import { positionNow, usePlaybackStore } from '../store/usePlaybackStore';
import { getSettings } from '../store/useSettingsStore';
import { usePlayerStore, type QueueSource } from '../store/usePlayerStore';
import type { Child } from '../types/subsonic';

/**
 * The queue, remembered between launches.
 *
 * The native player keeps playing when the app is swiped away, but once
 * Android reclaims the whole process the queue is gone, and opening the app
 * to an empty player is the moment it most feels like it forgot you. So the
 * queue, the position in it and the position in the track are written down
 * as they change, and restored — paused — on the next cold start.
 *
 * Two records, because they change at very different rates. The track list
 * is written when the queue changes; the place in it — a few bytes — every
 * few seconds while playing. Writing the whole list on the timer meant a
 * full copy of a possibly 500-track queue out of the player and through
 * JSON every 15 seconds, which was felt as a hitch every 15 seconds.
 *
 * Everything is read from the mirrored player state, never from the player
 * itself. Stream URLs are not stored: they embed the base address and auth
 * params of the session that made them, and are rebuilt next time.
 */

const QUEUE_KEY = 'playQueue.v1';
const PLACE_KEY = 'playQueue.place.v1';

/** A queue longer than this is saved as a window around the current track. */
const MAX_SAVED = 500;

/** Place saves while playing. Coarse: a few seconds lost on resume is fine. */
const SAVE_PLACE_EVERY_MS = 15_000;

interface SavedQueue {
  songs: Child[];
  /** Index of the current track within `songs` when the list was written. */
  index: number;
  source: QueueSource | null;
  savedAt: number;
  /** Legacy field: written by older versions with the list. */
  position?: number;
}

interface SavedPlace {
  mediaId: string;
  position: number;
  savedAt: number;
}

/** The window of the queue worth keeping, around the current track. */
function captureQueue(): SavedQueue | null {
  const { queue, index } = usePlaybackStore.getState();
  if (queue.length === 0 || index < 0) return null;

  const start = Math.max(0, Math.min(index - 50, queue.length - MAX_SAVED));
  const window = queue.slice(start, start + MAX_SAVED);
  const songs = window
    .map((item: MediaItem) => songFromMediaItem(item))
    .filter((song): song is Child => song != null);
  if (songs.length !== window.length) return null;

  return { songs, index: index - start, source: usePlayerStore.getState().source, savedAt: Date.now() };
}

function capturePlace(): SavedPlace | null {
  const state = usePlaybackStore.getState();
  const mediaId = state.item?.mediaId;
  if (!mediaId) return null;
  return { mediaId, position: positionNow(state), savedAt: Date.now() };
}

let queueTimer: ReturnType<typeof setTimeout> | null = null;
let placeTimer: ReturnType<typeof setTimeout> | null = null;

async function writeQueue() {
  queueTimer = null;
  try {
    const snapshot = captureQueue();
    if (snapshot) await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(snapshot));
    else if (usePlaybackStore.getState().queue.length === 0) await AsyncStorage.multiRemove([QUEUE_KEY, PLACE_KEY]);
  } catch {
    // Losing the resume point is a mild inconvenience, never an error.
  }
}

async function writePlace() {
  placeTimer = null;
  try {
    const place = capturePlace();
    if (place) await AsyncStorage.setItem(PLACE_KEY, JSON.stringify(place));
  } catch {
    // As above.
  }
}

function scheduleQueue(delay = 1200) {
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = setTimeout(() => void writeQueue(), delay);
}

function schedulePlace(delay = 800) {
  if (placeTimer) clearTimeout(placeTimer);
  placeTimer = setTimeout(() => void writePlace(), delay);
}

/** Starts recording. Returns a cleanup. */
export function startQueuePersistence(): () => void {
  // The mirrored queue is re-read a moment after each change; the list is
  // written once that has settled.
  const unsubscribe = usePlaybackStore.subscribe((state, previous) => {
    if (state.queue !== previous.queue) scheduleQueue();
    if (state.item?.mediaId !== previous.item?.mediaId) {
      schedulePlace();
      // The current track moved, so the list's own index is stale too.
      scheduleQueue();
    }
  });
  const appStateSub = AppState.addEventListener('change', (state) => {
    // Backgrounding is the last reliable moment before the process may die.
    if (state !== 'active') {
      void writePlace();
      if (queueTimer) void writeQueue();
    }
  });
  const timer = setInterval(() => {
    if (usePlaybackStore.getState().playing) schedulePlace(0);
  }, SAVE_PLACE_EVERY_MS);

  return () => {
    unsubscribe();
    appStateSub.remove();
    clearInterval(timer);
    if (queueTimer) clearTimeout(queueTimer);
    if (placeTimer) clearTimeout(placeTimer);
    queueTimer = placeTimer = null;
  };
}

interface Restorable {
  songs: Child[];
  index: number;
  position: number;
  source: QueueSource | null;
}

async function readSnapshot(): Promise<Restorable | null> {
  try {
    const [[, rawQueue], [, rawPlace]] = await AsyncStorage.multiGet([QUEUE_KEY, PLACE_KEY]);
    if (!rawQueue) return null;
    const parsed = JSON.parse(rawQueue) as Partial<SavedQueue>;
    if (!Array.isArray(parsed.songs) || parsed.songs.length === 0) return null;
    if (typeof parsed.index !== 'number') return null;
    const songs = parsed.songs.filter(
      (song): song is Child => !!song && typeof song.id === 'string' && typeof song.title === 'string',
    );
    if (songs.length === 0) return null;

    let index = Math.min(Math.max(0, parsed.index), songs.length - 1);
    let position = typeof parsed.position === 'number' && parsed.position > 0 ? parsed.position : 0;

    // The place is newer than the list whenever playback moved on after the
    // list was written; it names its track, so it is found by id.
    const place = rawPlace ? (JSON.parse(rawPlace) as Partial<SavedPlace>) : null;
    if (place && typeof place.mediaId === 'string') {
      const at = songs[index]?.id === place.mediaId ? index : songs.findIndex((song) => song.id === place.mediaId);
      if (at >= 0) {
        index = at;
        position = typeof place.position === 'number' && place.position > 0 ? place.position : 0;
      }
    }

    return { songs, index, position, source: parsed.source ?? null };
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Puts the last queue back, paused, if the player is empty.
 *
 * "If empty" is the whole difficulty. After the app is swiped away the
 * native service keeps playing, and when the UI comes back that live queue
 * is the truth — a restore over it would stop the music. But until the
 * MediaController binds, the player reports an empty queue whether or not
 * one is playing, and nothing announces the bind.
 *
 * So each attempt waits, looks again, and sends the replace exactly once
 * (see loadPaused). Unbound, the send is dropped and the attempt fails
 * harmlessly; bound, the look is accurate. Two attempts cover a slow bind.
 * The looks are direct reads, made twice at launch and never again.
 */
export async function restoreQueue(): Promise<boolean> {
  if (!getSettings().resumeQueue) return false;

  const snapshot = await readSnapshot();
  if (!snapshot) return false;

  // Until the player's controller has connected to its service, every read
  // answers "nothing playing" — and a load sent meanwhile is held and run
  // once it connects. Loading straight away would replace a queue that is in
  // fact playing: one started from Android Auto or a headset while the app
  // was closed, or one the user started in the first moment after launch.
  // So the player is watched for a moment first.
  const deadline = Date.now() + RESTORE_WATCH_MS;
  while (Date.now() < deadline) {
    await sleep(RESTORE_POLL_MS);
    if (playerHasQueue()) return false;
  }

  try {
    await usePlayerStore
      .getState()
      .loadPaused(snapshot.songs, snapshot.index, snapshot.position, snapshot.source ?? {
        kind: 'restored',
        label: 'Last session',
      });
    return TrackPlayer.getActiveMediaItemIndex() != null;
  } catch {
    // Sent once only: the player holds a load until it can run it, so a
    // second attempt would queue the same tracks twice.
    return false;
  }
}

/** How long to watch for a queue that is already playing before restoring. */
const RESTORE_WATCH_MS = 1500;
const RESTORE_POLL_MS = 250;

function playerHasQueue(): boolean {
  if (usePlaybackStore.getState().queue.length > 0) return true;
  try {
    return TrackPlayer.getActiveMediaItemIndex() != null || TrackPlayer.isPlaying();
  } catch {
    return false;
  }
}

export async function clearSavedQueue(): Promise<void> {
  await AsyncStorage.multiRemove([QUEUE_KEY, PLACE_KEY]);
}
