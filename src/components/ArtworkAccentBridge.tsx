import { useEffect } from 'react';
import { useActiveMediaItem } from '@rntp/player';

import { extrasOf } from '../player/trackMapping';
import { useServerStore } from '../store/useServerStore';
import { extractArtworkColors } from '../theme/artworkColor';
import { useThemeControls } from '../theme/ThemeProvider';

/**
 * Feeds the current track's colours into the theme: the accent, and the
 * palette the background mesh is painted from.
 *
 * Renders nothing. It exists so the theme provider stays ignorant of the
 * player: the provider knows how to hold colours, this knows where they come
 * from, and neither has to import the other's world.
 *
 * Extraction reads a 64px thumbnail, which Navidrome serves as roughly 1.5 KB
 * of JPEG, and results are cached per cover art id — so a track change costs
 * one small request the first time and nothing after that, including when
 * the theme flips.
 */
export function ArtworkAccentBridge() {
  const activeItem = useActiveMediaItem();
  const client = useServerStore((state) => state.client);
  const { resolved, artworkAccentEnabled, setArtworkAccent, setArtworkPalette } =
    useThemeControls();

  const coverArt = extrasOf(activeItem)?.coverArt;

  useEffect(() => {
    if (!artworkAccentEnabled) return;

    if (!client || !coverArt) {
      setArtworkAccent(null);
      setArtworkPalette(null);
      return;
    }

    let cancelled = false;

    // Small enough that hue survives but detail doesn't matter — the extractor
    // is looking for colour regions, not for edges.
    const url = client.buildCoverArtUrl(coverArt, 64);
    if (!url) return;

    void extractArtworkColors(url, coverArt, resolved).then((colors) => {
      if (cancelled || !colors) return;
      // A cover with no vivid hue leaves the current accent in place rather
      // than blanking it, so the UI never loses its highlight colour. The
      // palette always arrives: a monochrome cover gets a grey mesh.
      if (colors.accent) setArtworkAccent(colors.accent);
      setArtworkPalette(colors.palette);
    });

    return () => {
      cancelled = true;
    };
  }, [client, coverArt, resolved, artworkAccentEnabled, setArtworkAccent, setArtworkPalette]);

  return null;
}
