import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { hairline, radius, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Buttons, per spec 5.5.
 *
 * Only two variants exist, and that constraint is the point: primary is an
 * accent fill, secondary is an outline with no fill. There is no tertiary or
 * "danger" variant, because a second hue is explicitly excluded from this
 * design — states that need distinguishing use grayscale weight instead.
 *
 * Rectangular buttons take `radius.sm`. `radius.full` is reserved for
 * genuinely circular controls (see TransportControls), never for pills.
 */

export type ButtonVariant = 'primary' | 'secondary';
export type ButtonSurface = 'paper' | 'panel';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** Which surface the button sits on — decides the outline and text color. */
  surface?: ButtonSurface;
  disabled?: boolean;
  busy?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  label,
  onPress,
  variant = 'secondary',
  surface = 'paper',
  disabled = false,
  busy = false,
  fullWidth = false,
  style,
}: ButtonProps) {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const isPrimary = variant === 'primary';
  const inert = disabled || busy;

  const textColor = isPrimary
    ? color.accentInk
    : surface === 'panel'
      ? color.textInverse
      : color.textPrimary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inert, busy }}
      onPress={onPress}
      disabled={inert}
      style={({ pressed }) => [
        styles.base,
        isPrimary ? styles.primary : surface === 'panel' ? styles.outlinePanel : styles.outlinePaper,
        fullWidth && styles.fullWidth,
        inert && (isPrimary ? styles.primaryInert : styles.outlineInert),
        // Opacity rather than a color shift: the palette has no "pressed"
        // token, and inventing one would mean a value the spec doesn't define.
        pressed && !inert && styles.pressed,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * Lays buttons out in a row with the spec's standard gap. Exists so callers
 * don't re-derive the spacing every time two buttons sit together.
 */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.row}>{children}</View>;
}

const makeStyles = (color: Palette) => StyleSheet.create({
  base: {
    height: 48,
    minWidth: 96,
    paddingHorizontal: space[4],
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { alignSelf: 'stretch' },

  primary: { backgroundColor: color.accent },
  primaryInert: { backgroundColor: color.paperDim },

  outlinePaper: {
    borderWidth: hairline,
    borderColor: color.paperLine,
    backgroundColor: 'transparent',
  },
  outlinePanel: {
    borderWidth: hairline,
    borderColor: color.panelLine,
    backgroundColor: 'transparent',
  },
  outlineInert: { opacity: 0.4 },

  pressed: { opacity: 0.7 },
  label: { ...type.body },

  row: { flexDirection: 'row', gap: space[3] },
});
