import { type ReactNode } from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { motion } from '../theme/tokens';

/**
 * A modal screen you can drag down to dismiss.
 *
 * The native stack offers no swipe-to-dismiss for modals on Android, so every
 * sheet in this app could only be closed by its own chevron. This moves the
 * whole screen with the finger and hands back to the navigator once it has
 * travelled far enough — the gesture people already expect from a sheet.
 *
 * Dragging up does nothing rather than lifting the screen off its own top
 * edge, and horizontal movement fails the gesture so lists and rows inside
 * keep their own swipes.
 */

/** How far the sheet must travel before releasing dismisses it. */
const DISMISS_DISTANCE = 120;
/** ...or how fast it must be moving, for a flick. */
const DISMISS_VELOCITY = 800;

export interface DismissibleSheetProps {
  onDismiss: () => void;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function DismissibleSheet({ onDismiss, children, style }: DismissibleSheetProps) {
  const dragY = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetY(24)
    .failOffsetX([-20, 20])
    .onUpdate((event) => {
      dragY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      // Either far enough or fast enough — a quick flick should not have to
      // cover the same distance as a slow drag.
      if (dragY.value > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        /**
         * Snap back to rest *before* leaving, and let the navigator play its
         * own slide-down from there.
         *
         * Leaving the sheet translated meant the screen stayed pushed down
         * while the navigator dismissed it, showing the empty ground above it
         * as a black band — and the offset was still applied the next time the
         * screen mounted. Handing a screen back in the position the navigator
         * expects avoids both.
         */
        dragY.value = 0;
        runOnJS(onDismiss)();
        return;
      }
      dragY.value = withTiming(0, {
        duration: motion.durationBase,
        easing: Easing.bezier(...motion.easing),
      });
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[style, sheetStyle]}>{children}</Animated.View>
    </GestureDetector>
  );
}
