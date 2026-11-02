import { memo, useEffect } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { withAlpha } from '../theme/tokens';
import { useThemeControls } from '../theme/ThemeProvider';

/**
 * A status LED: a lit dot with a soft halo.
 *
 * Connection state, playback, a running sleep timer. `blink` pulses it the
 * way a recording light does — for states that are in progress rather than
 * settled.
 */
export interface LedProps {
  color: string;
  size?: number;
  /** Unlit shows the colour dimmed, as an LED that's off but present. */
  on?: boolean;
  blink?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Led = memo(function Led({ color, size = 7, on = true, blink = false, style }: LedProps) {
  const { reduceMotion } = useThemeControls();
  const level = useSharedValue(1);

  useEffect(() => {
    if (!blink || !on || reduceMotion) {
      cancelAnimation(level);
      level.value = 1;
      return;
    }
    level.value = withRepeat(
      withTiming(0.25, { duration: 700, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(level);
  }, [blink, on, reduceMotion, level]);

  const animated = useAnimatedStyle(() => ({ opacity: on ? level.value : 0.28 }));

  return (
    <Animated.View
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          boxShadow: on
            ? [{ offsetX: 0, offsetY: 0, blurRadius: size * 1.4, color: withAlpha(color, 0.7) }]
            : undefined,
        },
        animated,
        style,
      ]}
    />
  );
});

const styles = StyleSheet.create({
  root: {},
});
