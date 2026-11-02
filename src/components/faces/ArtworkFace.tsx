import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Artwork } from '../Artwork';
import { radius, withAlpha } from '../../theme/tokens';
import { useArtworkPalette } from '../../theme/ThemeProvider';

/**
 * The cover, as it is.
 *
 * A soft glow in the cover's own colour sits under it and a hairline edge
 * keeps a dark cover from dissolving into a dark background. It holds still
 * whether the music is playing or not — the transport already says which —
 * and a new cover replaces the old one without a crossfade.
 */
export const ArtworkFace = memo(function ArtworkFace({ uri, size }: { uri?: string; size: number }) {
  const palette = useArtworkPalette();
  const corner = radius.xl;

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: corner,
        boxShadow: [
          {
            offsetX: 0,
            offsetY: Math.round(size * 0.06),
            blurRadius: Math.round(size * 0.18),
            spreadDistance: -Math.round(size * 0.04),
            color: withAlpha(palette.vibrant, 0.45),
          },
        ],
      }}
    >
      <Artwork uri={uri} size={size} radius={corner} shadow={false} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.edge, { borderRadius: corner }]} />
    </View>
  );
});

const styles = StyleSheet.create({
  edge: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
});
