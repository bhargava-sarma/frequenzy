import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';

import { hairline, layout, motion, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useThemedStyles } from '../theme/ThemeProvider';
import { Frosted } from './Frosted';

/**
 * Mode switch, in the uppercase label style.
 *
 * Spans the full width with its segments sharing it evenly, and carries the
 * dock's corner radius. Sized to its labels it sat as a small chip floating in
 * a wide row, which lined up with nothing; matching the dock's geometry makes
 * every control on a screen read as the same family of hardware.
 *
 * The selected segment carries the accent fill. On the original light palette
 * a dark panel fill did this job and left the accent free, but on a dark
 * ground the panel colors sit within a few percent of the floor and a selected
 * segment simply disappeared. Selection is listed as one of the accent's jobs
 * in the color tokens, so this spends it where it was always allowed.
 */
export interface SegmentedProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Which surface it sits on, so the border and labels contrast correctly. */
  surface?: 'paper' | 'panel';
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  surface = 'paper',
}: SegmentedProps<T>) {
  const styles = useThemedStyles(makeStyles);
  const onPanel = surface === 'panel';

  return (
    // Frosted rather than a flat tint: this is one of the floating surfaces,
    // and it sits directly over a scrolling list on the library screen.
    <Frosted surface="panel" style={[styles.root, onPanel && styles.rootPanel]}>
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
              pressed && !selected && styles.pressed,
            ]}
          >
            {/* The fill is a sibling rather than a background on the segment
                so it can transition between positions instead of cutting. */}
            {selected && (
              <Animated.View
                style={styles.fill}
                layout={LinearTransition.duration(motion.durationBase)}
              />
            )}
            <Text
              style={[
                styles.label,
                onPanel && styles.labelPanel,
                selected && styles.labelSelected,
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </Frosted>
  );
}

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      borderWidth: hairline,
      borderColor: color.paperLine,
      borderRadius: layout.dockRadius,
      // Clips the selected fill and the blur to the outer radius.
      overflow: 'hidden',
    },
    segment: {
      flex: 1,
      paddingHorizontal: space[3],
      paddingVertical: space[2],
      minHeight: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fill: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: color.accent,
    },
    rootPanel: { borderColor: color.panelLine },
    pressed: { opacity: 0.6 },
    label: { ...type.label, color: color.textSecondary },
    labelPanel: { color: color.textInverseSecondary },
    labelSelected: { color: color.accentInk },
  });
