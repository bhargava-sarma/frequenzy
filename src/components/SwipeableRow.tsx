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

import { color, layout, space, type } from '../theme/tokens';

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

export function SwipeableRow({
  children,
  rightSwipe,
  leftSwipe,
  height = layout.rowHeight,
}: SwipeableRowProps) {
  const { width } = useWindowDimensions();
  const translateX = useSharedValue(0);

  const commitDistance = width * COMMIT_RATIO;
  const maxTravel = width * MAX_TRAVEL_RATIO;

  const settle = () => {
    'worklet';
    translateX.value = withTiming(0, {
      duration: 180,
      easing: Easing.bezier(0.2, 0, 0.2, 1),
    });
  };

  const pan = Gesture.Pan()
    // Only claim the gesture once movement is clearly horizontal, so vertical
    // list scrolling still wins — without this the list feels sticky.
    .activeOffsetX([-12, 12])
    .failOffsetY([-12, 12])
    .onUpdate((event) => {
      const { translationX } = event;

      // Don't allow dragging toward an action that isn't configured.
      if (translationX > 0 && !rightSwipe) return;
      if (translationX < 0 && !leftSwipe) return;

      // Clamp rather than applying resistance: rubber-banding is the elastic
      // feel this design excludes.
      translateX.value = Math.max(-maxTravel, Math.min(maxTravel, translationX));
    })
    .onEnd(() => {
      const dragged = translateX.value;

      if (dragged >= commitDistance && rightSwipe) {
        runOnJS(rightSwipe.onAction)();
      } else if (dragged <= -commitDistance && leftSwipe) {
        runOnJS(leftSwipe.onAction)();
      }

      // Always return to rest, committed or not — these are one-shot actions,
      // not a drawer that should stay open.
      settle();
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
        <Animated.View style={[styles.reveal, styles.revealLeft, toneStyle(rightSwipe), rightRevealStyle]}>
          <Reveal action={rightSwipe} />
        </Animated.View>
      )}

      {leftSwipe && (
        <Animated.View style={[styles.reveal, styles.revealRight, toneStyle(leftSwipe), leftRevealStyle]}>
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
  const tint = action.tone === 'neutral' ? color.textPrimary : color.accentInk;
  return (
    <View style={styles.revealContent}>
      {action.icon}
      <Text style={[styles.revealLabel, { color: tint }]}>{action.label}</Text>
    </View>
  );
}

function toneStyle(action: SwipeAction) {
  return {
    backgroundColor: action.tone === 'neutral' ? color.paperDim : color.accent,
  };
}

const styles = StyleSheet.create({
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
