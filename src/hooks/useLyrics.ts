import { useEffect, useState } from 'react';
import type { MediaItem } from '@rntp/player';

import { fetchLyrics, type Lyrics } from '../api/lrclib';
import { getCachedLyrics, setCachedLyrics } from '../data/lyricsCache';
import { extrasOf } from '../player/trackMapping';

/**
 * Lyrics for whatever is playing.
 *
 * "None" and "failed" are kept apart all the way to the UI. They read the
 * same to a naive implementation but mean opposite things to someone looking
 * at the screen: one is a fact about the track that will not change by
 * waiting, the other is worth a retry. Only the second gets a retry affordance.
 */

export type LyricsStatus = 'idle' | 'loading' | 'ready' | 'none' | 'error';

export interface LyricsState {
  status: LyricsStatus;
  lyrics: Lyrics | null;
  /** Re-runs the lookup, ignoring any cached miss. */
  retry: () => void;
}

export function useLyrics(item: MediaItem | null | undefined): LyricsState {
  const trackId = extrasOf(item)?.subsonicId ?? null;
  const title = item?.title ?? '';
  const artist = item?.artist ?? '';

  const [status, setStatus] = useState<LyricsStatus>('idle');
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!trackId || !title || !artist) {
      setStatus('idle');
      setLyrics(null);
      return;
    }

    // Guards against a slow lookup for the previous track landing after the
    // next one has already started and painting the wrong words.
    let current = true;

    (async () => {
      setStatus('loading');
      setLyrics(null);

      // A manual retry deliberately skips the cache, since the reason to
      // press it is that the cached answer was unsatisfying.
      if (attempt === 0) {
        const cached = await getCachedLyrics(trackId);
        if (!current) return;

        if (cached !== undefined) {
          setLyrics(cached);
          setStatus(cached ? 'ready' : 'none');
          return;
        }
      }

      try {
        const found = await fetchLyrics({
          trackName: title,
          artistName: artist,
          albumName: item?.albumTitle ?? extrasOf(item)?.albumTitle,
          duration: item?.duration,
        });
        if (!current) return;

        await setCachedLyrics(trackId, found);
        if (!current) return;

        setLyrics(found);
        setStatus(found ? 'ready' : 'none');
      } catch {
        if (!current) return;
        // Not cached: a network failure says nothing about whether the track
        // has lyrics, and writing it down would suppress the next attempt.
        setLyrics(null);
        setStatus('error');
      }
    })();

    return () => {
      current = false;
    };
    // `item` is intentionally absent: it is a fresh object on every render,
    // and the fields that matter are already in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, title, artist, attempt]);

  return { status, lyrics, retry: () => setAttempt((n) => n + 1) };
}
