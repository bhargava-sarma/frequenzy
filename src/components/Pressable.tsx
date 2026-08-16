import { useRef } from 'react';
import { Pressable, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTransitionStore } from '../store/useTransitionStore';
import { motion } from '../theme/tokens';

/**
 * A pressable that sinks slightly under the finger.
 *
 * Opacity alone was carrying every press in this app, which reads as the
 * screen dimming rather than as something being pressed. A small scale is what
 * makes a control feel like it has depth, and at 70ms it lands before you have
 * finished pressing rather than trailing behind you.
 *
 * The scale runs on the UI thread, so it stays responsive while the JS thread
 * is busy handling whatever the press actually triggered — which is precisely
 * when press feedback matters most.
 *
 * `withTiming`, not `withSpring`: the spec rules out overshoot, and a control
 * that wobbles back reads as jelly rather than as a key travelling.
 *
 * It also records where it was when pressed. Any screen opened right
 * afterwards grows out of that spot — see ExpandFrom. Doing it here rather
 * than at each call site means every row and tile in the app gets the
 * transition without knowing anything about it, and a press that opens
 * nothing simply leaves a record that expires unused.
 */

const TIMING = {
  duration: motion.durationFast,
  easing: Easing.bezier(...motion.easing),
};

export interface PressScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Override the depth, e.g. for a large tile that should move less. */
  scaleTo?: number;
  /**
   * Skip recording the press position. For controls that act in place — a
   * play button, a favourite toggle — where there is no screen to grow.
   */
  noOrigin?: boolean;
}

export function PressScale({
  style,
  scaleTo = motion.pressScale,
  noOrigin = false,
  ...rest
}: PressScaleProps) {
  const scale = useSharedValue(1);
  const ref = useRef<View>(null);
  const recordOrigin = useTransitionStore((state) => state.recordOrigin);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      ref={ref}
      onPressIn={(event) => {
        scale.value = withTiming(scaleTo, TIMING);

        // Measured on press-in rather than press: by the time onPress fires
        // the navigation may already be underway, and measureInWindow is
        // asynchronous. Window coordinates, since the screen that reads this
        // knows nothing about the layout that produced it.
        if (!noOrigin) {
          ref.current?.measureInWindow((x, y, width, height) =>
            recordOrigin({ x, y, width, height }),
          );
        }

        rest.onPressIn?.(event);
      }}
      onPressOut={(event) => {
        scale.value = withTiming(1, TIMING);
        rest.onPressOut?.(event);
      }}
      style={[style, animated]}
    />
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
