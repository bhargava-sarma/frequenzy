import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { NowPlayingScreen } from '../screens/NowPlayingScreen';
import { QueueScreen } from '../screens/QueueScreen';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { layout, motion } from '../theme/tokens';

/**
 * The full player, expanding out of whatever opened it.
 *
 * Sits above the navigator rather than inside it. As a stack screen the
 * player could only slide in from an edge, and Android's stack detaches the
 * screen underneath while it is up — which is what left a black rectangle
 * behind after a swipe-down. Nothing here unmounts, so there is nothing to
 * leave unpainted, and the transition is ours rather than the platform's.
 *
 * The expansion is a scale and a rise, not a morph of the container's bounds.
 * Animating width and height would relayout the whole player on every frame;
 * a transform runs on the UI thread and touches no layout at all. Starting it
 * small and centred on the dock reads as growing out of the dock, which is
 * the part that matters.
 */

/** How far the player must be dragged before releasing closes it. */
const DISMISS_DISTANCE = 140;
/** ...or how fast it must be moving, for a flick. */
const DISMISS_VELOCITY = 900;

/** Scale the player starts at. Small enough to read as growing, not as sliding. */
const START_SCALE = 0.86;

const TIMING = {
  duration: motion.durationScreen,
  easing: Easing.bezier(...motion.easing),
};

export function PlayerOverlay() {
  const { height } = useWindowDimensions();

  const open = usePlayerUiStore((state) => state.open);
  const origin = usePlayerUiStore((state) => state.origin);
  const closePlayer = usePlayerUiStore((state) => state.closePlayer);

  /** 0 = collapsed into the origin, 1 = filling the screen. */
  const progress = useSharedValue(0);
  /** Extra downward drag while dismissing, in points. */
  const dragY = useSharedValue(0);

  // Where the player appears to come from — the centre of whatever was
  // pressed, relative to the centre of the screen.
  const originOffset = origin ? origin.y + origin.height / 2 - height / 2 : height / 2;

  useEffect(() => {
    if (open) {
      dragY.value = 0;
      progress.value = withTiming(1, TIMING);
    } else {
      progress.value = withTiming(0, TIMING);
    }
  }, [open, progress, dragY]);

  const pan = Gesture.Pan()
    .activeOffsetY(24)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        // Collapse back toward the dock rather than sliding off the bottom:
        // it should look like it went back where it came from.
        dragY.value = withTiming(0, TIMING);
        runOnJS(closePlayer)();
        return;
      }
      dragY.value = withTiming(0, TIMING);
    });

  const containerStyle = useAnimatedStyle(() => {
    // Dragging eats into the same progress the expansion uses, so a drag and
    // a dismissal are the same motion at different speeds.
    const dragProgress = Math.max(0, 1 - dragY.value / (DISMISS_DISTANCE * 2.5));
    const p = progress.value * dragProgress;

    return {
      opacity: interpolate(p, [0, 0.35, 1], [0, 1, 1]),
      transform: [
        { translateY: interpolate(p, [0, 1], [originOffset, 0]) },
        { scale: interpolate(p, [0, 1], [START_SCALE, 1]) },
      ],
      borderRadius: interpolate(p, [0, 1], [layout.dockRadius, 0]),
    };
  });

  // Unmounted when closed so the player's hooks — progress ticks, the sleep
  // timer poll — are not running behind the library.
  if (!open) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.container, containerStyle]}>
          <NowPlayingScreen />
          <QueuePanel />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

/**
 * The queue, over the player.
 *
 * A panel rather than another screen, for the same reason the player is: it
 * belongs to what is playing, and pushing it onto a stack put it in the same
 * detach-the-screen-below trap.
 */
function QueuePanel() {
  const { height } = useWindowDimensions();
  const queueOpen = usePlayerUiStore((state) => state.queueOpen);
  const closeQueue = usePlayerUiStore((state) => state.closeQueue);

  const offset = useSharedValue(height);
  const dragY = useSharedValue(0);

  useEffect(() => {
    offset.value = withTiming(queueOpen ? 0 : height, TIMING);
    if (queueOpen) dragY.value = 0;
  }, [queueOpen, height, offset, dragY]);

  const pan = Gesture.Pan()
    .activeOffsetY(24)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(closeQueue)();
        dragY.value = 0;
        return;
      }
      dragY.value = withTiming(0, TIMING);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value + dragY.value }],
  }));

  if (!queueOpen) return null;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <QueueScreen />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    // Clips the player's own square corners while the radius animates in.
    overflow: 'hidden',
  },
});
