import { useCallback } from 'react';

import { dirs } from '../offline/nativeFs';
import { useDownloadStore } from '../store/useDownloadStore';
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
 *
 * A cover saved with a download is used whenever there is one: it draws
 * with no connection at all, and costs no request. It is looked up when the
 * resolver runs rather than subscribed to, so a download landing a new
 * cover every few seconds doesn't hand every list on screen a new resolver
 * and re-render every row; rows pick saved covers up as they next draw. The
 * one re-render that matters — the saved covers becoming known at start-up
 * — is subscribed to.
 */
export function useArtwork() {
  const client = useServerStore((state) => state.client);
  const base = useServerStore((state) => state.artworkBase);
  const downloadsReady = useDownloadStore((state) => state.hydrated);

  return useCallback(
    (coverArtId: string | undefined | null, size = 128): string | undefined => {
      if (!coverArtId) return undefined;
      const local = downloadsReady ? useDownloadStore.getState().covers[coverArtId] : undefined;
      if (local) return `${dirs.covers()}${local}.jpg`;
      if (!client || !base) return undefined;
      return client.buildCoverArtUrl(coverArtId, size) ?? undefined;
    },
    [client, base, downloadsReady],
  );
}
