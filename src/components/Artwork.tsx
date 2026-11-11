import { memo, useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { IconDisc, IconUser } from './icons';
import { radius as radii, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { artworkCacheKey } from '../utils/artworkKey';

/**
 * Cover art in a frame.
 *
 * Always square and centre-cropped, so art of any aspect ratio is never
 * stretched. Missing art falls back to a glyph on a sunken fill rather than
 * an empty hole. The corner radius grows with the art — one fixed radius
 * looks pinched on a large cover and blobby on a small one — and only large
 * covers cast a shadow: hundreds of shadow passes under 46pt thumbnails buy
 * depth nobody can see.
 *
 * expo-image rather than RN's Image for its memory and disk cache: a library
 * list scrolls past hundreds of covers, and re-decoding them on every
 * remount shows up as blank tiles when scrolling back. Covers are cached
 * under the picture's id rather than its URL, so they survive a restart and
 * a change of network — and still draw when the server is out of reach.
 */
export interface ArtworkProps {
  uri?: string | null;
  size: number;
  /** Circular — artists. */
  round?: boolean;
  /** Fade-in length once loaded. Default 0: art appears when it arrives. */
  transitionMs?: number;
  /** Heavy blur, for backdrops. */
  blurRadius?: number;
  /** Override the shadow decision. */
  shadow?: boolean;
  /** A hairline edge, so art close to the background colour keeps its shape. */
  rim?: boolean;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

export const Artwork = memo(function Artwork({
  uri,
  size,
  round = false,
  transitionMs = 0,
  blurRadius,
  shadow,
  rim = false,
  radius,
  style,
}: ArtworkProps) {
  const color = useTheme();
  const corner = round
    ? size / 2
    : (radius ?? (size <= 56 ? radii.sm : size <= 120 ? 10 : size <= 200 ? radii.md : radii.lg));
  const lifted = shadow ?? size >= 160;
  const frame = { width: size, height: size, borderRadius: corner };
  const Glyph = round ? IconUser : IconDisc;
  const cacheKey = artworkCacheKey(uri);
  // Memoised on the two strings: a fresh source object each render would
  // have the image view re-resolve its source on every parent re-render.
  const source = useMemo(() => (uri ? { uri, cacheKey } : null), [uri, cacheKey]);

  return (
    <View
      style={[
        styles.well,
        frame,
        { backgroundColor: color.fill },
        lifted && {
          boxShadow: [
            {
              offsetX: 0,
              offsetY: Math.round(size * 0.05),
              blurRadius: Math.round(size * 0.12),
              spreadDistance: 0,
              color: withAlpha(color.shadow, color.mode === 'light' ? 0.22 : 0.55),
            },
          ],
        },
        style,
      ]}
    >
      {/* Large covers keep the glyph underneath while they load, so a slow
          server shows a disc, not an empty slab. Thumbnails skip it: one more
          SVG per row is a real cost in a long list. */}
      {(!uri || (size >= 120 && blurRadius == null)) && (
        <Glyph
          size={Math.max(14, Math.min(40, size * 0.34))}
          color={color.labelTertiary}
          strokeWidth={1.5}
        />
      )}
      {source ? (
        <Image
          source={source}
          style={[frame, styles.image]}
          contentFit="cover"
          cachePolicy="memory-disk"
          // No recyclingKey. It exists for lists that hand one view from row
          // to row, which these lists don't; all it did here was blank the
          // frame whenever the picture changed in place — the player's cover
          // dropping to an empty slab between every two tracks. Without it
          // the old cover stays up until the new one is ready to take over.
          transition={transitionMs}
          blurRadius={blurRadius}
        />
      ) : null}
      {rim && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            {
              borderRadius: corner,
              borderWidth: 1,
              borderColor: withAlpha(color.label, 0.08),
            },
          ]}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  well: { alignItems: 'center', justifyContent: 'center' },
  image: { position: 'absolute', top: 0, left: 0 },
});
