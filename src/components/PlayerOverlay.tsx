import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { BackHandler, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { StatusBar } from 'expo-status-bar';

import { PanelDragContext } from './PanelHandle';
import { NowPlayingScreen } from '../screens/NowPlayingScreen';
import { LyricsScreen } from '../screens/LyricsScreen';
import { QueueScreen } from '../screens/QueueScreen';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { useMotion } from '../theme/motion';
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

/**
 * A surface that rises from the bottom edge and leaves by it.
 *
 * The rise starts from the surface's first layout, not from the moment it
 * was asked for. Mounting the player — or a queue of gesture-wrapped rows —
 * takes the JS thread a few frames, and a slide started alongside that work
 * had already run most of its course before there was anything on screen to
 * move: the surface appeared part-way up, or simply popped in. Waiting for
 * layout means every frame of the slide has the finished surface in it.
 */
function useRisingSurface(open: boolean, onDismiss: () => void) {
  const { height } = useWindowDimensions();
  const { timings, springs } = useMotion();

  const [mounted, setMounted] = useState(open);
  const offset = useSharedValue(height);
  const dragY = useSharedValue(0);
  /** Whether the mounted surface has been laid out, and so can be animated. */
  const laidOut = useRef(false);
  const wantOpen = useRef(open);
  wantOpen.current = open;

  const unmount = useCallback(() => {
    // Reopened while it was leaving: it is on its way back up, not gone.
    if (wantOpen.current) return;
    laidOut.current = false;
    setMounted(false);
  }, []);

  useEffect(() => {
    if (open) {
      dragY.value = 0;
      // Still mounted from a close that hadn't finished: turn it around.
      if (laidOut.current) offset.value = withTiming(0, timings.enter);
      else {
        offset.value = height;
        setMounted(true);
      }
      return;
    }
    // Leaves from wherever a drag left it, so a dismissal never jumps back up.
    offset.value = withTiming(height, timings.exit, (finished) => {
      if (finished) runOnJS(unmount)();
    });
    // Durations are read when the surface opens or closes, not tracked.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, height, offset, dragY]);

  const onLayout = useCallback(() => {
    if (laidOut.current) return;
    laidOut.current = true;
    if (wantOpen.current) offset.value = withTiming(0, timings.enter);
  }, [offset, timings]);

  const pan = Gesture.Pan()
    .activeOffsetY(24)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event, success) => {
      // A gesture the system took back is not a decision to close.
      if (success && (dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY)) {
        // Hand the drag over to the slide-out, so it continues from here.
        offset.value = offset.value + dragY.value;
        dragY.value = 0;
        runOnJS(onDismiss)();
        return;
      }
      dragY.value = withSpring(0, springs.settle);
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value + dragY.value }],
  }));

  return { mounted, style, pan, onLayout, offset, dragY, height };
}

export function PlayerOverlay() {
  const open = usePlayerUiStore((state) => state.open);
  const closePlayer = usePlayerUiStore((state) => state.closePlayer);
  const queueOpen = usePlayerUiStore((state) => state.queueOpen);
  const closeQueue = usePlayerUiStore((state) => state.closeQueue);
  const lyricsOpen = usePlayerUiStore((state) => state.lyricsOpen);
  const closeLyrics = usePlayerUiStore((state) => state.closeLyrics);

  const surface = useRisingSurface(open, closePlayer);

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

  if (!surface.mounted) return null;

  return (
    <ImmersiveScope>
      <View style={StyleSheet.absoluteFill} pointerEvents={open ? 'box-none' : 'none'}>
        {open && <StatusBar style="light" />}
        <Scrim offset={surface.offset} dragY={surface.dragY} height={surface.height} />
        <Animated.View style={[StyleSheet.absoluteFill, surface.style]} onLayout={surface.onLayout}>
          {/* The swipe-down covers the player face only. Wrapped around the
              panels too, it would turn every downward scroll of the queue
              into closing the player. */}
          <GestureDetector gesture={surface.pan}>
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
 * Darkens the app as the player comes up over it, and lets it back through
 * as the player is dragged away — so what is underneath reads as set back,
 * not as a second screen sliding past.
 */
function Scrim({
  offset,
  dragY,
  height,
}: {
  offset: SharedValue<number>;
  dragY: SharedValue<number>;
  height: number;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: interpolate(offset.value + dragY.value, [0, height], [0.5, 0], Extrapolation.CLAMP),
  }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.scrim, style]} />;
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
  const surface = useRisingSurface(open, onClose);

  if (!surface.mounted) return null;

  return (
    <PanelDragContext.Provider value={surface.pan}>
      <Animated.View
        testID={testID}
        style={[StyleSheet.absoluteFill, surface.style]}
        pointerEvents={open ? 'auto' : 'none'}
        onLayout={surface.onLayout}
      >
        {children}
      </Animated.View>
    </PanelDragContext.Provider>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: '#000000' },
});
