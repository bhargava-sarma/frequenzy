import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import TrackPlayer, { Event, type MediaItem } from '@rntp/player';

import { songFromMediaItem } from './trackMapping';
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
 * Only what's needed to rebuild each item is stored. Stream URLs are not:
 * they embed the base address and auth params of the session that made
 * them, and are rebuilt against whichever address answers next time.
 */

const STORAGE_KEY = 'playQueue.v1';

/** A queue longer than this is saved as a window around the current track. */
const MAX_SAVED = 500;

/** Position saves while playing. Coarse: a few seconds lost on resume is fine. */
const SAVE_EVERY_MS = 15_000;

interface Snapshot {
  songs: Child[];
  index: number;
  position: number;
  source: QueueSource | null;
  savedAt: number;
}

function capture(): Snapshot | null {
  const queue = TrackPlayer.getQueue();
  const active = TrackPlayer.getActiveMediaItemIndex();
  if (queue.length === 0 || active == null) return null;

  // Keep the current track inside the window, with most of it ahead.
  const start = Math.max(0, Math.min(active - 50, queue.length - MAX_SAVED));
  const window = queue.slice(start, start + MAX_SAVED);
  const songs = window
    .map((item: MediaItem) => songFromMediaItem(item))
    .filter((song): song is Child => song != null);
  if (songs.length !== window.length) return null;

  return {
    songs,
    index: active - start,
    position: TrackPlayer.getProgress().position,
    source: usePlayerStore.getState().source,
    savedAt: Date.now(),
  };
}

let pending: ReturnType<typeof setTimeout> | null = null;

async function writeNow() {
  pending = null;
  try {
    const snapshot = capture();
    if (snapshot) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    else if (TrackPlayer.getQueue().length === 0) await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Losing the resume point is a mild inconvenience, never an error.
  }
}

/** Coalesces bursts — a queue rebuild fires several events in a row. */
function scheduleWrite(delay = 800) {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => void writeNow(), delay);
}

/** Starts recording. Returns a cleanup. */
export function startQueuePersistence(): () => void {
  const queueSub = TrackPlayer.addEventListener(Event.QueueChanged, () => scheduleWrite());
  const transitionSub = TrackPlayer.addEventListener(Event.MediaItemTransition, () =>
    scheduleWrite(),
  );
  const appStateSub = AppState.addEventListener('change', (state) => {
    // Backgrounding is the last reliable moment before the process may die.
    if (state !== 'active') void writeNow();
  });
  const timer = setInterval(() => {
    if (TrackPlayer.isPlaying()) scheduleWrite(0);
  }, SAVE_EVERY_MS);

  return () => {
    queueSub.remove();
    transitionSub.remove();
    appStateSub.remove();
    clearInterval(timer);
    if (pending) clearTimeout(pending);
    pending = null;
  };
}

async function readSnapshot(): Promise<Snapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Snapshot>;
    if (!Array.isArray(parsed.songs) || parsed.songs.length === 0) return null;
    if (typeof parsed.index !== 'number') return null;
    const songs = parsed.songs.filter(
      (song): song is Child => !!song && typeof song.id === 'string' && typeof song.title === 'string',
    );
    if (songs.length === 0) return null;
    return {
      songs,
      index: Math.min(Math.max(0, parsed.index), songs.length - 1),
      position: typeof parsed.position === 'number' && parsed.position > 0 ? parsed.position : 0,
      source: parsed.source ?? null,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    };
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
 */
export async function restoreQueue(): Promise<boolean> {
  if (!getSettings().resumeQueue) return false;

  const snapshot = await readSnapshot();
  if (!snapshot) return false;

  for (const wait of [700, 1600]) {
    await sleep(wait);
    if (TrackPlayer.getQueue().length > 0 || TrackPlayer.isPlaying()) return false;
    try {
      await usePlayerStore
        .getState()
        .loadPaused(snapshot.songs, snapshot.index, snapshot.position, snapshot.source ?? {
          kind: 'restored',
          label: 'Last session',
        });
      return TrackPlayer.getQueue().length > 0;
    } catch {
      // Dropped by an unbound controller; the next attempt looks again.
    }
  }
  return false;
}

export async function clearSavedQueue(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
