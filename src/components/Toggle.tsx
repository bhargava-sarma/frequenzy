import { memo, useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { IconCheck } from './icons';
import { useMotion, usePressProgress } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A switch, Material 3's: a rounded track with a thumb that is small and
 * outlined while off, and grows into a full round thumb carrying a check as
 * it crosses to on. Held, the thumb swells; let go, it springs into place
 * on Material 3 Expressive's fast spatial spring while the colours follow on
 * the effects spring, which never bounces. The system's toggle haptic marks
 * the change.
 */
export interface ToggleProps {
  value: boolean;
  onChange: (value: boolean) => void;
  accessibilityLabel: string;
  disabled?: boolean;
}

const WIDTH = 52;
const HEIGHT = 32;
const BORDER = 2;
/** The thumb is drawn at its "on" size and scaled for the other states. */
const THUMB = 24;
const THUMB_OFF = 16;
const THUMB_PRESSED = 28;
/** Thumb centres, from the track's inner edge. */
const OFF_X = HEIGHT / 2 - BORDER - THUMB / 2;
const ON_X = WIDTH - HEIGHT / 2 - BORDER - THUMB / 2;

export const Toggle = memo(function Toggle({
  value,
  onChange,
  accessibilityLabel,
  disabled = false,
}: ToggleProps) {
  const color = useTheme();
  const { springs } = useMotion();
  const { pressed, down, up } = usePressProgress();

  // Position and colour run on separate springs: the thumb may overshoot,
  // the colours must not.
  const position = useSharedValue(value ? 1 : 0);
  const tint = useSharedValue(value ? 1 : 0);
  useEffect(() => {
    position.value = withSpring(value ? 1 : 0, springs.spatialFast);
    tint.value = withSpring(value ? 1 : 0, springs.effects);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, position, tint]);

  const off = color.labelTertiary;
  const track = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(tint.value, [0, 1], [color.surfaceSunken, color.accent]),
    borderColor: interpolateColor(tint.value, [0, 1], [off, color.accent]),
  }));

  const thumb = useAnimatedStyle(() => {
    const resting = THUMB_OFF + (THUMB - THUMB_OFF) * Math.min(1, Math.max(0, position.value));
    const size = resting + (THUMB_PRESSED - resting) * pressed.value;
    return {
      backgroundColor: interpolateColor(tint.value, [0, 1], [off, color.accentInk]),
      transform: [
        { translateX: OFF_X + (ON_X - OFF_X) * position.value },
        { scale: size / THUMB },
      ],
    };
  });

  const check = useAnimatedStyle(() => ({ opacity: tint.value }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      hitSlop={8}
      onPressIn={down}
      onPressOut={up}
      onPress={() => {
        haptics.toggle(!value);
        onChange(!value);
      }}
      style={disabled && styles.disabled}
    >
      <Animated.View style={[styles.track, track]}>
        <Animated.View style={[styles.thumb, thumb]}>
          <Animated.View style={check}>
            <IconCheck size={15} color={color.accent} strokeWidth={3} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  track: {
    width: WIDTH,
    height: HEIGHT,
    borderRadius: HEIGHT / 2,
    borderWidth: BORDER,
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    left: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.38 },
});
