import AsyncStorage from '@react-native-async-storage/async-storage';

import type { CacheEntry, CacheStore } from '../data/cache';

/**
 * AsyncStorage-backed CacheStore.
 *
 * Chosen over expo-sqlite on measured evidence: the library is ~1.5 MB of
 * metadata across 793 tracks, which fits in memory whole, so SQLite's real
 * advantages — indexed queries and partial reads — buy nothing here, while
 * its schema and migrations cost real maintenance. The cache is disposable
 * (the server is authoritative), which removes the usual migration argument
 * entirely.
 *
 * Every key is namespaced so clear() cannot touch credentials or anything
 * else the app persists.
 */

const PREFIX = 'libcache:';

const scoped = (key: string) => `${PREFIX}${key}`;

export function createAsyncStorageCache(): CacheStore {
  return {
    async get<T>(key: string): Promise<CacheEntry<T> | null> {
      const raw = await AsyncStorage.getItem(scoped(key));
      if (!raw) return null;

      try {
        const parsed = JSON.parse(raw) as CacheEntry<T>;
        if (typeof parsed?.storedAt !== 'number') return null;
        return parsed;
      } catch {
        // A truncated or corrupt entry is just a miss — drop it and refetch.
        await AsyncStorage.removeItem(scoped(key));
        return null;
      }
    },

    async set<T>(key: string, value: T): Promise<void> {
      const entry: CacheEntry<T> = { value, storedAt: Date.now() };
      await AsyncStorage.setItem(scoped(key), JSON.stringify(entry));
    },

    async remove(key: string): Promise<void> {
      await AsyncStorage.removeItem(scoped(key));
    },

    async clear(): Promise<void> {
      const keys = await AsyncStorage.getAllKeys();
      const ours = keys.filter((key) => key.startsWith(PREFIX));
      if (ours.length > 0) await AsyncStorage.multiRemove(ours);
    },
  };
}
