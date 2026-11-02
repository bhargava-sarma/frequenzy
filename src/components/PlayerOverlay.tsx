import { useEffect, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { PanelDragContext } from './PanelHandle';
import { NowPlayingScreen } from '../screens/NowPlayingScreen';
import { LyricsScreen } from '../screens/LyricsScreen';
import { QueueScreen } from '../screens/QueueScreen';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { useTimings } from '../theme/motion';
import { ImmersiveScope } from '../theme/ThemeProvider';

/**
 * The full player, sliding up over the app.
 *
 * Sits above the navigator rather than inside it: Android's stack detaches
 * the screen underneath a pushed screen, and nothing here unmounts the app,
 * so there is nothing to leave unpainted.
 *
 * One motion, in both directions: up from the bottom edge, and back down it
 * — the edge the dock is on, and the direction you drag to dismiss. It stays
 * mounted until it is off screen, and the hardware back button closes a
 * panel first, then the player, before navigation ever sees it.
 *
 * Everything inside is rendered against the immersive (dark) palette: over
 * artwork colour, light type is the only thing that reads in every case.
 */

const DISMISS_DISTANCE = 140;
const DISMISS_VELOCITY = 900;

export function PlayerOverlay() {
  const { height } = useWindowDimensions();
  const { enter, exit, fast } = useTimings();

  const open = usePlayerUiStore((state) => state.open);
  const closePlayer = usePlayerUiStore((state) => state.closePlayer);
  const queueOpen = usePlayerUiStore((state) => state.queueOpen);
  const closeQueue = usePlayerUiStore((state) => state.closeQueue);
  const lyricsOpen = usePlayerUiStore((state) => state.lyricsOpen);
  const closeLyrics = usePlayerUiStore((state) => state.closeLyrics);

  const [mounted, setMounted] = useState(open);
  const offset = useSharedValue(height);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (open) {
      dragY.value = 0;
      setMounted(true);
      offset.value = withTiming(0, enter);
      return;
    }
    // Leaves from wherever a drag left it, so a dismissal never jumps back up.
    offset.value = withTiming(height, exit, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
    // Durations are read when the player opens or closes, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, height, offset, dragY]);

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
        // Hand the drag over to the slide-out, so it continues from here.
        offset.value = offset.value + dragY.value;
        dragY.value = 0;
        runOnJS(closePlayer)();
        return;
      }
      dragY.value = withTiming(0, fast);
    });

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value + dragY.value }],
  }));

  if (!mounted) return null;

  return (
    <ImmersiveScope>
      <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
        {open && <StatusBar style="light" />}
        <Animated.View style={[StyleSheet.absoluteFill, containerStyle]}>
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
  const { enter, exit, fast } = useTimings();
  const [mounted, setMounted] = useState(open);
  const offset = useSharedValue(height);
  const dragY = useSharedValue(0);

  useEffect(() => {
    if (open) {
      dragY.value = 0;
      offset.value = height;
      setMounted(true);
      offset.value = withTiming(0, enter);
      return;
    }
    offset.value = withTiming(height, exit, (finished) => {
      if (finished) runOnJS(setMounted)(false);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, height, offset, dragY]);

  const pan = Gesture.Pan()
    .activeOffsetY(24)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        offset.value = offset.value + dragY.value;
        dragY.value = 0;
        runOnJS(onClose)();
        return;
      }
      dragY.value = withTiming(0, fast);
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
