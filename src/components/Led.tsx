import { memo, useEffect } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '../theme/motion';
import { withAlpha } from '../theme/tokens';

/**
 * A status LED: a lit dot with a soft halo.
 *
 * Connection state, playback, a running sleep timer. Its colour carries the
 * state — green settled, amber in between, red wrong — and a settled light
 * holds still: one that pulsed for as long as a state lasted would be
 * motion with nothing new to say after the first second.
 *
 * `busy` is the exception, for a state that is itself a wait — linking to
 * the server, mostly. The light breathes for as long as the wait runs, the
 * way a device shows it is working rather than stuck, and stops the moment
 * there is an answer.
 */
export interface LedProps {
  color: string;
  size?: number;
  /** Unlit shows the colour dimmed, as an LED that's off but present. */
  on?: boolean;
  /** Breathes while true: something is in progress. */
  busy?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Led = memo(function Led({ color, size = 7, on = true, busy = false, style }: LedProps) {
  const { reduce } = useMotion();
  const level = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(level);
    if (!busy || reduce) {
      level.value = withTiming(1, { duration: 160 });
      return;
    }
    level.value = withRepeat(
      withTiming(0.35, { duration: 620, easing: Easing.inOut(Easing.quad) }),
      -1,
      true,
    );
    return () => cancelAnimation(level);
  }, [busy, reduce, level]);

  const rest = on ? 1 : 0.28;
  const breathing = useAnimatedStyle(() => ({ opacity: rest * level.value }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          boxShadow: on
            ? [{ offsetX: 0, offsetY: 0, blurRadius: size * 1.4, color: withAlpha(color, 0.7) }]
            : undefined,
        },
        style,
        breathing,
      ]}
    />
  );
});
