import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A row of mode keys in a recessed well, the selected one raised — the
 * function-select strip of a hardware panel.
 *
 * Spans the full width with segments sharing it evenly. Selection moves
 * instantly: the raised key is simply drawn under whichever is chosen.
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

  return (
    <View style={[styles.root, size === 'sm' && styles.rootSmall, style]}>
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
              selected && styles.segmentSelected,
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
      borderWidth: 1,
      borderColor: color.separator,
      backgroundColor: color.surfaceSunken,
    },
    rootSmall: { height: 34 },
    segment: {
      flex: 1,
      margin: 3,
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
