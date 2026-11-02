import { memo } from 'react';
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { IconComponent } from './icons';
import { Touchable } from './Touchable';
import { layout, radius, space, type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A small selectable key with a printed legend.
 *
 * Selected chips fill with the accent, the way a lit function key does.
 * Used for filters, scopes and the library's mode row — anything that's a
 * choice among a few, where a segmented control would run out of width.
 */
export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconComponent;
  /** Trailing figure, e.g. a count. */
  count?: number | string;
  /** Light-on-artwork styling, for chips over the player. */
  tone?: 'default' | 'onArtwork';
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}

export const Chip = memo(function Chip({
  label,
  selected = false,
  onPress,
  icon: Icon,
  count,
  tone = 'default',
  accessibilityLabel,
  style,
}: ChipProps) {
  const color = useTheme();
  const onArt = tone === 'onArtwork';

  // Solid in both tones: over artwork a chip is a dark key, not a tinted pane.
  const background = selected ? color.accent : color.surfaceRaised;
  const ink = selected ? color.accentInk : onArt ? color.onArtwork : color.label;
  const border = selected ? color.accent : onArt ? color.border : color.separator;

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={() => {
        haptics.tick();
        onPress?.();
      }}
      style={[styles.root, { backgroundColor: background, borderColor: border }, style]}
    >
      {Icon && <Icon size={14} color={ink} strokeWidth={2} />}
      <Text style={[type.labelBold, styles.label, { color: ink }]} numberOfLines={1}>
        {label}
      </Text>
      {count != null && (
        <Text style={[type.label, styles.count, { color: ink }]} numberOfLines={1}>
          {count}
        </Text>
      )}
    </Touchable>
  );
});

/** A horizontally scrolling row of chips, inset to the screen gutter. */
export function ChipRow({
  children,
  style,
  contentStyle,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={style}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.row, contentStyle]}
      >
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[1] + 2,
    height: layout.pillHeight,
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    borderWidth: 1,
  },
  label: { letterSpacing: 1 },
  count: { opacity: 0.7 },
  row: { paddingHorizontal: layout.screenPadding, gap: space[2], alignItems: 'center' },
});
