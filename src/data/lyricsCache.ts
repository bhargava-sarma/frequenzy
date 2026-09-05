import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Lyrics } from '../api/lrclib';

/**
 * Lyrics kept on the device, hits and misses alike.
 *
 * Caching the misses is the point. Most of a library is never going to be in
 * LRCLIB — B-sides, live sets, anything niche — and without a record of that,
 * every play of those tracks costs two requests to someone else's free server
 * to learn the same thing again. Misses expire, because the database grows
 * and a track absent today may be there next month; hits do not, because
 * lyrics for a fixed recording don't change.
 *
 * Separate from the library cache rather than folded into it: this is keyed
 * on a third party's data, and "Clear library cache" should not have to mean
 * "re-fetch every lyric too".
 */

const PREFIX = 'lyrics:v1:';
const INDEX_KEY = `${PREFIX}index`;

/** How long a "not in the database" answer stands before we ask again. */
const MISS_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Roughly 1-2 KB per entry, so this is a low single-digit MB ceiling. Android's
 * AsyncStorage budget is ~6 MB and the library cache already holds ~1.5 MB of
 * it, which is what keeps this bounded rather than unlimited.
 */
const MAX_ENTRIES = 400;

interface CachedLyrics {
  /** null means "looked up, genuinely not there". */
  lyrics: Lyrics | null;
  storedAt: number;
}

const keyFor = (trackId: string) => `${PREFIX}t:${trackId}`;

async function readIndex(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INDEX_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Returns the cached answer, or undefined when we should go and ask.
 *
 * Distinguishes three states deliberately: `undefined` for "unknown", `null`
 * for "known to have none", and a value for a hit. Collapsing the first two
 * would make every miss re-request forever.
 */
export async function getCachedLyrics(
  trackId: string,
): Promise<Lyrics | null | undefined> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(trackId));
    if (!raw) return undefined;

    const entry = JSON.parse(raw) as CachedLyrics;
    if (typeof entry?.storedAt !== 'number') return undefined;

    if (entry.lyrics === null && Date.now() - entry.storedAt > MISS_TTL_MS) {
      return undefined;
    }
    return entry.lyrics;
  } catch {
    return undefined;
  }
}

export async function setCachedLyrics(
  trackId: string,
  lyrics: Lyrics | null,
): Promise<void> {
  const entry: CachedLyrics = { lyrics, storedAt: Date.now() };

  try {
    await AsyncStorage.setItem(keyFor(trackId), JSON.stringify(entry));

    // Most recent last, so the oldest fall off the front.
    const index = (await readIndex()).filter((id) => id !== trackId);
    index.push(trackId);

    const overflow = index.length - MAX_ENTRIES;
    if (overflow > 0) {
      const evicted = index.splice(0, overflow);
      await AsyncStorage.multiRemove(evicted.map(keyFor));
    }
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(index));
  } catch {
    // A cache write failing costs a refetch, which is not worth surfacing.
  }
}

/** Drops every cached lyric. Wired to the Settings maintenance actions. */
export async function clearLyricsCache(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const ours = keys.filter((key) => key.startsWith(PREFIX));
  if (ours.length > 0) await AsyncStorage.multiRemove(ours);
}
