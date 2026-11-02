import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Artwork } from '../Artwork';
import { springs, useSpringValue } from '../../theme/motion';
import { motion, radius, withAlpha } from '../../theme/tokens';
import { useArtworkPalette, useThemeControls } from '../../theme/ThemeProvider';
import { useSvgId } from '../../utils/svgId';

/**
 * The cover, as a pane of glass.
 *
 * A soft glow in the cover's own colour sits under it, a reflection crosses
 * its upper corner, and while music plays it breathes — a slow swell of a
 * percent and a half, which reads as the screen being alive rather than as
 * an effect. Paused, it settles back smaller and still, the way Apple
 * Music's player does, so a paused player looks deliberately at rest.
 */
const PAUSED_SCALE = 0.86;
const BREATH_SCALE = 1.015;
const BREATH_PERIOD_MS = 2800;

export const ArtworkFace = memo(function ArtworkFace({
  uri,
  size,
  playing,
}: {
  uri?: string;
  size: number;
  playing: boolean;
}) {
  const { reduceMotion } = useThemeControls();
  const palette = useArtworkPalette();
  const glareId = useSvgId('artglare');
  const breath = useSharedValue(1);
  const rest = useSpringValue(playing ? 1 : PAUSED_SCALE, springs.gentle);

  useEffect(() => {
    if (!playing || reduceMotion) {
      cancelAnimation(breath);
      breath.value = withTiming(1, { duration: motion.durationScreen });
      return;
    }
    breath.value = withRepeat(
      withTiming(BREATH_SCALE, { duration: BREATH_PERIOD_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
    return () => cancelAnimation(breath);
  }, [playing, reduceMotion, breath]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: breath.value * rest.value }] }));
  const corner = radius.xl;

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: corner,
          boxShadow: [
            {
              offsetX: 0,
              offsetY: Math.round(size * 0.08),
              blurRadius: Math.round(size * 0.22),
              spreadDistance: -Math.round(size * 0.04),
              color: withAlpha(palette.vibrant, 0.55),
            },
          ],
        },
        style,
      ]}
    >
      <Artwork uri={uri} size={size} radius={corner} shadow={false} transitionMs={320} />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.overlay, { borderRadius: corner }]}>
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id={glareId} x1="0" y1="0" x2="0.7" y2="0.7">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.13} />
              <Stop offset="0.3" stopColor="#FFFFFF" stopOpacity={0.03} />
              <Stop offset="0.31" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size} height={size} fill={`url(#${glareId})`} />
        </Svg>
      </View>
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: corner,
            borderWidth: 1,
            borderColor: 'rgba(255,255,255,0.22)',
            borderBottomColor: 'rgba(255,255,255,0.06)',
          },
        ]}
      />
    </Animated.View>
  );
});

const styles = StyleSheet.create({
  overlay: { overflow: 'hidden' },
});
