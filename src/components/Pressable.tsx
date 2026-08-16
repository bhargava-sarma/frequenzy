import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
 */

const TIMING = {
  duration: motion.durationFast,
  easing: Easing.bezier(...motion.easing),
};

export interface PressScaleProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Override the depth, e.g. for a large tile that should move less. */
  scaleTo?: number;
}

export function PressScale({ style, scaleTo = motion.pressScale, ...rest }: PressScaleProps) {
  const scale = useSharedValue(1);

  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(event) => {
        scale.value = withTiming(scaleTo, TIMING);
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
