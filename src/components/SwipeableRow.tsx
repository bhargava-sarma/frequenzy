import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { layout, motion, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * Horizontal swipe actions for a list row.
 *
 * Swipe right reveals the queue action behind the row's left edge; swipe
 * left the contextual one on the right. Past the threshold the reveal's
 * glyph pops and the phone ticks, so you know releasing will commit before
 * you do; short of it, the row settles back.
 *
 * Settles on a timing curve, not a spring — a row bouncing past its rest
 * position reads as jelly, and a list of them as unsteady.
 */

export interface SwipeAction {
  icon: ReactNode;
  label: string;
  onAction: () => void;
  /** 'accent' for the primary action, 'dark' for secondary, 'danger' to remove. */
  tone?: 'accent' | 'dark' | 'danger';
}

export interface SwipeableRowProps {
  children: ReactNode;
  /** Revealed by swiping right. */
  rightSwipe?: SwipeAction;
  /** Revealed by swiping left. */
  leftSwipe?: SwipeAction;
  height?: number;
}

const COMMIT_RATIO = 0.28;
const MAX_TRAVEL_RATIO = 0.42;

const SETTLE = { duration: motion.durationBase, easing: Easing.bezier(...motion.easing) } as const;

export function SwipeableRow({
  children,
  rightSwipe,
  leftSwipe,
  height = layout.rowHeight,
}: SwipeableRowProps) {
  const { width } = useWindowDimensions();
  const color = useTheme();
  const translateX = useSharedValue(0);
  const armed = useSharedValue(0);

  const commitDistance = width * COMMIT_RATIO;
  const maxTravel = width * MAX_TRAVEL_RATIO;

  /**
   * Callbacks and flags are pulled out before building the gesture: a
   * worklet serialises everything it captures, and SwipeAction carries a
   * rendered element in `icon`, which cannot cross to the UI thread.
   */
  const onRight = rightSwipe?.onAction;
  const onLeft = leftSwipe?.onAction;
  const canSwipeRight = rightSwipe != null;
  const canSwipeLeft = leftSwipe != null;
  const tick = useCallback(() => haptics.tick(), []);
  // Separate callbacks rather than one taking the action as an argument: a
  // function handed back from the UI thread as a parameter is not a call
  // runOnJS can make.
  const commitRight = useCallback(() => {
    haptics.heavy();
    onRight?.();
  }, [onRight]);
  const commitLeft = useCallback(() => {
    haptics.heavy();
    onLeft?.();
  }, [onLeft]);

  const pan = Gesture.Pan()
    // Only claim clearly horizontal movement, so vertical scrolling wins.
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onUpdate((event) => {
      const { translationX } = event;
      if (translationX > 0 && !canSwipeRight) return;
      if (translationX < 0 && !canSwipeLeft) return;
      translateX.value = Math.max(-maxTravel, Math.min(maxTravel, translationX));

      const past = Math.abs(translateX.value) >= commitDistance ? 1 : 0;
      if (past !== armed.value) {
        armed.value = past;
        runOnJS(tick)();
      }
    })
    .onEnd(() => {
      const dragged = translateX.value;
      if (dragged >= commitDistance && canSwipeRight) runOnJS(commitRight)();
      else if (dragged <= -commitDistance && canSwipeLeft) runOnJS(commitLeft)();
      armed.value = 0;
      translateX.value = withTiming(0, SETTLE);
    })
    .onFinalize(() => {
      if (translateX.value !== 0 && armed.value === 0) translateX.value = withTiming(0, SETTLE);
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  // Each reveal is exactly as wide as the strip the row has uncovered, so
  // the row itself can stay transparent over the ambient wash.
  const rightRevealStyle = useAnimatedStyle(() => ({
    width: Math.max(0, translateX.value),
    opacity: translateX.value > 0 ? 1 : 0,
  }));
  const leftRevealStyle = useAnimatedStyle(() => ({
    width: Math.max(0, -translateX.value),
    opacity: translateX.value < 0 ? 1 : 0,
  }));
  const rightGlyph = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(translateX.value, [0, commitDistance, commitDistance + 1], [0.7, 1, 1.12], 'clamp') },
    ],
  }));
  const leftGlyph = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(-translateX.value, [0, commitDistance, commitDistance + 1], [0.7, 1, 1.12], 'clamp') },
    ],
  }));

  const toneColor = (action: SwipeAction) =>
    action.tone === 'dark' ? color.keyDark : action.tone === 'danger' ? color.destructive : color.accent;
  const toneInk = (action: SwipeAction) =>
    action.tone === 'dark' ? color.keyDarkInk : action.tone === 'danger' ? '#FFFFFF' : color.accentInk;

  return (
    <View style={[styles.root, { height }]}>
      {rightSwipe && (
        <Animated.View
          style={[styles.reveal, styles.revealLeft, { backgroundColor: toneColor(rightSwipe) }, rightRevealStyle]}
        >
          <Animated.View style={[styles.revealContent, rightGlyph]}>
            {rightSwipe.icon}
            <Text style={[type.labelBold, { color: toneInk(rightSwipe) }]} numberOfLines={1}>
              {rightSwipe.label}
            </Text>
          </Animated.View>
        </Animated.View>
      )}

      {leftSwipe && (
        <Animated.View
          style={[styles.reveal, styles.revealRight, { backgroundColor: toneColor(leftSwipe) }, leftRevealStyle]}
        >
          <Animated.View style={[styles.revealContent, leftGlyph]}>
            <Text style={[type.labelBold, { color: toneInk(leftSwipe) }]} numberOfLines={1}>
              {leftSwipe.label}
            </Text>
            {leftSwipe.icon}
          </Animated.View>
        </Animated.View>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.row, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'relative' },
  row: { flex: 1 },
  reveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    overflow: 'hidden',
    // Zero here as well as in the animated style: an absolutely positioned
    // box pinned on one side takes its content's width, so on any frame
    // before the animated style lands it would paint behind every row.
    width: 0,
    opacity: 0,
  },
  revealLeft: { left: 0, alignItems: 'flex-start' },
  revealRight: { right: 0, alignItems: 'flex-end' },
  revealContent: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
