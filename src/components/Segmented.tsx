import { useCallback, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useSelectionPosition } from '../theme/motion';
import { radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A row of mode keys in a recessed well, the selected one raised — the
 * function-select strip of a hardware panel.
 *
 * Spans the full width with segments sharing it evenly. One raised key sits
 * under the selection and slides to wherever it moves, so a change of mode
 * reads as the same key travelling rather than one going out and another
 * coming on. The slide is a transform on the UI thread; the legends above
 * it switch ink at once, so the choice registers before the key arrives.
 */
export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

/** Gap between the well's edge and the raised key. */
const INSET = 3;
const BORDER = 1;

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  style,
}: SegmentedProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const [width, setWidth] = useState(0);

  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value));
  const position = useSelectionPosition(selectedIndex);

  // Each segment's share of the well, inside its border.
  const slot = width > 0 ? (width - BORDER * 2) / options.length : 0;

  const keyStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value * slot }],
  }));

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(event.nativeEvent.layout.width);
  }, []);

  return (
    <View style={[styles.root, size === 'sm' && styles.rootSmall, style]} onLayout={onLayout}>
      {slot > 0 && (
        <Animated.View pointerEvents="none" style={[styles.key, { width: slot - INSET * 2 }, keyStyle]} />
      )}
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={option.label}
            onPress={() => {
              if (selected) return;
              haptics.tick();
              onChange(option.value);
            }}
            style={({ pressed }) => [
              styles.segment,
              // Until the well has been measured there is no key to slide,
              // so the selection is drawn in place for that first frame.
              selected && slot === 0 && styles.segmentSelected,
              pressed && !selected && styles.pressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]} numberOfLines={1}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      height: 40,
      borderRadius: radius.md,
      borderWidth: BORDER,
      borderColor: color.separator,
      backgroundColor: color.surfaceSunken,
    },
    rootSmall: { height: 34 },
    key: {
      position: 'absolute',
      top: INSET,
      bottom: INSET,
      left: INSET,
      borderRadius: radius.sm,
      borderWidth: 1,
      backgroundColor: color.surfaceRaised,
      borderColor: color.border,
    },
    segment: {
      flex: 1,
      margin: INSET,
      paddingHorizontal: space[2],
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: 'transparent',
    },
    segmentSelected: { backgroundColor: color.surfaceRaised, borderColor: color.border },
    pressed: { opacity: 0.6 },
    label: { ...type.labelBold, color: color.labelSecondary },
    labelSelected: { color: color.label },
  });
