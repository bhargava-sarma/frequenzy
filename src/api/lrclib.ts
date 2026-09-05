/**
 * Lyrics from LRCLIB.
 *
 * Deliberately not part of SubsonicClient. This is a different host with no
 * auth, no failover and no bearing on whether the library is reachable — a
 * lyrics outage must never look like a server outage. Kept free of platform
 * imports like the rest of `api/`, so it runs under Node in a check script.
 *
 * LRCLIB is a free community database and asks callers to identify
 * themselves, which is what the User-Agent below is for.
 *
 * https://lrclib.net/docs
 */

const BASE_URL = 'https://lrclib.net/api';
const USER_AGENT = 'Frequenzy/1.0.0 (https://github.com/bhargava-sarma/frequenzy)';

/** Lyrics are a nicety; nothing waits long for them. */
const REQUEST_TIMEOUT_MS = 8000;

/**
 * How far a search hit's duration may differ from ours and still be the same
 * recording, in seconds. LRCLIB's own exact endpoint allows two; searches
 * return other releases of the same song, so this stays equally tight
 * rather than accepting a live version with different timings.
 */
const DURATION_TOLERANCE_S = 2;

export interface LrclibRecord {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string | null;
  syncedLyrics: string | null;
}

export interface LyricsQuery {
  trackName: string;
  artistName: string;
  albumName?: string;
  /** Track length in seconds. Used to tell releases of the same song apart. */
  duration?: number;
}

/** One timed line of an LRC file. */
export interface LyricLine {
  /** Seconds from the start of the track. */
  time: number;
  /** May be empty — LRC uses blank lines for instrumental gaps. */
  text: string;
}

export interface Lyrics {
  /** Timed lines, ascending. Empty when only unsynced lyrics exist. */
  lines: LyricLine[];
  /** Whole text, always present when the track has any lyrics at all. */
  plain: string | null;
  /** The server says this recording has no words. */
  instrumental: boolean;
  /** Whether `lines` came back timed, rather than being derived from `plain`. */
  synced: boolean;
}

export class LyricsUnavailableError extends Error {}

function encode(params: Record<string, string | number | undefined>): string {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
}

async function getJson(
  url: string,
  fetchImpl: typeof fetch,
): Promise<unknown | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
    });

    // 404 is the ordinary "we don't have this one" answer, not a fault.
    if (response.status === 404) return null;
    if (!response.ok) {
      throw new LyricsUnavailableError(`LRCLIB responded ${response.status}`);
    }
    return (await response.json()) as unknown;
  } catch (error) {
    if (error instanceof LyricsUnavailableError) throw error;
    const aborted = controller.signal.aborted;
    throw new LyricsUnavailableError(
      aborted ? `Timed out after ${REQUEST_TIMEOUT_MS}ms` : 'Network request failed',
    );
  } finally {
    clearTimeout(timer);
  }
}

function asRecord(value: unknown): LrclibRecord | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Partial<LrclibRecord>;
  if (typeof r.id !== 'number') return null;
  return {
    id: r.id,
    trackName: String(r.trackName ?? ''),
    artistName: String(r.artistName ?? ''),
    albumName: r.albumName ?? null,
    duration: typeof r.duration === 'number' ? r.duration : null,
    instrumental: Boolean(r.instrumental),
    plainLyrics: r.plainLyrics ?? null,
    syncedLyrics: r.syncedLyrics ?? null,
  };
}

/**
 * Strips a "feat." credit wherever it appears.
 *
 * Tagged into both titles and artist fields depending on who ripped the
 * file, and LRCLIB indexes neither that way.
 */
function stripFeature(value: string): string {
  return value
    .replace(/\s*[([]\s*(?:feat|ft|featuring)\.?\s[^)\]]*[)\]]/gi, '')
    .replace(/\s+(?:feat|ft|featuring)\.?\s.*$/i, '')
    .trim();
}

/**
 * The credited lead, for a field that may list the whole billing.
 *
 * Navidrome hands back every credited artist joined by the ID3 multi-value
 * separators — "24kGoldn; Justin Bieber; J Balvin; iann dior" — while LRCLIB
 * files that track under the lead alone. Only `;` and `/` are split on: they
 * are unambiguously separators, whereas "&" and "," appear inside real names
 * (Simon & Garfunkel, Earth, Wind & Fire) and splitting on them would break
 * more lookups than it fixed.
 */
export function primaryArtist(artist: string): string {
  const lead = artist.split(/\s*[;/]\s*/)[0] ?? artist;
  return stripFeature(lead) || artist.trim();
}

/**
 * A title without its release-variant suffix.
 *
 * "Mood (Remix)", "Bohemian Rhapsody - Remastered 2011", "Song [Live]" — the
 * qualifier is how a library distinguishes pressings, and LRCLIB mostly files
 * the plain name. Used only as a last resort, and the duration check still
 * has to pass, so a genuinely different cut is rejected rather than shown
 * against the wrong timings.
 */
export function baseTitle(title: string): string {
  const stripped = stripFeature(title)
    .replace(/\s*[([][^)\]]*[)\]]\s*$/g, '')
    .replace(/\s+-\s+(?:remaster|remastered|live|mono|stereo|radio|single|album|extended|deluxe|bonus|version|edit|mix|remix)\b.*$/i, '')
    .trim();
  return stripped || title.trim();
}

