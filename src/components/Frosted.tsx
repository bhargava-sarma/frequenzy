import { type ReactNode } from 'react';
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';

import { Glass } from './Glass';
import { realBlurSupported } from './BlurTarget';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The previous glass surface, now a thin wrapper over Glass.
 *
 * Kept so existing call sites — the dock, the search field, the segmented
 * control, the current lyric line — keep working unchanged until they are
 * restyled onto Glass directly. It always asks for real blur: whether that
 * happens is decided by where the surface sits (see BlurTarget.tsx), and a
 * surface inside blurrable content simply fakes it.
 */

export interface FrostedProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Which palette surface tints the glass. */
  surface?: 'panel' | 'paper';
  /**
   * Overrides the tint colour and its strength.
   *
   * Surfaces take the palette and the user's Tint setting, which is right for
   * the app's own chrome. A highlight is not: it has to read as a highlight
   * at a strength of its own, independent of how transparent the chrome is.
   */
  tintColor?: string;
  tintOpacity?: number;
}

export function Frosted({
  children,
  style,
  surface = 'panel',
  tintColor,
  tintOpacity,
}: FrostedProps) {
  const color = useTheme();

  // Frosted never rounded anything its caller didn't, so the radius comes
  // from the style rather than Glass's default.
  const flat = StyleSheet.flatten(style);
  const cornerRadius = typeof flat?.borderRadius === 'number' ? flat.borderRadius : 0;

  return (
    <Glass
      variant="regular"
      blur
      radius={cornerRadius}
      style={style}
      tintColor={tintColor ?? (surface === 'paper' ? color.paper : undefined)}
      tintOpacity={tintOpacity}
    >
      {children}
    </Glass>
  );
}

/**
 * Whether this build and device can actually blur. Surfaced for the settings
 * screen. False on Android below 12, where glass is always tinted.
 */
export const blurAvailable = realBlurSupported;
