import React, { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { withAlpha } from '../theme/tokens';
import { useTheme, useThemeControls } from '../theme/ThemeProvider';

/**
 * A translucent surface — blurred where the platform can, tinted where it can't.
 *
 * expo-blur is a native module, so it only exists in a binary built after it
 * was added. Reloading JS against an older build would otherwise render an
 * unimplemented native view where the dock should be, so this asks the module
 * registry at runtime and falls back to a heavier tint when the answer is no.
 * That keeps a JS-only reload working and lets the blur appear by itself once
 * a new build is installed, with no code change.
 *
 * The fallback is deliberately more opaque than the blurred version. Blur
 * separates a surface from what is behind it; without it, only opacity can do
 * that job, and 75% over a moving list reads as a rendering fault rather than
 * as glass.
 */

/**
 * Resolved once at module load. The native module cannot appear or disappear
 * during a session — only a new binary changes the answer.
 */
const HAS_NATIVE_BLUR = requireOptionalNativeModule('ExpoBlur') != null;

/**
 * Required lazily, and only when the native side is actually present.
 *
 * expo-blur resolves its native view manager at import time, so a static
 * import would reach for a component this binary may not have. Requiring it
 * behind the check means a build without blur never loads the module at all.
 */
const BlurView: React.ComponentType<{
  intensity?: number;
  tint?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}> | null = HAS_NATIVE_BLUR
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-blur').BlurView as never)
  : null;

/**
 * How much extra tint a surface takes when it can't blur.
 *
 * Blur is what separates a floating surface from what passes behind it.
 * Without it only opacity can do that job, so an unblurred surface is pushed
 * most of the way to solid rather than left at the user's setting, where it
 * reads as a rendering fault rather than as glass.
 */
const OPAQUE_FALLBACK = 0.94;

export interface FrostedProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Which palette surface tints the glass. */
  surface?: 'panel' | 'paper';
}

export function Frosted({ children, style, surface = 'panel' }: FrostedProps) {
  const color = useTheme();
  const { resolved, blurIntensity, surfaceOpacity } = useThemeControls();

  const base = surface === 'panel' ? color.panel : color.paper;
  const blurring = BlurView != null && blurIntensity > 0;

  if (!blurring) {
    return (
      <View
        style={[style, { backgroundColor: withAlpha(base, Math.max(surfaceOpacity, OPAQUE_FALLBACK)) }]}
      >
        {children}
      </View>
    );
  }

  return (
    <View style={style}>
      {/* The blur sits behind the tint rather than carrying it, so the tint
          colour stays a palette token instead of expo-blur's fixed presets. */}
      <BlurView
        intensity={blurIntensity}
        tint={resolved === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(base, surfaceOpacity) }]}
      />
      {children}
    </View>
  );
}

/** Whether this build can actually blur. Surfaced for the settings screen. */
export const blurAvailable = HAS_NATIVE_BLUR;
