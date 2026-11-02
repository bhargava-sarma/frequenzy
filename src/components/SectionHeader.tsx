import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { IconArrowRight } from './icons';
import { layout, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A numbered section heading, the way a panel labels its modules:
 *
 *   01  Recently added                              ALL →
 *
 * The number is a quiet mono figure, the title is the thing you scan for,
 * and the action is printed in the accent because it is a control.
 */
export interface SectionHeaderProps {
  title: string;
  /** "01", "02"… or any short code. */
  index?: string;
  /** Right-aligned quiet text, e.g. a count. */
  detail?: string;
  /** Printed action on the right. */
  action?: string;
  onAction?: () => void;
  /** Tighter top spacing, for the first section under a header. */
  compact?: boolean;
  tone?: 'default' | 'onArtwork';
}

export const SectionHeader = memo(function SectionHeader({
  title,
  index,
  detail,
  action,
  onAction,
  compact = false,
  tone = 'default',
}: SectionHeaderProps) {
  const color = useTheme();
  const ink = tone === 'onArtwork' ? color.onArtwork : color.label;

  return (
    <View style={[styles.root, compact && styles.compact]}>
      {index != null && (
        <Text style={[type.labelBold, styles.index, { color: color.labelTertiary }]}>{index}</Text>
      )}
      <Text style={[type.title2, styles.title, { color: ink }]} numberOfLines={1}>
        {title}
      </Text>
      {detail != null && (
        <Text style={[type.label, { color: color.labelSecondary }]} numberOfLines={1}>
          {detail}
        </Text>
      )}
      {action != null && onAction && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${action} — ${title}`}
          hitSlop={12}
          onPress={() => {
            haptics.tick();
            onAction();
          }}
          style={({ pressed }) => [styles.action, pressed && styles.pressed]}
        >
          <Text style={[type.labelBold, { color: color.accent }]}>{action}</Text>
          <IconArrowRight size={13} color={color.accent} strokeWidth={2.25} />
        </Pressable>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[2] + 2,
    paddingHorizontal: layout.screenPadding,
    paddingTop: space[7],
    paddingBottom: space[3],
  },
  compact: { paddingTop: space[4] },
  index: { minWidth: 18 },
  title: { flex: 1 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  pressed: { opacity: 0.55 },
});
