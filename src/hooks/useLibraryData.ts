import { useCallback, useEffect, useState } from 'react';

import type { LibraryRepository } from '../data/libraryRepository';
import { useServerStore } from '../store/useServerStore';

/**
 * Loads data through the cached library repository.
 *
 * Every browse screen needs the same four things — data, loading, error, and
 * a way to force a refresh — so they live here rather than being re-derived
 * per screen with slightly different bugs each time.
 *
 * `loader` is called with the repository. Pass a stable callback (useCallback)
 * or an inline function with correct `deps`, since it drives the effect.
 */
export interface LibraryDataState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Bypasses the cache — wire to pull-to-refresh. */
  refresh: () => void;
}

export function useLibraryData<T>(
  loader: (library: LibraryRepository, forceRefresh: boolean) => Promise<T>,
  deps: readonly unknown[],
): LibraryDataState<T> {
  const library = useServerStore((state) => state.library);

  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState(0);
  const [forced, setForced] = useState(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  useEffect(() => {
    if (!library) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    run(library, forced)
      .then((result) => {
        // The screen may have unmounted, or deps changed and a newer request
        // is already in flight — either way this result is stale.
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setForced(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [library, run, refreshToken, forced]);

  const refresh = useCallback(() => {
    setForced(true);
    setRefreshToken((token) => token + 1);
  }, []);

  return { data, loading, error, refresh };
}
