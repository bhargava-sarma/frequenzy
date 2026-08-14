import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A local log of what played, and when.
 *
 * Subsonic has no "top tracks this week" endpoint — `frequent` is albums only
 * and carries no time window, and getTopSongs is scoped to one artist. So the
 * counts come from this device's own history, written next to each scrobble.
 *
 * That means it reflects listening through this app rather than through every
 * client, which is the honest trade for having windowed charts at all. Nothing
 * here is authoritative: Navidrome still receives every scrobble, and losing
 * this file costs the charts, not the play counts.
 */

const STORAGE_KEY = 'playHistory.v1';

/** Roughly two years of heavy listening, well inside AsyncStorage's ceiling. */
const MAX_ENTRIES = 5000;

export interface PlayEntry {
  songId: string;
  title: string;
  artist?: string;
  albumId?: string;
  coverArt?: string;
  /** Epoch ms. */
  playedAt: number;
}

export type ChartWindow = 'day' | 'week' | 'month' | 'year';

const WINDOW_MS: Record<ChartWindow, number> = {
  day: 24 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
  month: 30 * 24 * 60 * 60 * 1000,
  year: 365 * 24 * 60 * 60 * 1000,
};

export interface TopTrack {
  songId: string;
  title: string;
  artist?: string;
  albumId?: string;
  coverArt?: string;
  plays: number;
}

async function readAll(): Promise<PlayEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PlayEntry[]) : [];
  } catch {
    // A corrupt log is not worth surfacing or repairing — it's derived data.
    return [];
  }
}

/** Appends one play. Called from the scrobbler, alongside the server submission. */
export async function recordPlay(entry: PlayEntry): Promise<void> {
  const entries = await readAll();
  entries.push(entry);

  // Trim from the front: the oldest plays are the first to fall out of even
  // the year window, so they are the cheapest to lose.
  const trimmed = entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Out of storage, most likely. The scrobble already reached the server.
  }
}

/** Most-played tracks inside a window, highest first. */
export async function getTopTracks(window: ChartWindow, limit = 5): Promise<TopTrack[]> {
  const since = Date.now() - WINDOW_MS[window];
  const entries = await readAll();

  const byId = new Map<string, TopTrack>();
  for (const entry of entries) {
    if (entry.playedAt < since) continue;

    const existing = byId.get(entry.songId);
    if (existing) {
      existing.plays += 1;
      continue;
    }

    byId.set(entry.songId, {
      songId: entry.songId,
      title: entry.title,
      artist: entry.artist,
      albumId: entry.albumId,
      coverArt: entry.coverArt,
      plays: 1,
    });
  }

  return [...byId.values()].sort((a, b) => b.plays - a.plays).slice(0, limit);
}

/** Wipes the log. Offered in settings, and used on sign-out. */
export async function clearPlayHistory(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
