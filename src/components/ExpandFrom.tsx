import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTransitionStore } from '../store/useTransitionStore';
import { motion } from '../theme/tokens';

/**
 * Grows a screen's content out of whatever was pressed to open it.
 *
 * The same motion the player uses when it expands from the dock, applied to
 * the rest of the app. The navigator still owns the screen — back, the
 * hardware button and deep pushes all keep working — but its slide is
 * replaced by a short crossfade, and this supplies the part that makes the
 * transition feel connected to the tap: the content rises and scales from the
 * row's position rather than arriving from the edge of the display.
 *
 * A transform, never a change of bounds. Animating width and height would
 * relayout a list of hundreds of rows on every frame; a transform runs on the
 * UI thread and touches no layout at all.
 *
 * With no recorded origin — a back gesture, a cold start, a press that
 * expired — it rises from just below centre, which is a reasonable neutral
 * and never looks broken.
 */

/** Scale the content starts at. Matches the player's expansion. */
const START_SCALE = 0.92;

/** Neutral rise when there is nothing to grow from, as a fraction of height. */
const NEUTRAL_RISE = 0.06;

export function ExpandFrom({ children }: { children: ReactNode }) {
  const { height } = useWindowDimensions();
  const consumeOrigin = useTransitionStore((state) => state.consumeOrigin);

  // Taken once, on mount. Reading it during render would run twice under
  // StrictMode and consume the origin before the screen that wanted it.
  const [origin] = useState(() => consumeOrigin());

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: motion.durationScreen,
      easing: Easing.bezier(...motion.easing),
    });
  }, [progress]);

  const offset = origin
    ? origin.y + origin.height / 2 - height / 2
    : height * NEUTRAL_RISE;

  const style = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.4, 1], [0, 1, 1]),
    transform: [
      { translateY: interpolate(progress.value, [0, 1], [offset, 0]) },
      { scale: interpolate(progress.value, [0, 1], [START_SCALE, 1]) },
    ],
  }));

  return <Animated.View style={[styles.root, style]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
