import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The last few things searched for.
 *
 * An empty search screen is a dead end — there is nothing to look at and
 * nothing to act on until you type. Recent queries turn it into a shortcut
 * back to whatever you were doing, which is what most searches are.
 *
 * Kept on the device rather than sent anywhere: Subsonic has no concept of
 * search history, and this is a convenience, not data worth syncing.
 */

const STORAGE_KEY = 'recentSearches.v1';

/** Short by design. A long history is a list to search through in itself. */
const MAX_ENTRIES = 8;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Records a query, most recent first.
 *
 * Deduped case-insensitively, and an earlier entry the new query merely
 * extends is dropped: "rad", "radio", "radiohead" is one search typed
 * slowly, not three, and keeping each stop along the way fills the list
 * with fragments.
 */
export async function recordSearch(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return getRecentSearches();

  const needle = trimmed.toLowerCase();
  const existing = await getRecentSearches();
  const next = [
    trimmed,
    ...existing.filter((entry) => {
      const other = entry.toLowerCase();
      return other !== needle && !needle.startsWith(other);
    }),
  ].slice(0, MAX_ENTRIES);

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Convenience data; a failed write costs nothing worth reporting.
  }
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
