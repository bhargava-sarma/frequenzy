import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

/**
 * A pressable that dims under the finger.
 *
 * The feedback is a change of state, not a movement: the control is drawn
 * dimmer — or, for full-width rows, highlighted — for exactly as long as it
 * is held, and nothing scales, springs or travels. It shows instantly and
 * costs nothing on either thread.
 */
export interface TouchableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** Opacity while held. Default 0.6. Ignored when `pressedStyle` is set. */
  pressedOpacity?: number;
  /** A style to apply while held instead of dimming, e.g. a row highlight. */
  pressedStyle?: StyleProp<ViewStyle>;
}

export function Touchable({ style, pressedOpacity = 0.6, pressedStyle, ...rest }: TouchableProps) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [style, pressed && (pressedStyle ?? { opacity: pressedOpacity })]}
    />
  );
}
