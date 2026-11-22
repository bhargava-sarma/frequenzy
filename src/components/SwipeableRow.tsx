import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
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
 * Built to cost almost nothing at rest, because a long list mounts a
 * hundred of these. A row that isn't being swiped holds one shared value
 * and one animated style. The coloured reveal behind it — its views and
 * animated styles — is mounted only once a drag starts and taken away when
 * the row settles. The gesture is built once per row and reads the current
 * actions through a ref; built on every render, as it used to be, each row
 * re-attached its native handler whenever anything re-rendered it.
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
  /**
   * What this row currently shows. When a list reuses the row for something
   * else — a removed track's slot taken by the next copy of it — the row is
   * put back at rest rather than inheriting a swipe in progress.
   */
  identity?: string | number;
}

const COMMIT_RATIO = 0.28;
const MAX_TRAVEL_RATIO = 0.42;
/** How long a flown-off row waits to be removed before it gives up and returns. */
const RETURN_AFTER_MS = 900;

type Side = 0 | 1 | -1;

export function SwipeableRow({
  children,
  rightSwipe,
  leftSwipe,
  height = layout.rowHeight,
  identity,
}: SwipeableRowProps) {
  const { width } = useWindowDimensions();
  const { timings, springs } = useMotion();
  const translateX = useSharedValue(0);
  const armed = useSharedValue(0);
  /** Which reveal is mounted: none until a drag starts. */
  const [side, setSide] = useState<Side>(0);

  const shown = useRef(identity);
  useEffect(() => {
    if (shown.current === identity) return;
    shown.current = identity;
    cancelAnimation(translateX);
    translateX.value = 0;
    armed.value = 0;
    setSide(0);
  }, [identity, translateX, armed]);

  // The latest actions, so the gesture below never has to be rebuilt for them.
  const actions = useRef({ rightSwipe, leftSwipe });
  actions.current = { rightSwipe, leftSwipe };

  const commitDistance = width * COMMIT_RATIO;
  const maxTravel = width * MAX_TRAVEL_RATIO;
  const canSwipeRight = rightSwipe != null;
  const canSwipeLeft = leftSwipe != null;
  const rightRemoves = rightSwipe?.removes === true;
  const leftRemoves = leftSwipe?.removes === true;
  const settle = springs.settle;
  const exit = timings.exit;

  const tick = useCallback(() => haptics.tick(), []);
  const reveal = useCallback((next: Side) => setSide(next), []);
  // Runs whichever action the release committed to, as it is now.
  const commit = useCallback((direction: Side) => {
    haptics.heavy();
    const action = direction > 0 ? actions.current.rightSwipe : actions.current.leftSwipe;
    action?.onAction();
  }, []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Only claim clearly horizontal movement, so vertical scrolling wins.
        .activeOffsetX([-14, 14])
        .failOffsetY([-10, 10])
        .onUpdate((event) => {
          // A direction with no action stays shut. Clamped to rest rather
          // than ignored: a finger that reversed across the middle used to
          // leave the row stranded wherever the allowed side had put it.
          let x = event.translationX;
          if (x > 0 && !canSwipeRight) x = 0;
          if (x < 0 && !canSwipeLeft) x = 0;
          const before = translateX.value;
          const next = Math.max(-maxTravel, Math.min(maxTravel, x));
          translateX.value = next;

          // Crossing to a side mounts that side's reveal.
          const nextSide = next > 0 ? 1 : next < 0 ? -1 : 0;
          const beforeSide = before > 0 ? 1 : before < 0 ? -1 : 0;
          if (nextSide !== 0 && nextSide !== beforeSide) runOnJS(reveal)(nextSide);

          const past = Math.abs(next) >= commitDistance ? 1 : 0;
          if (past !== armed.value) {
            armed.value = past;
            runOnJS(tick)();
          }
        })
        .onEnd((_event, success) => {
          const dragged = translateX.value;
          armed.value = 0;

          // `success` is false when something else took the touch — the list
          // deciding it was a scroll after all, a system edge gesture. That
          // is not a release, so nothing is committed however far it got.
          const right = success && dragged >= commitDistance && canSwipeRight;
          const left = success && dragged <= -commitDistance && canSwipeLeft;

          const home = () => {
            'worklet';
            translateX.value = withSpring(0, settle, (finished) => {
              if (finished) runOnJS(reveal)(0);
            });
          };

          // Off the edge, then the action. If the row is still here a moment
          // later the removal didn't take — refused, or failed — and it comes
          // back rather than staying lost off screen.
          if ((right && rightRemoves) || (left && leftRemoves)) {
            const direction = right ? 1 : -1;
            translateX.value = withTiming(direction * width, exit, (finished) => {
              if (!finished) return;
              runOnJS(commit)(direction);
              translateX.value = withDelay(
                RETURN_AFTER_MS,
                withSpring(0, settle, (back) => {
                  if (back) runOnJS(reveal)(0);
                }),
              );
            });
            return;
          }

          if (right) runOnJS(commit)(1);
          else if (left) runOnJS(commit)(-1);
          home();
        }),
    [
      canSwipeRight,
      canSwipeLeft,
      rightRemoves,
      leftRemoves,
      width,
      commitDistance,
      maxTravel,
      settle,
      exit,
      translateX,
      armed,
      tick,
      reveal,
      commit,
    ],
  );

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }));

  const action = side > 0 ? rightSwipe : side < 0 ? leftSwipe : undefined;

  return (
    <View style={[styles.root, { height }]}>
      {action && (
        <Reveal
          side={side}
          action={action}
          translateX={translateX}
          width={width}
          commitDistance={commitDistance}
        />
      )}
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.row, rowStyle]}>{children}</Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * The strip a drag uncovers: full width, slid in from its edge by exactly
 * as much as the row has moved, so it fills the gap and no more — the row
 * itself stays transparent over the ambient wash. Its glyph rides the row's
 * edge and pops once releasing would commit. All transforms: resizing the
 * strip instead laid the row out again on every frame of a drag.
 */
