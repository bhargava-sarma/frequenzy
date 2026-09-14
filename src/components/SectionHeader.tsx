import { Pressable, StyleSheet, Text } from 'react-native';
import Animated from 'react-native-reanimated';

import { enter } from '../theme/motion';
import { layout, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Section header — a bold sentence-case title, with an optional count or
 * action on the right.
 *
 * Apple Music sets its sections as headlines ("Recently Played"), not as
 * tracked-out labels, and the redesign follows it: the title is how you find
 * your way down a long screen, so it has to read at a glance. The count stays
 * quiet beside it; when it is pressable it takes the accent, because then it
 * is a control rather than a fact.
 */
export interface SectionHeaderProps {
  title: string;
  /** Right-aligned count, e.g. "128 albums". */
  count?: string;
  surface?: 'paper' | 'panel';
  /** Makes the count a control — used where it reads as an action. */
  onCountPress?: () => void;
}

export function SectionHeader({
  title,
  count,
  surface = 'paper',
  onCountPress,
}: SectionHeaderProps) {
  const color = useTheme();
  const titleTone = surface === 'panel' ? color.textInverse : color.label;
  const countTone = surface === 'panel' ? color.textInverseSecondary : color.labelSecondary;

  return (
    // Rises in once on mount. Headers mount with their section, not per row,
    // so this never replays while a list scrolls.
    <Animated.View entering={enter.rise()} style={styles.root}>
      <Text style={[styles.title, { color: titleTone }]} numberOfLines={1}>
        {title}
      </Text>
      {count != null &&
        (onCountPress ? (
          <Pressable accessibilityRole="button" hitSlop={space[3]} onPress={onCountPress}>
            <Text style={[styles.count, { color: color.accent }]}>{count}</Text>
          </Pressable>
        ) : (
          <Text style={[styles.count, { color: countTone }]}>{count}</Text>
        ))}
    </Animated.View>
  );
}

// Static: every colour here is applied inline from the palette, so there is
// nothing for the themed-style cache to rebuild per theme.
const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space[3],
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[6],
    paddingBottom: space[3],
  },
  title: { ...type.title2, flexShrink: 1 },
  count: { ...type.subheadline },
});

