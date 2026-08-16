import React, { type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { layout, withAlpha } from '../theme/tokens';
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

/** How hard to blur. Enough to abstract the content, not to frost it opaque. */
const BLUR_INTENSITY = 40;

/** Tint over the blur, and the heavier tint used when there is no blur. */
const TINT_WITH_BLUR = layout.floatingOpacity;
const TINT_WITHOUT_BLUR = 0.94;

export interface FrostedProps {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Which palette surface tints the glass. */
  surface?: 'panel' | 'paper';
}

export function Frosted({ children, style, surface = 'panel' }: FrostedProps) {
  const color = useTheme();
  const { resolved } = useThemeControls();

  const base = surface === 'panel' ? color.panel : color.paper;

  if (!BlurView) {
    return (
      <View style={[style, { backgroundColor: withAlpha(base, TINT_WITHOUT_BLUR) }]}>
        {children}
      </View>
    );
  }

  return (
    <View style={style}>
      {/* The blur sits behind the tint rather than carrying it, so the tint
          colour stays a palette token instead of expo-blur's fixed presets. */}
      <BlurView
        intensity={BLUR_INTENSITY}
        tint={resolved === 'dark' ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(base, TINT_WITH_BLUR) }]}
      />
      {children}
    </View>
  );
}

/** Whether this build can actually blur. Surfaced for the settings screen. */
export const blurAvailable = HAS_NATIVE_BLUR;
