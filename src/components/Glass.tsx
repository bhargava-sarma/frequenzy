import React, { useCallback, useState, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { blurNeedsTarget, realBlurSupported, useBlurTarget } from './BlurTarget';
import { useSvgId } from '../utils/svgId';
import {
  glass,
  glassBorderWidth,
  radius as radii,
  withAlpha,
  type GlassVariant,
} from '../theme/tokens';
import { useTheme, useThemeControls } from '../theme/ThemeProvider';

export type { GlassVariant };

/**
 * Liquid glass: a translucent surface with a specular sheen and a luminous rim.
 *
 * Layers, bottom to top:
 *   1. Real blur of what is behind — only when `blur` is set, the device can,
 *      and a blur target is reachable from here (see BlurTarget.tsx).
 *   2. Tint — the palette's glass colour at the material's alpha, scaled by
 *      the user's Tint setting. Strong enough on its own to keep content
 *      readable if the blur renders nothing.
 *   3. Sheen — a light gradient falling off from the top edge.
 *   4. Rim — a gradient stroke, bright along the top, faint along the bottom.
 *   5. Inner glow — a second, fainter line just inside the rim. It is what
 *      gives the pane a thickness: light catching the far edge of the glass
 *      as well as the near one.
 *   6. Optional soft shadow, drawn outside the shape so it never shows
 *      through the translucent fill.
 *
 * The sheen and rim share one SVG, sized to the surface. react-native-svg on
 * Android renders each Svg into a bitmap of its own size, so a glass surface
 * costs one surface-sized bitmap: fine for chrome, too much for dozens of
 * tiles. Use `lite` for anything rendered many times — it drops the SVG and
 * keeps a flat hairline rim.
 */

/**
 * Required lazily behind the availability check, like the target view: a
 * static import would resolve native view managers this binary may lack.
 */
const BlurView: React.ComponentType<{
  blurTarget?: React.RefObject<View | null>;
  blurMethod?: 'none' | 'dimezisBlurView' | 'dimezisBlurViewSdk31Plus';
  intensity?: number;
  blurReductionFactor?: number;
  tint?: 'light' | 'dark';
  style?: StyleProp<ViewStyle>;
}> | null = realBlurSupported
  ? // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('expo-blur').BlurView as never)
  : null;

/**
 * expo-blur on Android derives two things from `intensity`: the blur radius
 * (intensity / blurReductionFactor) and a grey overlay drawn over the blur
 * (alpha proportional to intensity). The overlay would sit on top of our own
 * tint and turn every surface the same flat grey, so intensity is pinned low
 * enough that the overlay is under 3%, and the radius is set through the
 * reduction factor instead.
 */
const ANDROID_OVERLAY_INTENSITY = 4;

/** Sheen fades out by this far down, however tall the surface. */
const SHEEN_DEPTH = 56;

/**
 * A surface that asked for blur but can't have it (older Android, a modal
 * window with no reachable target) floats over scrolling text. Unblurred,
 * even a few percent of that text reads through crisp, which looks like a
 * rendering fault rather than glass, so those surfaces go solid — what iOS
 * itself does under Reduce Transparency.
 */

function blurStrength(userIntensity: number, scale: number) {
  const strength = userIntensity * scale;
  if (Platform.OS === 'android') {
    // Matches what expo-blur's default reduction factor of 4 would produce
    // for the same setting, so the slider means what it always meant.
    const radiusPx = strength / 4;
    return {
      intensity: ANDROID_OVERLAY_INTENSITY,
      blurReductionFactor: ANDROID_OVERLAY_INTENSITY / radiusPx,
    };
  }
  return { intensity: Math.min(100, strength) };
}

export interface GlassProps extends Omit<ViewProps, 'style' | 'children'> {
  children?: ReactNode;
  /** Material. Default 'regular'. */
  variant?: GlassVariant;
  /**
   * Corner radius. Defaults to the `borderRadius` in `style`, else radius.lg.
   * Pass radius.full for pills — it is clamped to half the shortest side.
   */
  radius?: number;
  /** Outer style: size, margins, padding, flex layout of children. */
  style?: StyleProp<ViewStyle>;
  /**
   * Allow a real blur. Only for a few large chrome surfaces — dock, nav bar,
   * mini player, sheet. Degrades to fake glass automatically when there is no
   * reachable target, so it is safe to leave on for those surfaces.
   */
  blur?: boolean;
  /** Top specular gradient. Default true (ignored when `lite`). */
  sheen?: boolean;
  /** Luminous rim. Default true. */
  border?: boolean;
  /** Soft outside shadow, for floating surfaces. Default false. */
  shadow?: boolean;
  /** No SVG layers: flat hairline rim, no sheen. For repeated surfaces. */
  lite?: boolean;
  /** Overrides the tint colour (6-digit hex). */
  tintColor?: string;
  /** Overrides the tint alpha, ignoring the material and the Tint setting. */
  tintOpacity?: number;
}

export function Glass({
  children,
  variant = 'regular',
  radius,
  style,
  blur = false,
  sheen = true,
  border = true,
  shadow = false,
  lite = false,
  tintColor,
  tintOpacity,
  ...rest
}: GlassProps) {
  const color = useTheme();
  const { resolved, blurIntensity, surfaceOpacity } = useThemeControls();
  const material = glass[resolved][variant];
  const target = useBlurTarget();

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const drawsSvg = !lite && (sheen || border);

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!drawsSvg) return;
      const width = Math.round(event.nativeEvent.layout.width);
      const height = Math.round(event.nativeEvent.layout.height);
      setSize((current) =>
        current && current.width === width && current.height === height
          ? current
          : { width, height },
      );
    },
    [drawsSvg],
  );

  let cornerRadius = radius;
  if (cornerRadius == null) {
    const flat = StyleSheet.flatten(style);
    cornerRadius = typeof flat?.borderRadius === 'number' ? flat.borderRadius : radii.lg;
  }

  const realBlur =
    blur && BlurView != null && blurIntensity > 0 && (!blurNeedsTarget || target != null);

  // The Tint slider scales the material rather than replacing it, so the
  // designed default (0.75) lands exactly on the material's own alpha.
  const tintScale = 0.4 + 0.8 * surfaceOpacity;
  const alpha =
    tintOpacity ??
    (realBlur
      ? Math.min(0.98, material.blurTint * tintScale)
      : blur
        ? 1
        : Math.min(0.98, material.fakeTint * tintScale));
  const tint = withAlpha(tintColor ?? color[material.tintSource], alpha);

  const shadowStyle: ViewStyle | null = shadow
    ? {
        boxShadow: [
          {
            offsetX: 0,
            offsetY: 10,
            blurRadius: 30,
            spreadDistance: -4,
            color: withAlpha(color.shadow, material.shadow),
          },
        ],
      }
    : null;

  return (
    <View {...rest} style={[{ borderRadius: cornerRadius }, shadowStyle, style]}>
      <View
        pointerEvents="none"
        onLayout={drawsSvg ? onLayout : undefined}
        style={[
          StyleSheet.absoluteFill,
          styles.clip,
          { borderRadius: cornerRadius },
          // Without a blur underneath, the clip layer can carry the tint
          // itself and save a view.
          !realBlur && { backgroundColor: tint },
        ]}
      >
        {realBlur && BlurView && (
          <BlurView
            // expo-blur resolves its target once per ref object; remounting
            // on a new target is what lets the dock follow the focused tab.
            key={target?.id ?? 'behind'}
            blurTarget={target?.ref}
            blurMethod="dimezisBlurViewSdk31Plus"
            tint={resolved === 'dark' ? 'dark' : 'light'}
            {...blurStrength(blurIntensity, material.blurScale)}
            style={StyleSheet.absoluteFill}
          />
        )}
        {realBlur && <View style={[StyleSheet.absoluteFill, { backgroundColor: tint }]} />}

        {drawsSvg && size && size.width > 0 && size.height > 0 && (
          <GlassHighlights
            width={size.width}
            height={size.height}
            radius={cornerRadius}
            highlight={color.glassHighlight}
            edge={color.glassEdge}
            sheen={sheen ? material.sheen : 0}
            rimTop={border ? material.borderTop : 0}
            rimBottom={border ? material.borderBottom : 0}
            innerGlow={border ? material.innerGlow : 0}
          />
        )}

        {lite && border && (
          <View
            style={[
              StyleSheet.absoluteFill,
              {
                borderRadius: cornerRadius,
                borderWidth: 1,
                borderColor: withAlpha(color.glassHighlight, material.borderTop * 0.5),
                borderBottomColor: withAlpha(color.glassEdge, material.borderBottom),
              },
            ]}
          />
        )}
      </View>
      {children}
    </View>
  );
}

