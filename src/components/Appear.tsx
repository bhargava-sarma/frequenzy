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
 * Kept to small, self-contained blocks — a loading light, an empty state, an
 * error panel. Never a screen or a list: fading a container that holds a
 * whole list or navigator made Android redraw the lot through an offscreen
 * layer and, with clipped lists, could leave rows blank. Change its `key` to
 * play it again for new content. Under Reduce motion it is simply there.
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

  // A plain fade carries no transform at all: one left at rest on a view
  // that wraps a whole screen is a layer the compositor keeps for nothing.
  const animated = useAnimatedStyle(() =>
    rise === 0
      ? { opacity: progress.value }
      : { opacity: progress.value, transform: [{ translateY: (1 - progress.value) * rise }] },
  );

  // Composited as one layer while it fades. Android otherwise applies the
  // opacity to each child separately, so overlapping children — a key's lip
  // under its face — show through one another for the length of the fade.
  // At full opacity no layer is used, so this costs nothing at rest.
  return (
    <Animated.View needsOffscreenAlphaCompositing style={[style, animated]}>
      {children}
    </Animated.View>
  );
}
