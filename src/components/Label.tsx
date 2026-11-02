import { Text, type StyleProp, type TextProps, type TextStyle } from 'react-native';

import { type } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';

/**
 * A hardware label: monospaced, uppercase, tracked out.
 *
 * Used for everything that names rather than says — section numbers, spec
 * plates, key legends, counts. Words people read (titles, artists) stay in
 * the grotesk; this is the type you'd find screen-printed on a panel.
 */
export type LabelTone =
  | 'primary'
  | 'secondary'
  | 'tertiary'
  | 'accent'
  | 'display'
  | 'displayDim'
  | 'onArtwork'
  | 'destructive';

export interface LabelProps extends Omit<TextProps, 'style'> {
  children: React.ReactNode;
  tone?: LabelTone;
  /** Overrides the tone with an explicit colour. */
  color?: string;
  bold?: boolean;
  /** Point size. Default 10.5. */
  size?: number;
  style?: StyleProp<TextStyle>;
}

export function Label({
  children,
  tone = 'secondary',
  color,
  bold = false,
  size,
  style,
  numberOfLines = 1,
  ...rest
}: LabelProps) {
  const palette = useTheme();
  const tones: Record<LabelTone, string> = {
    primary: palette.label,
    secondary: palette.labelSecondary,
    tertiary: palette.labelTertiary,
    accent: palette.accent,
    display: palette.displayInk,
    displayDim: palette.displayDim,
    onArtwork: palette.onArtwork,
    destructive: palette.destructive,
  };

  return (
    <Text
      {...rest}
      numberOfLines={numberOfLines}
      style={[
        bold ? type.labelBold : type.label,
        size != null && { fontSize: size },
        { color: color ?? tones[tone] },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
