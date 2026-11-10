import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '../theme/motion';
import { layout, space, type } from '../theme/tokens';
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
 * What happens on release says what was done. An action that leaves the row
 * where it is — queue, like — lets it settle back. One that takes the row
 * away (`removes`) carries it on off the edge it was heading for, and only
 * then is the action run, so the row is seen leaving rather than snapping
 * home and vanishing a moment later.
 *
 * It settles critically damped — a row bouncing past its rest position
 * reads as jelly, and a list of them as unsteady.
 */

export interface SwipeAction {
  icon: ReactNode;
  label: string;
  onAction: () => void;
  /** 'accent' for the primary action, 'dark' for secondary, 'danger' to remove. */
  tone?: 'accent' | 'dark' | 'danger';
  /** The action takes this row out of the list: it flies off rather than settling back. */
  removes?: boolean;
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
/** How long a flown-off row waits to be removed before it gives up and returns. */
const RETURN_AFTER_MS = 900;

export function SwipeableRow({
  children,
  rightSwipe,
  leftSwipe,
  height = layout.rowHeight,
}: SwipeableRowProps) {
  const { width } = useWindowDimensions();
  const color = useTheme();
  const { timings, springs } = useMotion();
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
  const rightRemoves = rightSwipe?.removes === true;
  const leftRemoves = leftSwipe?.removes === true;
  const settle = springs.settle;
  const exit = timings.exit;
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
      // A direction with no action stays shut. Clamped to rest rather than
      // ignored: a finger that reversed across the middle used to leave the
      // row stranded wherever the allowed side had last put it.
      let x = event.translationX;
      if (x > 0 && !canSwipeRight) x = 0;
      if (x < 0 && !canSwipeLeft) x = 0;
      translateX.value = Math.max(-maxTravel, Math.min(maxTravel, x));

      const past = Math.abs(translateX.value) >= commitDistance ? 1 : 0;
      if (past !== armed.value) {
        armed.value = past;
        runOnJS(tick)();
      }
    })
    .onEnd((_event, success) => {
      const dragged = translateX.value;
      armed.value = 0;

      // `success` is false when something else took the touch — the list
      // deciding it was a scroll after all, a system edge gesture. That is
      // not a release, so nothing is committed however far the row had got.
      const right = success && dragged >= commitDistance && canSwipeRight;
      const left = success && dragged <= -commitDistance && canSwipeLeft;

      // Off the edge, then the action. If the row is still here a moment
      // later the removal didn't take — refused, or failed — and it comes
      // back rather than staying lost off screen. A row that did go is
      // unmounted by then, and the return animates nothing.
      if (right && rightRemoves) {
        translateX.value = withTiming(width, exit, (finished) => {
          if (!finished) return;
          runOnJS(commitRight)();
          translateX.value = withDelay(RETURN_AFTER_MS, withSpring(0, settle));
        });
        return;
      }
      if (left && leftRemoves) {
        translateX.value = withTiming(-width, exit, (finished) => {
          if (!finished) return;
          runOnJS(commitLeft)();
          translateX.value = withDelay(RETURN_AFTER_MS, withSpring(0, settle));
        });
        return;
      }

      if (right) runOnJS(commitRight)();
      else if (left) runOnJS(commitLeft)();
      translateX.value = withSpring(0, settle);
    });

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  // Each reveal shows exactly the strip the row has uncovered, so the row
  // itself can stay transparent over the ambient wash. It is a full-width
  // strip slid in from its edge and clipped by the row's frame, with its
  // contents slid back by the same amount so they hold still against the
  // screen while the row uncovers them. All transforms: resizing the strip
  // instead laid the row out again on every frame of a drag.
  const rightRevealStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, translateX.value) - width }],
    opacity: translateX.value > 0 ? 1 : 0,
  }));
  const leftRevealStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: width + Math.min(0, translateX.value) }],
    opacity: translateX.value < 0 ? 1 : 0,
  }));
  const rightGlyph = useAnimatedStyle(() => ({
    transform: [
      { translateX: width - Math.max(0, translateX.value) },
      { scale: interpolate(translateX.value, [0, commitDistance, commitDistance + 1], [0.7, 1, 1.12], 'clamp') },
    ],
  }));
  const leftGlyph = useAnimatedStyle(() => ({
    transform: [
      { translateX: -width - Math.min(0, translateX.value) },
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
          style={[styles.reveal, styles.revealLeft, { width, backgroundColor: toneColor(rightSwipe) }, rightRevealStyle]}
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
          style={[styles.reveal, styles.revealRight, { width, backgroundColor: toneColor(leftSwipe) }, leftRevealStyle]}
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
  // Clips the reveals, which sit just outside until a drag slides them in.
  root: { position: 'relative', overflow: 'hidden' },
  row: { flex: 1 },
  reveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
    // Hidden here as well as in the animated style, so nothing paints behind
    // a row on a frame before the animated style has landed.
    opacity: 0,
  },
  revealLeft: { alignItems: 'flex-start' },
  revealRight: { alignItems: 'flex-end' },
  revealContent: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
