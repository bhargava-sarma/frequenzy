import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { springs } from '../theme/motion';
import { radius as radii, withAlpha } from '../theme/tokens';
import { useTheme, useThemeControls } from '../theme/ThemeProvider';

/**
 * The selection indicator of a segmented control, sliding between equal
 * segments on a spring.
 *
 * It stretches along its direction of travel while it is far from where it
 * is heading and settles back to its resting shape as it arrives, which is
 * what makes the move read as the pill flowing rather than a box being
 * translated. The stretch is derived from the remaining distance on the UI
 * thread, so there is no second animation to keep in step.
 *
 * Drop it in as the FIRST child of a row of equal-width segments, so the
 * segments' labels draw over it. It measures its container itself.
 */

export interface SlidingPillProps {
  /** Selected segment. A negative index hides the pill. */
  index: number;
  /** Number of equal segments. */
  count: number;
  /** Gap between the pill and the container edge. Default 3. */
  inset?: number;
  /** Corner radius. Default fully rounded. */
  radius?: number;
  /**
   * 'glass' (default): a light pill, like the platform's segmented control.
   * 'accent': filled with the accent — pair with accentInk labels.
   */
  tone?: 'glass' | 'accent';
  /** Explicit fill, overriding tone. */
  color?: string;
  /** Extra style for the pill, e.g. a shadow. */
  style?: StyleProp<ViewStyle>;
}

/** How much wider the pill gets at the start of a one-segment move. */
const STRETCH = 0.14;

export const SlidingPill = memo(function SlidingPill({
  index,
  count,
  inset = 3,
  radius = radii.full,
  tone = 'glass',
  color: fillOverride,
  style,
}: SlidingPillProps) {
  const color = useTheme();
  const { resolved } = useThemeControls();
  const [trackWidth, setTrackWidth] = useState(0);

  const segment = count > 0 && trackWidth > 0 ? (trackWidth - inset * 2) / count : 0;
  const target = Math.max(0, index) * segment;

  const x = useSharedValue(target);
  const goal = useSharedValue(target);
  const placed = useRef(false);

  useEffect(() => {
    if (segment <= 0) return;
    goal.value = target;
    // The first position is taken directly: a control should appear with
    // its selection in place, not slide there from the first segment.
    if (!placed.current) {
      placed.current = true;
      x.value = target;
      return;
    }
    x.value = withSpring(target, springs.snappy);
  }, [target, segment, goal, x]);

  const animated = useAnimatedStyle(() => {
    const remaining = segment > 0 ? Math.min(1, Math.abs(goal.value - x.value) / segment) : 0;
    return {
      transform: [
        { translateX: x.value },
        { scaleX: 1 + remaining * STRETCH },
        { scaleY: 1 - remaining * STRETCH * 0.35 },
      ],
    };
  });

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setTrackWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const fill =
    fillOverride ??
    (tone === 'accent'
      ? color.accent
      : resolved === 'dark'
        ? withAlpha(color.glassHighlight, 0.16)
        : color.surfaceRaised);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {segment > 0 && index >= 0 && (
        <Animated.View
          style={[
            styles.pill,
            {
              top: inset,
              bottom: inset,
              left: inset,
              width: segment,
              borderRadius: radius,
              backgroundColor: fill,
            },
            tone === 'glass' && resolved === 'light' && styles.lightShadow,
            tone === 'glass' && resolved === 'dark' && styles.darkEdge,
            style,
            animated,
          ]}
        />
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  pill: { position: 'absolute' },
  // On white the pill is white; only a shadow separates it from the track.
  lightShadow: {
    boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: '#00000026' }],
  },
  darkEdge: { borderWidth: 1, borderColor: '#FFFFFF14' },
});
