import { createContext, memo, useContext, useEffect, type ReactNode } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { useScreenFocused } from '../hooks/useScreenFocused';
import { layout, radius, space } from '../theme/tokens';
import { useTheme, useThemeControls } from '../theme/ThemeProvider';

/**
 * Loading placeholders with a light band sweeping across them.
 *
 * The shape of what is coming matters more than the shimmer: a skeleton row
 * is exactly a list row's height, so when real rows replace it nothing below
 * moves — and getItemLayout stays correct if a skeleton list shares one.
 *
 * Blocks inside a SkeletonGroup share one animation, so a list of skeleton
 * rows sweeps in unison and costs one clock rather than one per block. A
 * lone Skeleton runs its own. Either way the sweep stops when the screen
 * loses focus.
 */

/** One sweep, left to right. */
const SWEEP_MS = 1400;
/** Width of the light band. */
const BAND = 160;

const ShimmerContext = createContext<SharedValue<number> | null>(null);

function useShimmerClock(): SharedValue<number> {
  const progress = useSharedValue(0);
  const focused = useScreenFocused();

  useEffect(() => {
    if (!focused) {
      cancelAnimation(progress);
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_MS, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [focused, progress]);

  return progress;
}

/** Shares one sweep between every Skeleton inside it. */
export function SkeletonGroup({ children }: { children: ReactNode }) {
  const progress = useShimmerClock();
  return <ShimmerContext.Provider value={progress}>{children}</ShimmerContext.Provider>;
}

export interface SkeletonProps {
  width: DimensionValue;
  height: DimensionValue;
  /** Corner radius. Default radius.sm. */
  radius?: number;
  style?: StyleProp<ViewStyle>;
}

/** A single placeholder block. */
export function Skeleton(props: SkeletonProps) {
  const shared = useContext(ShimmerContext);
  return shared ? <SkeletonBlock {...props} progress={shared} /> : <SoloSkeleton {...props} />;
}

function SoloSkeleton(props: SkeletonProps) {
  const progress = useShimmerClock();
  return <SkeletonBlock {...props} progress={progress} />;
}

function SkeletonBlock({
  width,
  height,
  radius: cornerRadius = radius.sm,
  style,
  progress,
}: SkeletonProps & { progress: SharedValue<number> }) {
  const color = useTheme();
  const { resolved } = useThemeControls();
  const { width: screenWidth } = useWindowDimensions();

  // Travels the width of the screen rather than of the block, so every block
  // in a group sweeps at the same speed whatever its size.
  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -BAND + progress.value * (screenWidth + BAND) }],
  }));

  return (
    <View
      style={[
        styles.block,
        { width, height, borderRadius: cornerRadius, backgroundColor: color.fill },
        style,
      ]}
    >
      <Animated.View style={[styles.band, bandStyle]}>
        <ShimmerBand
          highlight={color.glassHighlight}
          alpha={resolved === 'dark' ? 0.08 : 0.6}
        />
      </Animated.View>
    </View>
  );
}

const ShimmerBand = memo(function ShimmerBand({
  highlight,
  alpha,
}: {
  highlight: string;
  alpha: number;
}) {
  return (
    <Svg width={BAND} height="100%">
      <Defs>
        <LinearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={highlight} stopOpacity={0} />
          <Stop offset="0.5" stopColor={highlight} stopOpacity={alpha} />
          <Stop offset="1" stopColor={highlight} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width="100%" height="100%" fill="url(#shimmer)" />
    </Svg>
  );
});

/** Title and subtitle widths, varied by index so a list doesn't look stamped. */
const TITLE_WIDTHS = [62, 48, 70, 54, 66, 44];
const META_WIDTHS = [38, 30, 44, 34, 26, 40];

export interface SkeletonTrackRowProps {
  /** Position in the list, only used to vary line widths. */
  index?: number;
  showArtwork?: boolean;
}

/** Exactly layout.rowHeight tall, mirroring a track row. */
export const SkeletonTrackRow = memo(function SkeletonTrackRow({
  index = 0,
  showArtwork = true,
}: SkeletonTrackRowProps) {
  return (
    <View style={styles.row}>
      {showArtwork && (
        <Skeleton width={layout.thumbSize} height={layout.thumbSize} radius={radius.sm} />
      )}
      <View style={[styles.rowText, !showArtwork && styles.rowTextNoArt]}>
        <Skeleton
          width={`${TITLE_WIDTHS[index % TITLE_WIDTHS.length]}%`}
          height={13}
          radius={radius.xs}
        />
        <Skeleton
          width={`${META_WIDTHS[index % META_WIDTHS.length]}%`}
          height={11}
          radius={radius.xs}
        />
      </View>
    </View>
  );
});

export interface SkeletonListProps {
  /** Rows to show. Default 8 — enough to fill a phone without mounting more. */
  count?: number;
  showArtwork?: boolean;
  style?: StyleProp<ViewStyle>;
}

/** A group of skeleton track rows sharing one sweep. */
export function SkeletonList({ count = 8, showArtwork = true, style }: SkeletonListProps) {
  return (
    <SkeletonGroup>
      <View style={style}>
        {Array.from({ length: count }, (_, index) => (
          <SkeletonTrackRow key={index} index={index} showArtwork={showArtwork} />
        ))}
      </View>
    </SkeletonGroup>
  );
}

export interface SkeletonTileProps {
  /** Artwork side. Default layout.shelfTileSize. */
  size?: number;
  /** Round artwork, for artist tiles. */
  round?: boolean;
}

/** A shelf tile: square artwork and two short lines. */
export const SkeletonTile = memo(function SkeletonTile({
  size = layout.shelfTileSize,
  round = false,
}: SkeletonTileProps) {
  return (
    <View style={{ width: size }}>
      <Skeleton width={size} height={size} radius={round ? size / 2 : radius.md} />
      <Skeleton width="80%" height={12} radius={radius.xs} style={styles.tileLine} />
      <Skeleton width="55%" height={10} radius={radius.xs} style={styles.tileLineSmall} />
    </View>
  );
});

const styles = StyleSheet.create({
  block: { overflow: 'hidden' },
  band: { position: 'absolute', top: 0, bottom: 0, left: 0, width: BAND },
  row: {
    height: layout.rowHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  rowText: { flex: 1, marginLeft: space[3], gap: space[2] },
  rowTextNoArt: { marginLeft: 0 },
  tileLine: { marginTop: space[2] },
  tileLineSmall: { marginTop: space[1] + 2 },
});