function Reveal({
  side,
  action,
  translateX,
  width,
  commitDistance,
}: {
  side: Side;
  action: SwipeAction;
  translateX: SharedValue<number>;
  width: number;
  commitDistance: number;
}) {
  const color = useTheme();
  const fill = action.tone === 'dark' ? color.keyDark : action.tone === 'danger' ? color.destructive : color.accent;
  const ink = action.tone === 'dark' ? color.keyDarkInk : action.tone === 'danger' ? '#FFFFFF' : color.accentInk;
  const right = side > 0;

  const stripStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: right ? Math.max(0, translateX.value) - width : width + Math.min(0, translateX.value),
      },
    ],
  }));
  const glyphStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(
          Math.abs(translateX.value),
          [0, commitDistance, commitDistance + 1],
          [0.7, 1, 1.12],
          'clamp',
        ),
      },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.reveal, right ? styles.revealLeft : styles.revealRight, { width, backgroundColor: fill }, stripStyle]}
    >
      <Animated.View style={[styles.revealContent, glyphStyle]}>
        {right ? (
          <>
            <Text style={[type.labelBold, { color: ink }]} numberOfLines={1}>
              {action.label}
            </Text>
            {action.icon}
          </>
        ) : (
          <>
            {action.icon}
            <Text style={[type.labelBold, { color: ink }]} numberOfLines={1}>
              {action.label}
            </Text>
          </>
        )}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Clips the reveal, which sits just outside until a drag slides it in.
  root: { position: 'relative', overflow: 'hidden' },
  row: { flex: 1 },
  reveal: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    justifyContent: 'center',
    paddingHorizontal: layout.screenPadding,
  },
  // The glyph sits against the row's edge, riding it as the row moves.
  revealLeft: { alignItems: 'flex-end' },
  revealRight: { alignItems: 'flex-start' },
  revealContent: { flexDirection: 'row', alignItems: 'center', gap: space[2] },
});
