import { useEffect } from 'react';

import { localThumbUri } from '../offline/downloads';
import { extrasOf } from '../player/trackMapping';
import { useDownloadStore } from '../store/useDownloadStore';
import { useActiveItem } from '../store/usePlaybackStore';
import { useServerStore } from '../store/useServerStore';
import { useSettingsStore } from '../store/useSettingsStore';
import { extractArtworkColors } from '../theme/artworkColor';
import { useArtworkColorStore } from '../theme/ThemeProvider';

/**
 * Feeds the current cover's colours into the theme. Renders nothing.
 *
 * Extraction reads a 64px thumbnail — about 1.5 KB of JPEG — and results
 * are cached per cover, so a track change costs one small request the first
 * time and nothing after, including when the theme flips.
 *
 * Depends on whether a connection exists, not just on the client: on a cold
 * start the library renders from cache before the first probe lands, and
 * the thumbnail URL can't be built until it has. A downloaded track carries
 * its own small cover, read from the device with or without a connection.
 */
export function ArtworkAccentBridge() {
  const activeItem = useActiveItem();
  const client = useServerStore((state) => state.client);
  const connected = useServerStore((state) => state.connection != null);
  const enabled = useSettingsStore((state) => state.accentMode === 'artwork');
  const setColors = useArtworkColorStore((state) => state.setColors);

  const coverArt = extrasOf(activeItem)?.coverArt;
  const saved = useDownloadStore((state) => (coverArt ? state.covers[coverArt] : undefined));

  useEffect(() => {
    if (!enabled) return;
    if (!client || !coverArt) {
      setColors(null);
      return;
    }
    const local = saved ? localThumbUri(coverArt) : undefined;
    // Otherwise wait for a proven address. The client will build a URL
    // against the last known one, which is right for images that are already
    // cached but not for a fetch that has to reach the server now.
    if (!local && !connected) return;

    const url = local ?? client.buildCoverArtUrl(coverArt, 64);
    if (!url) return;

    let cancelled = false;
    void extractArtworkColors(url, coverArt).then((colors) => {
      if (!cancelled && colors) setColors(colors);
    });
    return () => {
      cancelled = true;
    };
  }, [client, connected, coverArt, enabled, setColors, saved]);

  return null;
}
