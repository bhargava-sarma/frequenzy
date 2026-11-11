import { useCallback, useEffect } from 'react';
import {
  Pressable,
  type GestureResponderEvent,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { usePressProgress } from '../theme/motion';

/**
 * A pressable that gives under the finger.
 *
 * Held, it sinks a few percent and dims; let go, it springs back. The whole
 * exchange is a transform and an opacity driven on the UI thread, so the
 * control answers the touch even while JavaScript is busy starting whatever
 * the press was for — which is exactly when feedback is most needed.
 *
 * Full-width rows don't use this: a row that shrinks reads as broken, so
 * they highlight instead (see ListRow).
 */
export interface TouchableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Opacity while held. Default 0.78. */
  pressedOpacity?: number;
  /** Scale while held. Default 0.97; pass 1 for controls that should only dim. */
  pressedScale?: number;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function Touchable({
  style,
  pressedOpacity = 0.78,
  pressedScale = 0.97,
  onPressIn,
  onPressOut,
  ...rest
}: TouchableProps) {
  const { pressed, down, up } = usePressProgress();

  // Disabled mid-press — a tile that goes busy as it is tapped — there is no
  // release event to spring back on.
  const disabled = Boolean(rest.disabled);
  useEffect(() => {
    if (disabled) up();
  }, [disabled, up]);

  const animated = useAnimatedStyle(() => ({
    opacity: 1 - pressed.value * (1 - pressedOpacity),
    transform: [{ scale: 1 - pressed.value * (1 - pressedScale) }],
  }));

  const handleIn = useCallback(
    (event: GestureResponderEvent) => {
      down();
      onPressIn?.(event);
    },
    [down, onPressIn],
  );
  const handleOut = useCallback(
    (event: GestureResponderEvent) => {
      up();
      onPressOut?.(event);
    },
    [up, onPressOut],
  );

  return <AnimatedPressable {...rest} onPressIn={handleIn} onPressOut={handleOut} style={[style, animated]} />;
}
