import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * A local log of what played, and when.
 *
 * Subsonic has no "top tracks this week" endpoint — `frequent` is albums
 * only and carries no time window — so charts and stats come from this
 * device's own history, written next to each scrobble. It reflects listening
 * through this app rather than every client, which is the honest trade for
 * having windowed numbers at all. Nothing here is authoritative: Navidrome
 * still receives every scrobble, and losing this file costs the charts, not
 * the play counts.
 *
 * Reads are served from memory after the first one. Home, the stats screen
 * and the history list all ask within a second of each other, and parsing a
 * few thousand entries once is cheaper than three times.
 */

const STORAGE_KEY = 'playHistory.v1';

/** Roughly two years of heavy listening, well inside AsyncStorage's ceiling. */
const MAX_ENTRIES = 5000;

export interface PlayEntry {
  songId: string;
  title: string;
  artist?: string;
  artistId?: string;
  album?: string;
  albumId?: string;
  coverArt?: string;
  /** Track length in seconds. Absent on entries written before it was recorded. */
  duration?: number;
  /** Epoch ms the play started. */
  playedAt: number;
}

export type ChartWindow = 'day' | 'week' | 'month' | 'year' | 'all';

const DAY_MS = 24 * 60 * 60 * 1000;

const WINDOW_MS: Record<ChartWindow, number> = {
  day: DAY_MS,
  week: 7 * DAY_MS,
  month: 30 * DAY_MS,
  year: 365 * DAY_MS,
  all: Number.POSITIVE_INFINITY,
};

export interface TopTrack {
  songId: string;
  title: string;
  artist?: string;
  albumId?: string;
  coverArt?: string;
  plays: number;
}

export interface TopArtist {
  /** The artist id when known, else the name — entries predate ids. */
  key: string;
  artistId?: string;
  name: string;
  plays: number;
  coverArt?: string;
}

export interface TopAlbum {
  albumId: string;
  name: string;
  artist?: string;
  coverArt?: string;
  plays: number;
}

export interface ListeningStats {
  plays: number;
  /** Seconds listened, from recorded durations. */
  seconds: number;
  uniqueTracks: number;
  uniqueArtists: number;
  topTracks: TopTrack[];
  topArtists: TopArtist[];
  topAlbums: TopAlbum[];
  /** Plays per hour of the day, local time, 0-23. */
  byHour: number[];
  /** Plays per weekday, Monday first. */
  byWeekday: number[];
  /** Consecutive days up to today (or yesterday) with at least one play. */
  streak: number;
  longestStreak: number;
  /** Epoch ms of the oldest entry in the whole log, or null when empty. */
  firstPlayAt: number | null;
}

let memory: PlayEntry[] | null = null;
let loading: Promise<PlayEntry[]> | null = null;
const listeners = new Set<() => void>();

/** Called whenever the log changes, so open screens can re-read. */
export function onPlayHistoryChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify() {
  for (const listener of listeners) listener();
}

function isEntry(value: unknown): value is PlayEntry {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<PlayEntry>;
  return typeof entry.songId === 'string' && typeof entry.playedAt === 'number';
}

async function readAll(): Promise<PlayEntry[]> {
  if (memory) return memory;
  if (loading) return loading;

  loading = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      // Filtered rather than trusted: a corrupt entry should cost itself, not
      // the whole chart. Sorted so every reader can assume chronology.
      memory = Array.isArray(parsed)
        ? parsed.filter(isEntry).sort((a, b) => a.playedAt - b.playedAt)
        : [];
    } catch {
      memory = [];
    }
    return memory;
  })().finally(() => {
    loading = null;
  });

  return loading;
}

/** Appends one play. Called from the scrobbler, alongside the server submission. */
export async function recordPlay(entry: PlayEntry): Promise<void> {
  const entries = [...(await readAll()), entry];
  // Trim from the front: the oldest plays fall out of every window first.
  memory = entries.length > MAX_ENTRIES ? entries.slice(-MAX_ENTRIES) : entries;
  notify();

  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  } catch {
    // Out of storage, most likely. The scrobble already reached the server.
  }
}

/** The most recent plays, newest first. */
export async function getRecentPlays(limit = 200): Promise<PlayEntry[]> {
  const entries = await readAll();
  return entries.slice(-limit).reverse();
}

function since(window: ChartWindow): number {
  return window === 'all' ? 0 : Date.now() - WINDOW_MS[window];
}

