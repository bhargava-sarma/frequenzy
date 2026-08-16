import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { hairline, motion, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';
import { IconDisc } from './icons';

/**
 * Square artwork well, per spec 5.1.
 *
 * Always square and always `contentFit="cover"` on a square frame, so art of
 * any aspect ratio is centre-cropped rather than stretched — the spec calls
 * out awkward stretching specifically. Missing art falls back to a disc glyph
 * on the raised panel fill instead of an empty hole.
 *
 * Uses expo-image rather than RN's Image for its memory+disk cache: a library
 * list scrolls past hundreds of covers, and RN's Image re-decodes on every
 * remount, which shows up as blank tiles when scrolling back up.
 */
export interface ArtworkWellProps {
  uri?: string | null;
  size: number;
  surface?: 'paper' | 'panel';
  style?: StyleProp<ViewStyle>;
  /**
   * Crossfade length. Thumbnails want the default — anything slower reads as
   * lag while scrolling — but a full-screen cover changing between tracks
   * wants long enough to register as a change rather than a cut.
   */
  transitionMs?: number;
}

export function ArtworkWell({
  uri,
  size,
  surface = 'panel',
  style,
  transitionMs = motion.durationFast,
}: ArtworkWellProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const onPanel = surface === 'panel';
  const frame = {
    width: size,
    height: size,
    borderRadius: size <= 48 ? radius.sm : radius.md,
  };

  return (
    <View
      style={[
        styles.well,
        frame,
        {
          backgroundColor: onPanel ? color.panelRaised : color.paperDim,
          borderColor: onPanel ? color.panelLine : color.paperLine,
        },
        style,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={[frame, styles.image]}
          contentFit="cover"
          cachePolicy="memory-disk"
          // Short crossfade only — the spec rules out anything with scale or
          // bounce, and a hard pop on every tile reads as jitter while scrolling.
          transition={transitionMs}
        />
      ) : (
        <IconDisc
          size={Math.min(32, size * 0.34)}
          color={onPanel ? color.textInverseSecondary : color.textSecondary}
          strokeWidth={1.5}
        />
      )}
    </View>
  );
}

/**
 * Format readout, per spec 5.1 — e.g. `FLAC · 24/96`.
 *
 * A nod to hardware spec plates, and doubles as an at-a-glance lossless
 * confirmation. Bit depth and sample rate come from OpenSubsonic fields, so
 * both are omitted rather than guessed when the server doesn't report them.
 */
export interface FormatBadgeProps {
  /** File suffix, e.g. "flac". Rendered uppercase. */
  suffix?: string | null;
  bitDepth?: number | null;
  /** Sample rate in Hz, e.g. 96000. Rendered as kHz. */
  samplingRate?: number | null;
  surface?: 'paper' | 'panel';
}

export function FormatBadge({
  suffix,
  bitDepth,
  samplingRate,
  surface = 'panel',
}: FormatBadgeProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const parts: string[] = [];

  if (suffix) parts.push(suffix.toUpperCase());
  if (bitDepth && samplingRate) {
    // 96000 -> 96, but 44100 -> 44.1: drop the decimal only when it's a whole
    // number, so CD-rate material doesn't read as "44".
    const khz = samplingRate / 1000;
    parts.push(`${bitDepth}/${Number.isInteger(khz) ? khz : khz.toFixed(1)}`);
  }

  if (parts.length === 0) return null;

  return (
    <Text
      style={[
        styles.badge,
        { color: surface === 'panel' ? color.textInverseSecondary : color.textSecondary },
      ]}
    >
      {parts.join(' · ')}
    </Text>
  );
}

const makeStyles = (color: Palette) => StyleSheet.create({
  well: {
    borderWidth: hairline,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: { position: 'absolute' },
  badge: { ...type.label, letterSpacing: 0.88, paddingLeft: space[2] },
});
