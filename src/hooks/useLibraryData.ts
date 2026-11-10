import { useCallback, useEffect, useRef, useState } from 'react';

import type { LibraryRepository } from '../data/libraryRepository';
import { useServerStore } from '../store/useServerStore';
import { errorMessage } from '../store/useToastStore';

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
  /**
   * Whether the next run should bypass the cache. A ref, not state: as state
   * it was a dependency of the effect below, so clearing it once a refresh
   * finished ran the whole load a second time — a cached read straight after
   * the forced one, with `loading` flickering back on in between.
   */
  const forceNext = useRef(false);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps);

  useEffect(() => {
    if (!library) return;

    let cancelled = false;
    const forced = forceNext.current;
    forceNext.current = false;
    setLoading(true);
    setError(null);

    run(library, forced)
      .then((result) => {
        // The screen may have unmounted, or deps changed and a newer request
        // is already in flight — either way this result is stale.
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [library, run, refreshToken]);

  const refresh = useCallback(() => {
    forceNext.current = true;
    setRefreshToken((token) => token + 1);
  }, []);

  return { data, loading, error, refresh };
}
