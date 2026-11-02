import { useCallback, useEffect, useState } from 'react';
import type { MediaItem } from '@rntp/player';

import { fetchLyrics, type Lyrics } from '../api/lrclib';
import { fetchServerLyrics } from '../api/serverLyrics';
import { getCachedLyrics, setCachedLyrics } from '../data/lyricsCache';
import { extrasOf } from '../player/trackMapping';
import { useServerStore } from '../store/useServerStore';

/**
 * Lyrics for whatever is playing: the server's own first, then LRCLIB.
 *
 * "None" and "failed" are kept apart all the way to the UI. One is a fact
 * about the track that waiting will not change, the other is worth a retry;
 * only the second gets a retry affordance.
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
  const album = item?.albumTitle ?? extrasOf(item)?.albumTitle;
  const duration = item?.duration;
  const client = useServerStore((state) => state.client);

  const [status, setStatus] = useState<LyricsStatus>('idle');
  const [lyrics, setLyrics] = useState<Lyrics | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!trackId || !title) {
      setStatus('idle');
      setLyrics(null);
      return;
    }

    // Guards against a slow lookup for the previous track landing after the
    // next one has started and painting the wrong words.
    let current = true;

    (async () => {
      setStatus('loading');
      setLyrics(null);

      // A manual retry skips the cache: the reason to press it is that the
      // cached answer was unsatisfying.
      if (attempt === 0) {
        const cached = await getCachedLyrics(trackId);
        if (!current) return;
        if (cached !== undefined) {
          setLyrics(cached);
          setStatus(cached ? 'ready' : 'none');
          return;
        }
      }

      const fromServer = client ? await fetchServerLyrics(client, trackId) : null;
      if (!current) return;

      if (fromServer) {
        const found = { ...fromServer, source: 'server' as const };
        await setCachedLyrics(trackId, found);
        if (!current) return;
        setLyrics(found);
        setStatus('ready');
        return;
      }

      if (!artist) {
        setStatus('none');
        return;
      }

      try {
        const found = await fetchLyrics({
          trackName: title,
          artistName: artist,
          albumName: album,
          duration,
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
    // and the fields that matter are already listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackId, title, artist, attempt, client]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { status, lyrics, retry };
}
