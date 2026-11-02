import type { SubsonicClient } from './client';
import type { LyricLine, Lyrics } from './lrclib';
import type { StructuredLyrics } from '../types/subsonic';

/**
 * Lyrics from the music server itself — embedded in the file's tags or in
 * an .lrc beside it — through the OpenSubsonic `songLyrics` extension.
 *
 * Asked before LRCLIB because they are the user's own: tagged for this exact
 * recording, so they can't be a different edit's timings, and they work for
 * the tracks a public database will never have. A server without the
 * extension answers with an error, which is treated the same as "none".
 */

function toLyrics(entry: StructuredLyrics): Lyrics | null {
  const raw = entry.line ?? [];
  if (raw.length === 0) return null;

  const offset = (entry.offset ?? 0) / 1000;
  const plain = raw.map((line) => line.value ?? '').join('\n').trim();
  if (!entry.synced) {
    return plain ? { lines: [], plain, instrumental: false, synced: false } : null;
  }

  const lines: LyricLine[] = raw
    .filter((line) => typeof line.start === 'number')
    .map((line) => ({ time: Math.max(0, (line.start as number) / 1000 + offset), text: (line.value ?? '').trim() }))
    .sort((a, b) => a.time - b.time);

  if (lines.length === 0) return plain ? { lines: [], plain, instrumental: false, synced: false } : null;
  return { lines, plain: plain || null, instrumental: false, synced: true };
}

/** Null when the server has nothing, or doesn't support the extension. */
export async function fetchServerLyrics(
  client: SubsonicClient,
  songId: string,
): Promise<Lyrics | null> {
  try {
    const response = await client.getLyricsBySongId(songId);
    const entries = response.lyricsList?.structuredLyrics ?? [];
    // A synced variant beats a plain one: following along is the point.
    const ordered = [...entries.filter((e) => e.synced), ...entries.filter((e) => !e.synced)];
    for (const entry of ordered) {
      const lyrics = toLyrics(entry);
      if (lyrics) return lyrics;
    }
    return null;
  } catch {
    return null;
  }
}
