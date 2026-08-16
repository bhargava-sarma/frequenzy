import { useEffect } from 'react';
import { useActiveMediaItem } from '@rntp/player';

import { extrasOf } from '../player/trackMapping';
import { useServerStore } from '../store/useServerStore';
import { extractAccent } from '../theme/artworkColor';
import { useThemeControls } from '../theme/ThemeProvider';

/**
 * Feeds the current track's colour into the theme.
 *
 * Renders nothing. It exists so the theme provider stays ignorant of the
 * player: the provider knows how to hold an accent, this knows where one comes
 * from, and neither has to import the other's world.
 *
 * Extraction reads a 64px thumbnail, which Navidrome serves as roughly 1.5 KB
 * of JPEG, and results are cached per cover art id — so a track change costs
 * one small request the first time and nothing after that.
 */
export function ArtworkAccentBridge() {
  const activeItem = useActiveMediaItem();
  const client = useServerStore((state) => state.client);
  const { resolved, artworkAccentEnabled, setArtworkAccent } = useThemeControls();

  const coverArt = extrasOf(activeItem)?.coverArt;

  useEffect(() => {
    if (!artworkAccentEnabled) return;

    if (!client || !coverArt) {
      setArtworkAccent(null);
      return;
    }

    let cancelled = false;

    // Small enough that hue survives but detail doesn't matter — the extractor
    // is looking for the dominant vivid region, not for edges.
    const url = client.buildCoverArtUrl(coverArt, 64);
    if (!url) return;

    void extractAccent(url, coverArt, resolved).then((accent) => {
      // A cover that yields nothing usable leaves the fixed accent in place
      // rather than blanking it, so the UI never loses its highlight colour.
      if (!cancelled && accent) setArtworkAccent(accent);
    });

    return () => {
      cancelled = true;
    };
  }, [client, coverArt, resolved, artworkAccentEnabled, setArtworkAccent]);

  return null;
}
