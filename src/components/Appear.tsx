import { useEffect, type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useMotion } from '../theme/motion';

/**
 * Content that fades up into place when it mounts.
 *
 * For the moment something arrives that wasn't there: a list once it has
 * loaded, results after a search, the body of a mode just switched to.
 * Dropped in over a loading light in a single frame, content reads as a
 * flash; given a quarter of a second and a few points of rise, it reads as
 * having arrived.
 *
 * One of these wraps a section, never a row: a screen gets a handful of
 * animated views, not one per item, and nothing staggers. Change its `key`
 * to play it again for new content. Under Reduce motion it is simply there.
 */
export interface AppearProps {
  children: ReactNode;
  /** Milliseconds to wait first — for a second block following a first. */
  delay?: number;
  /** How far it rises, in points. 0 for a plain fade. */
  rise?: number;
  style?: StyleProp<ViewStyle>;
}

export function Appear({ children, delay = 0, rise = 8, style }: AppearProps) {
  const { reduce, timings } = useMotion();
  const progress = useSharedValue(reduce ? 1 : 0);

  useEffect(() => {
    progress.value = delay > 0 ? withDelay(delay, withTiming(1, timings.appear)) : withTiming(1, timings.appear);
    // Runs once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * rise }],
  }));

  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}
