import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { IconComponent } from './icons';
import { Touchable } from './Touchable';
import { icon as iconTokens, space } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A round button carrying one glyph.
 *
 * `surface` (default) is a solid raised disc — it reads over a list, a
 * cover or the player's colour alike. `plain` is a bare glyph that only
 * needs a hit area, `accent` the one button that matters on a screen.
 */
export interface IconButtonProps {
  icon: IconComponent;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  variant?: 'surface' | 'plain' | 'accent';
  size?: number;
  iconSize?: number;
  /** Glyph colour override. */
  color?: string;
  /** Lights the glyph in the accent — for toggles like shuffle. */
  active?: boolean;
  /** A small status dot in the corner. */
  badge?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const IconButton = memo(function IconButton({
  icon: Icon,
  onPress,
  onLongPress,
  accessibilityLabel,
  variant = 'surface',
  size = 40,
  iconSize,
  color: colorOverride,
  active = false,
  badge = false,
  disabled = false,
  style,
}: IconButtonProps) {
  const color = useTheme();
  const glyph =
    colorOverride ??
    (variant === 'accent' ? color.accentInk : active ? color.accent : color.label);

  return (
    <Touchable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled, selected: active }}
      disabled={disabled}
      hitSlop={size < 40 ? space[2] : space[1]}
      onPress={() => {
        haptics.tick();
        onPress?.();
      }}
      onLongPress={onLongPress}
      style={[
        styles.root,
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.35 : 1 },
        variant === 'surface' && {
          backgroundColor: color.surfaceRaised,
          borderWidth: 1,
          borderColor: color.border,
        },
        variant === 'accent' && { backgroundColor: color.accent },
        style,
      ]}
    >
      <Icon
        size={iconSize ?? Math.round(size * 0.5)}
        color={glyph}
        strokeWidth={iconTokens.strokeWidth + 0.25}
      />
      {badge && <View style={[styles.badge, { backgroundColor: color.accent }]} />}
    </Touchable>
  );
});

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center' },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
});
