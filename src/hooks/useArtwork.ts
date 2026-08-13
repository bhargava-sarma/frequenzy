import { useCallback } from 'react';

import { useServerStore } from '../store/useServerStore';

/**
 * Returns a resolver for cover art URLs.
 *
 * Lists need thumbnail URLs synchronously while rendering, so this wraps the
 * client's sync builder. Requesting a sized thumbnail rather than full art
 * matters: album covers are often 1500px square, and pulling those for a
 * 40px row wastes bandwidth over Tailscale and memory on the device.
 */
export function useArtwork() {
  const client = useServerStore((state) => state.client);

  return useCallback(
    (coverArtId: string | undefined | null, size = 128): string | undefined => {
      if (!coverArtId || !client) return undefined;
      return client.buildCoverArtUrl(coverArtId, size) ?? undefined;
    },
    [client],
  );
}
