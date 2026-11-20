import AsyncStorage from '@react-native-async-storage/async-storage';

import type { OfflineCollection, OfflineTrack } from './types';

/**
 * The downloads index, kept on the device.
 *
 * One storage entry per track and per collection rather than one document
 * for everything: Android reads each entry through a 2 MB window, and a
 * library of a few thousand downloaded tracks would outgrow a single entry
 * and then fail to load at all. Small entries also mean finishing one track
 * rewrites one track's record, not the whole index.
 *
 * Writes are coalesced: queueing an album marks twenty records dirty and
 * they go out as one batch a moment later.
 */

const PREFIX = 'offline.v1:';
const TRACK = `${PREFIX}t:`;
const COLLECTION = `${PREFIX}c:`;
const SETTINGS = `${PREFIX}settings`;

export interface IndexSettings {
  paused: boolean;
}

export interface LoadedIndex {
  tracks: Record<string, OfflineTrack>;
  collections: Record<string, OfflineCollection>;
  settings: IndexSettings;
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function validTrack(value: unknown): value is OfflineTrack {
  const track = value as OfflineTrack | null;
  return (
    !!track &&
    typeof track.id === 'string' &&
    !!track.song &&
    typeof track.song.id === 'string' &&
    (track.state === 'queued' || track.state === 'done' || track.state === 'failed') &&
    Array.isArray(track.pins)
  );
}

function validCollection(value: unknown): value is OfflineCollection {
  const collection = value as OfflineCollection | null;
  return (
    !!collection &&
    typeof collection.key === 'string' &&
    typeof collection.id === 'string' &&
    Array.isArray(collection.songIds)
  );
}

export async function loadIndex(): Promise<LoadedIndex> {
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
  const tracks: Record<string, OfflineTrack> = {};
  const collections: Record<string, OfflineCollection> = {};
  let settings: IndexSettings = { paused: false };

  // Batched: some storage backends cap how many keys one read may name.
  for (let i = 0; i < keys.length; i += 400) {
    const pairs = await AsyncStorage.multiGet(keys.slice(i, i + 400));
    for (const [key, raw] of pairs) {
      if (key.startsWith(TRACK)) {
        const track = parse<OfflineTrack>(raw);
        if (validTrack(track)) tracks[track.id] = { ...track, attempts: track.attempts ?? 0 };
      } else if (key.startsWith(COLLECTION)) {
        const collection = parse<OfflineCollection>(raw);
        if (validCollection(collection)) collections[collection.key] = collection;
      } else if (key === SETTINGS) {
        const stored = parse<Partial<IndexSettings>>(raw);
        settings = { paused: stored?.paused === true };
      }
    }
  }

  return { tracks, collections, settings };
}

/** Pending writes: a record to store, or null to delete. */
const dirty = new Map<string, string | null>();
let timer: ReturnType<typeof setTimeout> | null = null;
let chain: Promise<void> = Promise.resolve();

function schedule() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    void flush();
  }, 250);
}

/** Writes everything pending now. Resolves once it is stored. */
export function flush(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (dirty.size === 0) return chain;
  const batch = [...dirty.entries()];
  dirty.clear();

  chain = chain.then(async () => {
    const sets = batch.filter((entry): entry is [string, string] => entry[1] != null);
    const removes = batch.filter(([, value]) => value == null).map(([key]) => key);
    try {
      if (sets.length > 0) await AsyncStorage.multiSet(sets);
      if (removes.length > 0) await AsyncStorage.multiRemove(removes);
    } catch {
      // The files are the truth; a record that failed to write is rebuilt
      // from what is on disk the next time the index loads.
    }
  });
  return chain;
}

export function writeTrack(track: OfflineTrack): void {
  dirty.set(`${TRACK}${track.id}`, JSON.stringify(track));
  schedule();
}

export function eraseTrack(id: string): void {
  dirty.set(`${TRACK}${id}`, null);
  schedule();
}

export function writeCollection(collection: OfflineCollection): void {
  dirty.set(`${COLLECTION}${collection.key}`, JSON.stringify(collection));
  schedule();
}

export function eraseCollection(key: string): void {
  dirty.set(`${COLLECTION}${key}`, null);
  schedule();
}

export function writeSettings(settings: IndexSettings): void {
  dirty.set(SETTINGS, JSON.stringify(settings));
  schedule();
}

/** Forgets the whole index. Used on sign-out and "remove all". */
export async function eraseIndex(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  dirty.clear();
  await chain;
  const keys = (await AsyncStorage.getAllKeys()).filter((key) => key.startsWith(PREFIX));
  if (keys.length > 0) await AsyncStorage.multiRemove(keys);
}
