import AsyncStorage from '@react-native-async-storage/async-storage';

import type { SubsonicClient } from '../api/client';
import { ApiError } from '../api/errors';

/**
 * Plays that couldn't be reported when they happened, kept until they can.
 *
 * Listening to downloads on a plane is still listening: without this, every
 * play made out of reach of the server would be missing from its counts and
 * charts for good. Each play keeps the time it started, which Subsonic's
 * scrobble accepts, so a play reported hours later still lands at the
 * moment it happened.
 *
 * Only plays the server never heard about are kept. One it answered and
 * refused — a track since removed — is dropped rather than retried forever.
 */

const STORAGE_KEY = 'scrobble.pending.v1';
/** Oldest dropped first past this; a month offline is still well inside it. */
const MAX_PENDING = 1000;

interface PendingPlay {
  id: string;
  /** Epoch ms the play started. */
  time: number;
}

let chain: Promise<unknown> = Promise.resolve();

/** Runs storage work one step at a time, so adds and flushes never interleave. */
function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = chain.then(work, work);
  chain = next.catch(() => {});
  return next;
}

async function read(): Promise<PendingPlay[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((p): p is PendingPlay => !!p && typeof p.id === 'string' && typeof p.time === 'number')
      : [];
  } catch {
    return [];
  }
}

async function write(plays: PendingPlay[]): Promise<void> {
  if (plays.length === 0) await AsyncStorage.removeItem(STORAGE_KEY);
  else await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(plays.slice(-MAX_PENDING)));
}

/** Whether a failed scrobble should be kept for later rather than dropped. */
export function isWorthRetrying(error: unknown): boolean {
  return !(error instanceof ApiError);
}

export function addPendingScrobble(play: PendingPlay): Promise<void> {
  return serial(async () => {
    const plays = await read();
    if (plays.some((p) => p.id === play.id && p.time === play.time)) return;
    plays.push(play);
    await write(plays);
  }).catch(() => {});
}

let flushing = false;

/**
 * Sends what is waiting, oldest first. Stops at the first failure that
 * means the server is out of reach, keeping the rest for next time.
 * Returns how many were sent.
 */
export async function flushPendingScrobbles(client: SubsonicClient): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  try {
    return await serial(async () => {
      const plays = await read();
      if (plays.length === 0) return 0;
      let sent = 0;
      let index = 0;
      for (; index < plays.length; index++) {
        const play = plays[index];
        try {
          await client.scrobble(play.id, { submission: true, time: play.time });
          sent += 1;
        } catch (error) {
          // Refused by the server: this one is never going to land.
          if (!isWorthRetrying(error)) continue;
          break;
        }
      }
      await write(plays.slice(index));
      return sent;
    });
  } catch {
    return 0;
  } finally {
    flushing = false;
  }
}

export async function clearPendingScrobbles(): Promise<void> {
  await serial(() => AsyncStorage.removeItem(STORAGE_KEY)).catch(() => {});
}