/** Most-played tracks inside a window, highest first. */
export async function getTopTracks(window: ChartWindow, limit = 5): Promise<TopTrack[]> {
  const stats = await getListeningStats(window, { top: limit });
  return stats.topTracks;
}

const dayKey = (time: number) => {
  const d = new Date(time);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Consecutive-day streaks, computed over the whole log rather than a window. */
function streaks(entries: PlayEntry[]): { current: number; longest: number } {
  if (entries.length === 0) return { current: 0, longest: 0 };

  // Unique days in order. Entries are chronological, so first-seen order is
  // ascending. Noon-anchored so stepping a day never trips over DST.
  const days = new Set<string>();
  const noons: number[] = [];
  for (const entry of entries) {
    const key = dayKey(entry.playedAt);
    if (days.has(key)) continue;
    days.add(key);
    const noon = new Date(entry.playedAt);
    noon.setHours(12, 0, 0, 0);
    noons.push(noon.getTime());
  }

  let longest = 1;
  let run = 1;
  for (let i = 1; i < noons.length; i++) {
    const next = new Date(noons[i - 1]);
    next.setDate(next.getDate() + 1);
    run = dayKey(next.getTime()) === dayKey(noons[i]) ? run + 1 : 1;
    longest = Math.max(longest, run);
  }

  // Current: today's run, or yesterday's if nothing has played yet today —
  // a streak shouldn't read as broken at breakfast.
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let current = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    current += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return { current, longest };
}

/** Everything the stats screen and Home's strip need, in one pass. */
export async function getListeningStats(
  window: ChartWindow,
  { top = 10 }: { top?: number } = {},
): Promise<ListeningStats> {
  const all = await readAll();
  const from = since(window);

  const tracks = new Map<string, TopTrack>();
  const artists = new Map<string, TopArtist>();
  const albums = new Map<string, TopAlbum>();
  const byHour = new Array<number>(24).fill(0);
  const byWeekday = new Array<number>(7).fill(0);
  let plays = 0;
  let seconds = 0;

  for (const entry of all) {
    if (entry.playedAt < from) continue;
    plays += 1;
    seconds += entry.duration && entry.duration > 0 ? entry.duration : 0;

    const date = new Date(entry.playedAt);
    byHour[date.getHours()] += 1;
    // getDay is Sunday-first; the readout is Monday-first.
    byWeekday[(date.getDay() + 6) % 7] += 1;

    const track = tracks.get(entry.songId);
    if (track) track.plays += 1;
    else
      tracks.set(entry.songId, {
        songId: entry.songId,
        title: entry.title,
        artist: entry.artist,
        albumId: entry.albumId,
        coverArt: entry.coverArt,
        plays: 1,
      });

    if (entry.artist) {
      const key = entry.artistId ?? entry.artist;
      const artist = artists.get(key);
      if (artist) artist.plays += 1;
      else
        artists.set(key, {
          key,
          artistId: entry.artistId,
          name: entry.artist,
          plays: 1,
          coverArt: entry.coverArt,
        });
    }

    if (entry.albumId) {
      const album = albums.get(entry.albumId);
      if (album) album.plays += 1;
      else
        albums.set(entry.albumId, {
          albumId: entry.albumId,
          name: entry.album ?? entry.title,
          artist: entry.artist,
          coverArt: entry.coverArt,
          plays: 1,
        });
    }
  }

  const ranked = <T extends { plays: number }>(map: Map<string, T>) =>
    [...map.values()].sort((a, b) => b.plays - a.plays).slice(0, top);

  const { current, longest } = streaks(all);

  return {
    plays,
    seconds,
    uniqueTracks: tracks.size,
    uniqueArtists: artists.size,
    topTracks: ranked(tracks),
    topArtists: ranked(artists),
    topAlbums: ranked(albums),
    byHour,
    byWeekday,
    streak: current,
    longestStreak: longest,
    firstPlayAt: all.length > 0 ? all[0].playedAt : null,
  };
}

/** Plays recorded since local midnight. */
export async function getPlaysToday(): Promise<number> {
  const all = await readAll();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);
  let count = 0;
  for (let i = all.length - 1; i >= 0 && all[i].playedAt >= midnight.getTime(); i--) count += 1;
  return count;
}

/** Wipes the log. Offered in settings, and used on sign-out. */
export async function clearPlayHistory(): Promise<void> {
  memory = [];
  notify();
  await AsyncStorage.removeItem(STORAGE_KEY);
}
