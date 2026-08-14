import { Pressable, StyleSheet, Text, View } from 'react-native';

import { color, hairline, radius, space, type } from '../theme/tokens';

/**
 * Two-or-three-way mode switch, in the uppercase label style.
 *
 * The selected segment takes the dark panel fill rather than the accent. The
 * accent is reserved for meaning — what's playing, what's favourited — and
 * spending it on "which list am I looking at" would dilute it on a screen
 * that already tints the active row. A panel-filled segment on paper also
 * reads as a physical toggle, which is the language the rest of this design
 * is speaking.
 */
export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.root}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected && styles.pressed,
            ]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderWidth: hairline,
    borderColor: color.paperLine,
    borderRadius: radius.sm,
    // Clips the selected fill to the outer radius so the corners stay tight.
    overflow: 'hidden',
  },
  segment: {
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    minHeight: 36,
    justifyContent: 'center',
  },
  segmentSelected: { backgroundColor: color.panel },
  pressed: { opacity: 0.6 },
  label: { ...type.label, color: color.textSecondary },
  labelSelected: { color: color.textInverse },
});
