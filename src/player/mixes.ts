import { shuffleList, usePlayerStore } from '../store/usePlayerStore';
import { useServerStore } from '../store/useServerStore';
import type { Child } from '../types/subsonic';

/**
 * Queues that are generated rather than chosen: radio from a seed, random
 * mixes by genre or decade, the whole library on shuffle.
 *
 * Each source degrades instead of failing. Similar-track lookups depend on
 * Navidrome having an external agent configured, and an empty answer from
 * one source is a reason to try the next, never an error to show.
 */

function client() {
  const instance = useServerStore.getState().client;
  if (!instance) throw new Error('Not connected to a server');
  return instance;
}

/** Drops duplicates and the seed, keeping first occurrences. */
function distinct(songs: Child[], exclude: Set<string> = new Set()): Child[] {
  const seen = new Set(exclude);
  const out: Child[] = [];
  for (const song of songs) {
    if (!song?.id || seen.has(song.id)) continue;
    seen.add(song.id);
    out.push(song);
  }
  return out;
}

/** Thrown when every source came back empty; callers show it as-is. */
export class EmptyMixError extends Error {}

const RADIO_SIZE = 60;

/**
 * A radio seeded from a track: similar tracks, then the artist's top
 * tracks, then the same genre, then anything. The seed plays first.
 */
export async function startTrackRadio(seed: Child): Promise<number> {
  const api = client();
  const exclude = new Set([seed.id]);
  let pool: Child[] = [];

  const attempts: (() => Promise<Child[]>)[] = [
    async () => (await api.getSimilarSongs(seed.id, RADIO_SIZE)).similarSongs?.song ?? [],
    async () =>
      seed.artistId
        ? ((await api.getSimilarSongs2(seed.artistId, RADIO_SIZE)).similarSongs2?.song ?? [])
        : [],
    async () =>
      seed.artist ? ((await api.getTopSongs(seed.artist, 20)).topSongs?.song ?? []) : [],
    async () =>
      seed.genre
        ? ((await api.getRandomSongs({ size: RADIO_SIZE, genre: seed.genre })).randomSongs?.song ?? [])
        : [],
    async () => (await api.getRandomSongs({ size: RADIO_SIZE })).randomSongs?.song ?? [],
  ];

  for (const attempt of attempts) {
    if (pool.length >= 20) break;
    try {
      pool = distinct([...pool, ...(await attempt())], exclude);
    } catch {
      // One source failing is a reason to try the next one.
    }
  }

  if (pool.length === 0) throw new EmptyMixError('Nothing to build a radio from');
  const queue = [seed, ...shuffleList(pool).slice(0, RADIO_SIZE)];
  await usePlayerStore.getState().playNow(queue, 0, { kind: 'radio', label: `${seed.title} radio` });
  return queue.length;
}

/** An artist's radio: similar artists' tracks mixed with their own. */
export async function startArtistRadio(artistId: string, artistName: string): Promise<number> {
  const api = client();
  let pool: Child[] = [];

  try {
    pool = (await api.getSimilarSongs2(artistId, RADIO_SIZE)).similarSongs2?.song ?? [];
  } catch {
    pool = [];
  }
  try {
    const top = (await api.getTopSongs(artistName, 15)).topSongs?.song ?? [];
    pool = distinct([...top, ...pool]);
  } catch {
    // Top songs are a bonus.
  }
  if (pool.length === 0) {
    const random = (await api.getRandomSongs({ size: RADIO_SIZE })).randomSongs?.song ?? [];
    pool = distinct(random);
  }
  if (pool.length === 0) throw new EmptyMixError('Nothing to build a radio from');

  await usePlayerStore
    .getState()
    .shufflePlay(pool.slice(0, RADIO_SIZE), { kind: 'radio', label: `${artistName} radio` });
  return pool.length;
}

export interface MixRequest {
  label: string;
  genre?: string;
  fromYear?: number;
  toYear?: number;
  size?: number;
}

/** A random mix, optionally narrowed. Plays immediately. */
export async function playMix(request: MixRequest): Promise<number> {
  const response = await client().getRandomSongs({
    size: request.size ?? 100,
    genre: request.genre,
    fromYear: request.fromYear,
    toYear: request.toYear,
  });
  const songs = distinct(response.randomSongs?.song ?? []);
  if (songs.length === 0) throw new EmptyMixError(`Nothing in ${request.label}`);
  // Random already; played in the order given so "shuffle" reads off.
  await usePlayerStore.getState().playNow(songs, 0, { kind: 'mix', label: request.label });
  return songs.length;
}

/** The whole library on shuffle, a few hundred tracks at a time. */
export function shuffleLibrary(): Promise<number> {
  return playMix({ label: 'Shuffle all', size: 300 });
}

/** Every liked track, in order or shuffled. */
export async function playLiked(shuffled: boolean): Promise<number> {
  const response = await client().getStarred2();
  const songs = response.starred2.song ?? [];
  if (songs.length === 0) throw new EmptyMixError('No liked songs yet');
  const source = { kind: 'liked' as const, label: 'Liked songs' };
  if (shuffled) await usePlayerStore.getState().shufflePlay(songs, source);
  else await usePlayerStore.getState().playNow(songs, 0, source);
  return songs.length;
}

/** Up to `limit` tracks in a genre, shuffled. */
export async function playGenre(genre: string, limit = 300): Promise<number> {
  const response = await client().getSongsByGenre(genre, { count: limit });
  const songs = distinct(response.songsByGenre?.song ?? []);
  if (songs.length === 0) throw new EmptyMixError(`No tracks in ${genre}`);
  await usePlayerStore.getState().shufflePlay(songs, { kind: 'genre', label: genre });
  return songs.length;
}

export const DECADES = [1950, 1960, 1970, 1980, 1990, 2000, 2010, 2020] as const;

export function decadeLabel(decade: number): string {
  return `${String(decade).slice(2)}s`;
}
