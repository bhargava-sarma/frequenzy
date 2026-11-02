import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';

import { useToggleProgress } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A slide switch, the hardware kind: a rectangular well and a gripped knob
 * that travels across it, with the well lighting up when it's on.
 */
export interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

const WIDTH = 50;
const HEIGHT = 30;
const KNOB = 24;
const PAD = (HEIGHT - KNOB) / 2;

export const Toggle = memo(function Toggle({
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: ToggleProps) {
  const color = useTheme();
  const on = useToggleProgress(value);

  const well = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [color.surfaceSunken, color.accent]),
    borderColor: interpolateColor(on.value, [0, 1], [color.border, color.accent]),
  }));

  const knob = useAnimatedStyle(() => ({
    transform: [{ translateX: on.value * (WIDTH - KNOB - PAD * 2 - 2) }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={() => {
        haptics.tick();
        onChange(!value);
      }}
      style={disabled && styles.disabled}
    >
      <Animated.View style={[styles.well, well]}>
        <Animated.View
          style={[
            styles.knob,
            { backgroundColor: color.surfaceRaised, borderColor: color.border },
            knob,
          ]}
        >
          {/* Grip ridges, so the knob reads as something to push. */}
          <View style={[styles.ridge, { backgroundColor: color.labelTertiary }]} />
          <View style={[styles.ridge, { backgroundColor: color.labelTertiary }]} />
          <View style={[styles.ridge, { backgroundColor: color.labelTertiary }]} />
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  well: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: 9,
    borderWidth: 1,
    padding: PAD,
    justifyContent: 'center',
  },
  knob: {
    width: KNOB,
    height: KNOB - 2,
    borderRadius: 6,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2.5,
  },
  ridge: { width: 1.5, height: 9, borderRadius: 1 },
  disabled: { opacity: 0.4 },
});
