import { useCallback } from 'react';

import { useServerStore } from '../store/useServerStore';

/**
 * Returns a resolver for cover art URLs.
 *
 * Lists need thumbnail URLs synchronously while rendering, so this wraps the
 * client's sync builder. Requesting a sized thumbnail rather than full art
 * matters: album covers are often 1500px square, and pulling those for a
 * 40px row wastes bandwidth over Tailscale and memory on the device.
 *
 * The connection is a dependency, not just the client. buildCoverArtUrl needs
 * a live base URL and returns null without one — and on a cold start the
 * library renders from cache long before the probe finishes, so every
 * thumbnail resolved to null and nothing re-rendered once the connection
 * landed. That is why art only appeared after a pull-to-refresh.
 */
export function useArtwork() {
  const client = useServerStore((state) => state.client);
  const connection = useServerStore((state) => state.connection);

  return useCallback(
    (coverArtId: string | undefined | null, size = 128): string | undefined => {
      if (!coverArtId || !client || !connection) return undefined;
      return client.buildCoverArtUrl(coverArtId, size) ?? undefined;
    },
    [client, connection],
  );
}
