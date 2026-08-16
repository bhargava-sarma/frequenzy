import { Pressable, StyleSheet, Text, View } from 'react-native';

import { layout, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Section header, per spec 5.2 — label left, count right.
 *
 * Uppercase with wide tracking is the single strongest "panel" signal in this
 * design, so the transform lives in the `label` token rather than being left
 * to each caller to remember. Pass sentence-case text; it renders uppercase.
 *
 * The count is deliberately terse — "128 ALBUMS", not "128 albums total".
 */
export interface SectionHeaderProps {
  title: string;
  /** Right-aligned count, e.g. "128 albums". Rendered uppercase. */
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
  const tone = surface === 'panel' ? color.textInverseSecondary : color.textSecondary;

  return (
    <View style={styles.root}>
      <Text style={[styles.label, { color: tone }]}>{title}</Text>
      {count != null &&
        (onCountPress ? (
          <Pressable accessibilityRole="button" hitSlop={space[3]} onPress={onCountPress}>
            <Text style={[styles.label, { color: tone }]}>{count}</Text>
          </Pressable>
        ) : (
          <Text style={[styles.label, { color: tone }]}>{count}</Text>
        ))}
    </View>
  );
}

// Static: every colour here is applied inline from the palette, so there is
// nothing for the themed-style cache to rebuild per theme.
const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[5],
    paddingBottom: space[3],
  },
  label: { ...type.label },
});
