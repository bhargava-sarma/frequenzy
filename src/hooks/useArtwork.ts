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
 * The resolver is keyed on the address artwork is served from, not on the
 * connection object. The connection is re-proven every time the app returns
 * to the foreground, and a resolver that changed identity — or went blank —
 * with each probe re-rendered every row on screen and flashed every cover to
 * its placeholder. The address only changes when the phone really has moved
 * between the LAN and the remote route, and even then the image cache finds
 * the same picture under its address-free key (see artworkCacheKey).
 */
export function useArtwork() {
  const client = useServerStore((state) => state.client);
  const base = useServerStore((state) => state.artworkBase);

  return useCallback(
    (coverArtId: string | undefined | null, size = 128): string | undefined => {
      if (!coverArtId || !client || !base) return undefined;
      return client.buildCoverArtUrl(coverArtId, size) ?? undefined;
    },
    [client, base],
  );
}
