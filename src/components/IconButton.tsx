import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from './Glass';
import type { IconComponent } from './icons';
import { PressScale } from './Pressable';
import { icon as iconTokens, space } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';

/**
 * A round button carrying one glyph.
 *
 * `glass` for chrome over moving content (nav bars, the player header),
 * `surface` for buttons on panels, `plain` for a bare glyph that only needs
 * a hit area, `accent` for the one that matters on a screen.
 */
export interface IconButtonProps {
  icon: IconComponent;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
  variant?: 'glass' | 'surface' | 'plain' | 'accent';
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
  variant = 'glass',
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
    <PressScale
      noOrigin
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
      scaleTo={0.88}
      style={[
        styles.root,
        { width: size, height: size, borderRadius: size / 2, opacity: disabled ? 0.35 : 1 },
        variant === 'surface' && {
          backgroundColor: color.surfaceRaised,
          borderWidth: 1,
          borderColor: color.separator,
        },
        variant === 'accent' && { backgroundColor: color.accent },
        style,
      ]}
    >
      {variant === 'glass' && (
        <Glass variant="thin" lite radius={size / 2} style={StyleSheet.absoluteFill} />
      )}
      <Icon
        size={iconSize ?? Math.round(size * 0.5)}
        color={glyph}
        strokeWidth={iconTokens.strokeWidth + 0.25}
      />
      {badge && <View style={[styles.badge, { backgroundColor: color.accent }]} />}
    </PressScale>
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
