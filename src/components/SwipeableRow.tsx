import { type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { layout, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Horizontal swipe actions for a list row, per spec 5.3.
 *
 * Swipe RIGHT reveals the queue action behind the row's left edge; swipe LEFT
 * reveals the contextual action (favourite, or remove in the queue) on the
 * right. Dragging past the threshold commits on release; anything short of it
 * snaps back.
 *
 * Motion is `withTiming` with the spec's ease-out curve, never `withSpring`.
 * The spec rules out overshoot explicitly — a row that bounces past its
 * resting position reads as iOS jelly, not as a hardware panel.
 */

export interface SwipeAction {
  /** Icon rendered in the revealed area. */
  icon: ReactNode;
  /** Short uppercase label, e.g. "QUEUE". */
  label: string;
  onAction: () => void;
  /** Accent fill for primary actions; paperDim for secondary ones. */
  tone?: 'accent' | 'neutral';
}

export interface SwipeableRowProps {
  children: ReactNode;
  /** Revealed by swiping right (finger moves left→right). */
  rightSwipe?: SwipeAction;
  /** Revealed by swiping left. */
  leftSwipe?: SwipeAction;
  height?: number;
}

/** Fraction of screen width a drag must pass to commit on release. */
const COMMIT_RATIO = 0.3;
/** How far the row can be dragged, so the reveal never fills the whole row. */
const MAX_TRAVEL_RATIO = 0.45;

/**
 * Snap-back timing, per the spec's motion section: 180ms on a snappy ease-out
 * with no overshoot. Defined at module scope so the worklet captures a stable
 * value rather than rebuilding the easing on every gesture.
 */
const SETTLE_TIMING = {
  duration: 180,
  easing: Easing.bezier(0.2, 0, 0.2, 1),
} as const;

export function SwipeableRow({
  children,
  rightSwipe,
  leftSwipe,
  height = layout.rowHeight,
}: SwipeableRowProps) {
  const { width } = useWindowDimensions();
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const translateX = useSharedValue(0);

  const commitDistance = width * COMMIT_RATIO;
  const maxTravel = width * MAX_TRAVEL_RATIO;

  /**
   * Pull the callbacks and flags out before building the gesture.
   *
   * A worklet serializes everything its closure captures onto the UI thread,
   * and SwipeAction carries a rendered React element in `icon`. Referencing
   * `rightSwipe` inside a callback drags that element along and throws
   * "Cannot copy value of type FiberNode" at runtime. Only plain values and
   * functions may cross the boundary.
   */
  const onRight = rightSwipe?.onAction;
  const onLeft = leftSwipe?.onAction;
  const canSwipeRight = rightSwipe != null;
  const canSwipeLeft = leftSwipe != null;

  const pan = Gesture.Pan()
    // Only claim the gesture once movement is clearly horizontal, so vertical
    // list scrolling still wins — without this the list feels sticky.
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      const { translationX } = event;

      // Don't allow dragging toward an action that isn't configured.
      if (translationX > 0 && !canSwipeRight) return;
      if (translationX < 0 && !canSwipeLeft) return;

      // Clamp rather than applying resistance: rubber-banding is the elastic
      // feel this design excludes.
      translateX.value = Math.max(-maxTravel, Math.min(maxTravel, translationX));
    })
    .onEnd(() => {
      const dragged = translateX.value;

      if (dragged >= commitDistance && onRight) {
        runOnJS(onRight)();
      } else if (dragged <= -commitDistance && onLeft) {
        runOnJS(onLeft)();
      }

      // Always return to rest, committed or not — these are one-shot actions,
      // not a drawer that should stay open.
      translateX.value = withTiming(0, SETTLE_TIMING);
    });

  const rowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Each reveal is only visible while the drag is heading its way, so the two
  // never show at once.
  const rightRevealStyle = useAnimatedStyle(() => ({
    opacity: translateX.value > 0 ? 1 : 0,
  }));
  const leftRevealStyle = useAnimatedStyle(() => ({
    opacity: translateX.value < 0 ? 1 : 0,
  }));

  return (
    <View style={[styles.root, { height }]}>
      {rightSwipe && (
        <Animated.View
          style={[styles.reveal, styles.revealLeft, toneStyle(rightSwipe, color), rightRevealStyle]}
        >
          <Reveal action={rightSwipe} />
        </Animated.View>
      )}

      {leftSwipe && (
        <Animated.View
          style={[styles.reveal, styles.revealRight, toneStyle(leftSwipe, color), leftRevealStyle]}
        >
          <Reveal action={leftSwipe} />
        </Animated.View>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.row, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

function Reveal({ action }: { action: SwipeAction }) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const tint = action.tone === 'neutral' ? color.textPrimary : color.accentInk;
  return (
    <View style={styles.revealContent}>
      {action.icon}
      <Text style={[styles.revealLabel, { color: tint }]}>{action.label}</Text>
    </View>
  );
}

/** Takes the palette explicitly — it runs outside a component. */
function toneStyle(action: SwipeAction, color: Palette) {
  return {
    backgroundColor: action.tone === 'neutral' ? color.paperDim : color.accent,
  };
}

const makeStyles = (color: Palette) => StyleSheet.create({
  root: { position: 'relative', backgroundColor: color.paper },
  row: { flex: 1, backgroundColor: color.paper },

  reveal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  revealLeft: { alignItems: 'flex-start' },
  revealRight: { alignItems: 'flex-end' },
  revealContent: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
  revealLabel: { ...type.label },
});
