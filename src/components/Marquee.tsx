import { memo, useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useThemeControls } from '../theme/ThemeProvider';

/**
 * Single-line text that scrolls when it doesn't fit, like a ticker on a
 * hardware display.
 *
 * It pauses at the start of each pass so the beginning can be read, then
 * runs the full text past at a reading pace, with a second copy following so
 * the loop is seamless. Text that fits sits still. With reduced motion on,
 * long text is simply truncated.
 */
export interface MarqueeProps {
  text: string;
  style?: StyleProp<TextStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  /** Points per second. */
  speed?: number;
  /** Gap between the copies, in points. */
  gap?: number;
  /** Pause at the start of each pass, ms. */
  delay?: number;
  /** Stop scrolling, e.g. while the surface isn't visible. */
  paused?: boolean;
}

export const Marquee = memo(function Marquee({
  text,
  style,
  containerStyle,
  speed = 32,
  gap = 48,
  delay = 1800,
  paused = false,
}: MarqueeProps) {
  const { reduceMotion } = useThemeControls();
  const [boxWidth, setBoxWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const offset = useSharedValue(0);

  const overflow = boxWidth > 0 && textWidth > boxWidth + 1;
  const running = overflow && !reduceMotion && !paused;

  useEffect(() => {
    cancelAnimation(offset);
    offset.value = 0;
    if (!running) return;

    const distance = textWidth + gap;
    offset.value = withRepeat(
      withSequence(
        withDelay(delay, withTiming(-distance, { duration: (distance / speed) * 1000, easing: Easing.linear })),
        // Snap back invisibly: the second copy now sits exactly where the
        // first started.
        withTiming(0, { duration: 0 }),
      ),
      -1,
      false,
    );
    return () => cancelAnimation(offset);
  }, [running, textWidth, gap, speed, delay, offset, text]);

  const animated = useAnimatedStyle(() => ({ transform: [{ translateX: offset.value }] }));

  const onBox = useCallback((event: LayoutChangeEvent) => {
    setBoxWidth(Math.round(event.nativeEvent.layout.width));
  }, []);
  const onMeasure = useCallback((event: LayoutChangeEvent) => {
    setTextWidth(Math.ceil(event.nativeEvent.layout.width));
  }, []);

  return (
    <View style={[styles.box, containerStyle]} onLayout={onBox}>
      {/* Measures the natural width, unconstrained by the box. */}
      <View style={styles.measure} pointerEvents="none" importantForAccessibility="no-hide-descendants">
        <Text style={style} numberOfLines={1} onLayout={onMeasure}>
          {text}
        </Text>
      </View>

      {running ? (
        <Animated.View style={[styles.track, animated]}>
          <Text style={style} numberOfLines={1}>
            {text}
          </Text>
          <View style={{ width: gap }} />
          <Text style={style} numberOfLines={1} importantForAccessibility="no">
            {text}
          </Text>
        </Animated.View>
      ) : (
        <Text style={style} numberOfLines={1}>
          {text}
        </Text>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  box: { overflow: 'hidden', alignSelf: 'stretch' },
  measure: {
    position: 'absolute',
    opacity: 0,
    flexDirection: 'row',
    // Wide enough that a title never wraps or truncates while measuring.
    width: 4000,
    left: 0,
    top: 0,
  },
  track: { flexDirection: 'row', width: 8000 },
});
