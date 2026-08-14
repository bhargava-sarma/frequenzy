/**
 * Cache contract for library metadata.
 *
 * Deliberately a narrow interface with no platform imports. The measured
 * library is ~1.5 MB of JSON across ~600 albums, which fits AsyncStorage
 * comfortably — but Android's default AsyncStorage ceiling is 6 MB, so a
 * library roughly 3x this one would need SQLite instead. Keeping the backend
 * behind this interface means that swap touches one file rather than every
 * call site.
 */

export interface CacheEntry<T> {
  value: T;
  /** Epoch ms when this entry was written. Drives staleness. */
  storedAt: number;
}

export interface CacheStore {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
  /** Drops every entry owned by this cache, leaving other storage alone. */
  clear(): Promise<void>;
}

/**
 * Bump when a cached shape changes incompatibly.
 *
 * Entries written under an older version are ignored and refetched rather
 * than migrated. This cache holds nothing authoritative — Navidrome is the
 * source of truth — so discarding is always correct and always cheaper than
 * writing a migration.
 */
export const CACHE_VERSION = 1;

/** Keys are namespaced by version so a bump orphans old entries wholesale. */
export const cacheKeys = {
  artists: () => `v${CACHE_VERSION}:artists`,
  artist: (id: string) => `v${CACHE_VERSION}:artist:${id}`,
  album: (id: string) => `v${CACHE_VERSION}:album:${id}`,
  albumList: () => `v${CACHE_VERSION}:albumList`,
  /** Shelf lists, keyed by the server-side ordering that produced them. */
  albumsByType: (type: string, size: number) =>
    `v${CACHE_VERSION}:albums:${type}:${size}`,
} as const;
