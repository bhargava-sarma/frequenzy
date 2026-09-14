import { Pressable, StyleSheet, Text } from 'react-native';

import { Glass } from './Glass';
import { SlidingPill } from './SlidingPill';
import { layout, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';

/**
 * Mode switch: a glass capsule with a pill that slides to the selection.
 *
 * Spans the full width with its segments sharing it evenly. The pill is the
 * only moving part and it springs, stretching as it travels, so switching
 * reads as one continuous gesture rather than a highlight jumping between
 * boxes.
 */
export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Which surface it sits on. Kept for existing call sites; glass reads the
   * same over either, so it no longer changes the rendering.
   */
  surface?: 'paper' | 'panel';
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const selectedIndex = options.findIndex((option) => option.value === value);

  return (
    <Glass variant="thin" blur radius={radius.full} style={styles.root}>
      <SlidingPill index={selectedIndex} count={options.length} />
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [styles.segment, pressed && !selected && styles.pressed]}
          >
            <Text
              style={[styles.label, selected && styles.labelSelected]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </Glass>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      minHeight: layout.pillHeight + 6,
    },
    segment: {
      flex: 1,
      paddingHorizontal: space[3],
      alignItems: 'center',
      justifyContent: 'center',
    },
    pressed: { opacity: 0.6 },
    label: { ...type.callout, color: color.labelSecondary },
    labelSelected: { color: color.label },
  });
