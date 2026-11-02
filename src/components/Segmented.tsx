import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { SlidingPill } from './SlidingPill';
import { radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A row of mode keys in a recessed well, with a raised key that slides to
 * the selection — the function-select strip of a hardware panel.
 *
 * Spans the full width with segments sharing it evenly. The pill springs and
 * stretches as it travels, so switching reads as one movement.
 */
export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  style?: StyleProp<ViewStyle>;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
  style,
}: SegmentedProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const selectedIndex = options.findIndex((option) => option.value === value);

  return (
    <View style={[styles.root, size === 'sm' && styles.rootSmall, style]}>
      <SlidingPill index={selectedIndex} count={options.length} inset={3} radius={radius.sm} />
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
            style={({ pressed }) => [styles.segment, pressed && !selected && styles.pressed]}
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
      borderWidth: 1,
      borderColor: color.separator,
      backgroundColor: color.surfaceSunken,
    },
    rootSmall: { height: 34 },
    segment: {
      flex: 1,
      paddingHorizontal: space[2],
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.6 },
    label: { ...type.labelBold, color: color.labelSecondary },
    labelSelected: { color: color.label },
  });
