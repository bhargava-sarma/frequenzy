import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { withAlpha } from '../theme/tokens';

/**
 * A status LED: a lit dot with a soft halo.
 *
 * Connection state, playback, a running sleep timer. Its colour carries the
 * state — green settled, amber in between, red wrong — and it never blinks:
 * a light that pulses for as long as a state lasts is motion with nothing
 * new to say after the first second.
 */
export interface LedProps {
  color: string;
  size?: number;
  /** Unlit shows the colour dimmed, as an LED that's off but present. */
  on?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const Led = memo(function Led({ color, size = 7, on = true, style }: LedProps) {
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          opacity: on ? 1 : 0.28,
          boxShadow: on
            ? [{ offsetX: 0, offsetY: 0, blurRadius: size * 1.4, color: withAlpha(color, 0.7) }]
            : undefined,
        },
        style,
      ]}
    />
  );
});
