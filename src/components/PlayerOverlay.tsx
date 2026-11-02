import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { PanelDragContext } from './PanelHandle';
import { NowPlayingScreen } from '../screens/NowPlayingScreen';
import { LyricsScreen } from '../screens/LyricsScreen';
import { QueueScreen } from '../screens/QueueScreen';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { springs } from '../theme/motion';
import { layout, motion } from '../theme/tokens';
import { ImmersiveScope } from '../theme/ThemeProvider';

/**
 * The full player, expanding out of whatever opened it.
 *
 * Sits above the navigator rather than inside it: as a stack screen the
 * player could only slide in from an edge, and Android's stack detaches the
 * screen underneath while it is up. Nothing here unmounts the app, so there
 * is nothing to leave unpainted, and the transition is ours.
 *
 * It stays mounted until its collapse has finished — unmounting the moment
 * `open` went false is what made it vanish rather than shrink back into the
 * dock. The hardware back button closes a panel first, then the player,
 * before navigation ever sees it.
 *
 * Everything inside is rendered against the immersive (dark) palette: over
 * artwork colour, light type is the only thing that reads in every case.
 */

const DISMISS_DISTANCE = 140;
const DISMISS_VELOCITY = 900;
const START_SCALE = 0.86;

const CLOSE = { duration: motion.durationScreen, easing: Easing.bezier(...motion.easing) };

export function PlayerOverlay() {
  const { height } = useWindowDimensions();

  const open = usePlayerUiStore((state) => state.open);
  const origin = usePlayerUiStore((state) => state.origin);
  const closePlayer = usePlayerUiStore((state) => state.closePlayer);
  const queueOpen = usePlayerUiStore((state) => state.queueOpen);
  const closeQueue = usePlayerUiStore((state) => state.closeQueue);
  const lyricsOpen = usePlayerUiStore((state) => state.lyricsOpen);
  const closeLyrics = usePlayerUiStore((state) => state.closeLyrics);

  const [mounted, setMounted] = useState(open);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  const originOffset = origin ? origin.y + origin.height / 2 - height / 2 : height / 2;

  useEffect(() => {
    if (open) {
      dragY.value = 0;
      setMounted(true);
      progress.value = withSpring(1, springs.screen);
      return;
    }
    progress.value = withTiming(0, CLOSE, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [open, progress, dragY]);

  // Back closes the innermost thing first, and is consumed while open.
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      const ui = usePlayerUiStore.getState();
      if (ui.lyricsOpen) ui.closeLyrics();
      else if (ui.queueOpen) ui.closeQueue();
      else ui.closePlayer();
      return true;
    });
    return () => subscription.remove();
  }, [open]);

  const pan = Gesture.Pan()
    .activeOffsetY(24)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(closePlayer)();
        return;
      }
      dragY.value = withSpring(0, springs.snappy);
    });

  const containerStyle = useAnimatedStyle(() => {
    // Dragging eats into the same progress the expansion uses, so a drag and
    // a dismissal are the same motion at different speeds.
    const dragProgress = Math.max(0, 1 - dragY.value / (DISMISS_DISTANCE * 2.5));
    const p = progress.value * dragProgress;
    return {
      opacity: interpolate(p, [0, 0.3, 1], [0, 1, 1]),
      transform: [
        { translateY: interpolate(p, [0, 1], [originOffset, 0]) },
        { scale: interpolate(p, [0, 1], [START_SCALE, 1]) },
      ],
      borderRadius: interpolate(p, [0, 1], [layout.dockRadius, 0]),
    };
  });

  if (!mounted) return null;

  return (
    <ImmersiveScope>
      <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
        {open && <StatusBar style="light" />}
        <Animated.View style={[styles.container, containerStyle]}>
          {/* The swipe-down covers the player face only. Wrapped around the
              panels too, it would turn every downward scroll of the queue
              into closing the player. */}
          <GestureDetector gesture={pan}>
            <View style={StyleSheet.absoluteFill}>
              <NowPlayingScreen />
            </View>
          </GestureDetector>
          <SlidePanel open={queueOpen} onClose={closeQueue} testID="panel-queue">
            <QueueScreen />
          </SlidePanel>
          <SlidePanel open={lyricsOpen} onClose={closeLyrics} testID="panel-lyrics">
            <LyricsScreen />
          </SlidePanel>
        </Animated.View>
      </View>
    </ImmersiveScope>
  );
}

/**
 * A panel that slides up over the player and is dragged down by its header
 * to dismiss. Mounted until its slide-out finishes, as the player is.
 */
function SlidePanel({
  open,
  onClose,
  children,
  testID,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
}) {
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(open);
  const offset = useSharedValue(height);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (open) {
      dragY.value = 0;
      offset.value = height;
      setMounted(true);
      offset.value = withSpring(0, springs.screen);
      return;
    }
    offset.value = withTiming(height, CLOSE, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
  }, [open, height, offset, dragY]);

  const pan = Gesture.Pan()
    .activeOffsetY(24)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(onClose)();
        return;
      }
      dragY.value = withSpring(0, springs.snappy);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value + dragY.value }],
  }));

  if (!mounted) return null;

  return (
    <PanelDragContext.Provider value={pan}>
      <Animated.View
        testID={testID}
        style={[StyleSheet.absoluteFill, style]}
        pointerEvents={open ? 'auto' : 'none'}
      >
        {children}
      </Animated.View>
    </PanelDragContext.Provider>
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
