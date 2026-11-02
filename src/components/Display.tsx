import { memo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import Svg, { Defs, LinearGradient, Pattern, Rect, Stop } from 'react-native-svg';

import { radius as radii, type, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { useSvgId } from '../utils/svgId';

/**
 * The display: a black screen set into the body.
 *
 * Same in every theme, the way a device's OLED is black whether the case is
 * silver or graphite. Faint scanlines give the glass something to be, and a
 * soft reflection across the top-left corner says there is a pane over it —
 * the liquid-glass half of the language meeting the retro half.
 *
 * Content inside reads with `displayInk`/`displayDim`; the DotText readout
 * is the dot-matrix voice of it.
 */
export interface DisplayProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /** Scanline overlay. Off for small insets where it reads as noise. */
  scanlines?: boolean;
  radius?: number;
}

export const Display = memo(function Display({
  children,
  style,
  scanlines = true,
  radius = radii.lg,
}: DisplayProps) {
  const color = useTheme();
  const linesId = useSvgId('lines');
  const glareId = useSvgId('glare');

  return (
    <View
      style={[
        styles.root,
        {
          borderRadius: radius,
          backgroundColor: color.display,
          borderColor: color.mode === 'light' ? '#1A1A1A' : '#262626',
        },
        style,
      ]}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          {scanlines && (
            <Pattern id={linesId} width={4} height={3} patternUnits="userSpaceOnUse">
              <Rect x={0} y={0} width={4} height={1} fill="#FFFFFF" fillOpacity={0.035} />
            </Pattern>
          )}
          <LinearGradient id={glareId} x1="0" y1="0" x2="0.75" y2="0.6">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.09} />
            <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity={0.02} />
            <Stop offset="0.46" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        {scanlines && <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${linesId})`} />}
        <Rect x={0} y={0} width="100%" height="100%" fill={`url(#${glareId})`} />
      </Svg>
      {children}
    </View>
  );
});

export interface DotTextProps extends Omit<TextProps, 'style'> {
  children: React.ReactNode;
  size?: number;
  color?: string;
  /** A soft halo, like light bleeding from lit pixels. */
  glow?: boolean;
  style?: StyleProp<TextStyle>;
}

/**
 * Dot-matrix figures. Latin and digits only — the face has nothing else, so
 * never set a track title in it.
 */
export function DotText({
  children,
  size = 24,
  color: tint,
  glow = true,
  style,
  numberOfLines = 1,
  ...rest
}: DotTextProps) {
  const color = useTheme();
  const ink = tint ?? color.displayInk;
  return (
    <Text
      {...rest}
      numberOfLines={numberOfLines}
      style={[
        type.dot,
        { fontSize: size, color: ink, lineHeight: Math.round(size * 1.15) },
        glow && {
          textShadowColor: withAlpha(ink, 0.55),
          textShadowRadius: Math.max(4, size * 0.3),
          textShadowOffset: { width: 0, height: 0 },
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    borderWidth: 1,
  },
});