/**
 * Sheen and rim in one SVG. Memoised on plain values, so it only re-renders
 * when the surface is resized or the theme changes — not when the children
 * of the glass do.
 */
const GlassHighlights = React.memo(function GlassHighlights({
  width,
  height,
  radius,
  highlight,
  edge,
  sheen,
  rimTop,
  rimBottom,
  innerGlow,
}: {
  width: number;
  height: number;
  radius: number;
  highlight: string;
  edge: string;
  sheen: number;
  rimTop: number;
  rimBottom: number;
  innerGlow: number;
}) {
  const sheenId = useSvgId('sheen');
  const rimId = useSvgId('rim');
  const glowId = useSvgId('glow');
  const stroke = glassBorderWidth;
  const inset = stroke / 2;
  const rim = Math.max(0, Math.min(radius, width / 2, height / 2) - inset);
  const drawRim = rimTop > 0 || rimBottom > 0;
  // The inner line sits 1.5pt inside the rim, following the same curve.
  const glowInset = inset + 1.5;
  const glowRadius = Math.max(0, Math.min(radius, width / 2, height / 2) - glowInset);
  const drawGlow = innerGlow > 0 && width > 8 && height > 8;

  return (
    <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
      <Defs>
        {sheen > 0 && (
          <LinearGradient
            id={sheenId}
            x1="0"
            y1="0"
            x2="0"
            y2={Math.min(SHEEN_DEPTH, height)}
            gradientUnits="userSpaceOnUse"
          >
            <Stop offset="0" stopColor={highlight} stopOpacity={sheen} />
            <Stop offset="1" stopColor={highlight} stopOpacity={0} />
          </LinearGradient>
        )}
        {drawRim && (
          <LinearGradient id={rimId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={highlight} stopOpacity={rimTop} />
            <Stop offset="0.45" stopColor={highlight} stopOpacity={rimTop * 0.3} />
            <Stop offset="1" stopColor={edge} stopOpacity={rimBottom} />
          </LinearGradient>
        )}
        {drawGlow && (
          // Brightest at the bottom: light entering the top of the pane
          // catches its lower inside edge, the way it does on real glass.
          <LinearGradient id={glowId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={highlight} stopOpacity={innerGlow * 0.4} />
            <Stop offset="0.6" stopColor={highlight} stopOpacity={0} />
            <Stop offset="1" stopColor={highlight} stopOpacity={innerGlow} />
          </LinearGradient>
        )}
      </Defs>
      {sheen > 0 && <Rect x={0} y={0} width={width} height={height} fill={`url(#${sheenId})`} />}
      {drawRim && (
        <Rect
          x={inset}
          y={inset}
          width={Math.max(0, width - stroke)}
          height={Math.max(0, height - stroke)}
          rx={rim}
          ry={rim}
          fill="none"
          stroke={`url(#${rimId})`}
          strokeWidth={stroke}
        />
      )}
      {drawGlow && (
        <Rect
          x={glowInset}
          y={glowInset}
          width={Math.max(0, width - glowInset * 2)}
          height={Math.max(0, height - glowInset * 2)}
          rx={glowRadius}
          ry={glowRadius}
          fill="none"
          stroke={`url(#${glowId})`}
          strokeWidth={1}
        />
      )}
    </Svg>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