/**
 * Looks a track up, exact match first and a search as fallback.
 *
 * The exact endpoint keys on artist, track, album and duration together, so
 * it misses whenever Navidrome's tags disagree with LRCLIB's by so much as a
 * subtitle — "(Remastered)" on the album is enough. The search endpoint
 * ignores the album entirely, so it recovers those, but it will happily
 * return a live cut or a different edit; duration is what tells them apart,
 * so hits outside the tolerance are dropped rather than shown.
 *
 * Returns null when the track genuinely isn't in the database, which is a
 * normal outcome and not an error.
 */
export async function fetchLyrics(
  query: LyricsQuery,
  fetchImpl: typeof fetch = globalThis.fetch,
): Promise<Lyrics | null> {
  const exact = asRecord(
    await getJson(
      `${BASE_URL}/get?${encode({
        track_name: query.trackName,
        artist_name: query.artistName,
        album_name: query.albumName,
        duration: query.duration != null ? Math.round(query.duration) : undefined,
      })}`,
      fetchImpl,
    ),
  );
  if (exact) return toLyrics(exact);

  const results = await getJson(
    `${BASE_URL}/search?${encode({
      track_name: query.trackName,
      artist_name: query.artistName,
    })}`,
    fetchImpl,
  );
  if (!Array.isArray(results)) return null;

  const best = pickClosest(usable(results), query.duration);
  if (best) return toLyrics(best);

  // Last resort: retry with the lead artist and the plain title. Only worth a
  // second request when normalising actually changed something.
  const artist = primaryArtist(query.artistName);
  const track = baseTitle(query.trackName);
  if (artist === query.artistName && track === query.trackName) return null;

  const loose = await getJson(
    `${BASE_URL}/search?${encode({ track_name: track, artist_name: artist })}`,
    fetchImpl,
  );
  if (!Array.isArray(loose)) return null;

  const fallback = pickClosest(usable(loose), query.duration);
  return fallback ? toLyrics(fallback) : null;
}

/** Search hits that carry something worth showing. */
function usable(results: unknown[]): LrclibRecord[] {
  return results
    .map(asRecord)
    .filter((r): r is LrclibRecord => r != null)
    .filter((r) => r.syncedLyrics || r.plainLyrics || r.instrumental);
}

/**
 * Prefers a synced result, then the nearest duration.
 *
 * Without a duration to compare against there is nothing to rank on, so the
 * first synced hit wins — LRCLIB returns its own relevance order.
 */
function pickClosest(
  candidates: LrclibRecord[],
  duration: number | undefined,
): LrclibRecord | null {
  if (candidates.length === 0) return null;

  const synced = candidates.filter((r) => r.syncedLyrics);
  const pool = synced.length > 0 ? synced : candidates;

  if (duration == null) return pool[0];

  const scored = pool
    .filter((r) => r.duration != null)
    .map((r) => ({ r, delta: Math.abs((r.duration as number) - duration) }))
    .filter(({ delta }) => delta <= DURATION_TOLERANCE_S)
    .sort((a, b) => a.delta - b.delta);

  return scored[0]?.r ?? null;
}

function toLyrics(record: LrclibRecord): Lyrics {
  const lines = record.syncedLyrics ? parseLrc(record.syncedLyrics) : [];
  return {
    lines,
    plain: record.plainLyrics,
    instrumental: record.instrumental,
    synced: lines.length > 0,
  };
}

/** `[mm:ss.xx]`, `[mm:ss.xxx]` or `[mm:ss]`, repeatable at the head of a line. */
const TIMESTAMP = /\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g;

/**
 * Parses an LRC file into timed lines.
 *
 * One line may carry several timestamps — LRC's way of saying a refrain
 * recurs — so each is emitted separately rather than the line being shown
 * once at the first of them. Metadata tags like `[ar:...]` fail the numeric
 * match and fall out on their own, with no separate list of tags to keep in
 * step. Blank lines are kept: they are the instrumental gaps, and dropping
 * them would make the previous line hang on screen through the whole break.
 */
export function parseLrc(lrc: string): LyricLine[] {
  const out: LyricLine[] = [];

  for (const raw of lrc.split(/\r?\n/)) {
    TIMESTAMP.lastIndex = 0;
    const stamps: number[] = [];
    let match: RegExpExecArray | null;
    let end = 0;

    while ((match = TIMESTAMP.exec(raw)) !== null) {
      // Only a run of timestamps at the head of the line counts. A bracketed
      // time inside the words is lyric text, not a cue.
      if (match.index !== end) break;
      end = match.index + match[0].length;

      const [, mm, ss, frac] = match;
      const fraction = frac ? Number(frac) / 10 ** frac.length : 0;
      stamps.push(Number(mm) * 60 + Number(ss) + fraction);
    }

    if (stamps.length === 0) continue;
    const text = raw.slice(end).trim();
    for (const time of stamps) out.push({ time, text });
  }

  return out.sort((a, b) => a.time - b.time);
}

/**
 * Index of the line that should be highlighted at `seconds`, or -1 before the
 * first one.
 *
 * Binary search rather than a scan: this runs on every progress tick, and a
 * long track can carry several hundred lines.
 */
export function activeLineIndex(lines: LyricLine[], seconds: number): number {
  let lo = 0;
  let hi = lines.length - 1;
  let found = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= seconds) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
