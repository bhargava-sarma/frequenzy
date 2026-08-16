import { useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useIsFocused } from '@react-navigation/native';

import { useTheme, useThemeControls } from '../theme/ThemeProvider';

/**
 * Slow drifting wash in the current track's colour.
 *
 * The design spec excludes gradients and glow, and this is a deliberate
 * exception rather than an oversight — the ask was for the artwork's colour to
 * be present in the room. It is kept to the terms the rest of the design cares
 * about: no blur, no scale pulsing, nothing that moves fast enough to notice
 * while reading. Three soft discs at very low opacity, drifting over tens of
 * seconds, so it registers as the surface being tinted rather than as an
 * animation playing.
 *
 * Opacity is deliberately lower on the light palette. The same alpha that
 * reads as a whisper on true black reads as a stain on paper.
 *
 * All three blobs animate entirely on the UI thread through Reanimated, so a
 * busy JS thread never makes the background stutter.
 */

interface Blob {
  /** Fraction of screen width. */
  size: number;
  x: number;
  y: number;
  /** Seconds for one full there-and-back drift. */
  period: number;
  driftX: number;
  driftY: number;
}

const BLOBS: Blob[] = [
  { size: 1.1, x: -0.25, y: -0.1, period: 26, driftX: 0.18, driftY: 0.1 },
  { size: 0.9, x: 0.55, y: 0.25, period: 34, driftX: -0.14, driftY: 0.16 },
  { size: 1.0, x: 0.05, y: 0.6, period: 30, driftX: 0.12, driftY: -0.12 },
];

/**
 * Concentric rings per blob, standing in for a blur.
 *
 * React Native has no box-shadow spread or radial gradient to work with, and
 * a single flat circle at low alpha reads as exactly that — a coloured disc
 * with a visible edge. Stacking rings of decreasing size at the same alpha
 * accumulates toward the centre, which approximates a radial falloff closely
 * enough at this opacity that no edge is findable.
 */
const RINGS = 6;

export function AmbientBackground({ intensity = 1 }: { intensity?: number }) {
  const color = useTheme();
  const { resolved } = useThemeControls();
  const { width, height } = useWindowDimensions();
  /**
   * Tab screens stay mounted when you navigate away, so without this every
   * screen you have ever opened keeps three animations running on the UI
   * thread forever — for a wash nobody can see.
   */
  const focused = useIsFocused();

  // The same alpha that whispers on true black stains paper, so light mode
  // gets roughly a third of it.
  const scale = (resolved === 'dark' ? 1 : 0.35) * intensity;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {BLOBS.map((blob, index) => (
        <Drift
          key={index}
          blob={blob}
          width={width}
          height={height}
          color={color.accent}
          intensity={scale}
          active={focused}
        />
      ))}
    </View>
  );
}

function Drift({
  blob,
  width,
  height,
  color,
  intensity,
  active,
}: {
  blob: Blob;
  width: number;
  height: number;
  color: string;
  intensity: number;
  active: boolean;
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!active) {
      // Left where it stopped rather than reset: returning to a screen should
      // resume the drift, not snap it back to the start.
      cancelAnimation(progress);
      return;
    }

    // Linear rather than eased: an eased loop pauses at each end, which reads
    // as a pulse. A constant drift reads as nothing at all, which is the point.
    progress.value = withRepeat(
      withTiming(1, { duration: blob.period * 1000, easing: Easing.linear }),
      -1,
      true,
    );

    return () => cancelAnimation(progress);
  }, [active, blob.period, progress]);

  const size = width * blob.size;

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: progress.value * blob.driftX * width },
      { translateY: progress.value * blob.driftY * height },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.blob,
        { width: size, height: size, left: blob.x * width, top: blob.y * height },
        style,
      ]}
    >
      {Array.from({ length: RINGS }, (_, ring) => {
        const ringSize = size * (1 - ring / RINGS);
        return (
          <View
            key={ring}
            style={[
              styles.ring,
              {
                width: ringSize,
                height: ringSize,
                borderRadius: ringSize / 2,
                marginLeft: -ringSize / 2,
                marginTop: -ringSize / 2,
                backgroundColor: color,
                opacity: 0.035 * intensity,
              },
            ]}
          />
        );
      })}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  blob: { position: 'absolute' },
  // All rings share one centre, so they stack rather than tile.
  ring: { position: 'absolute', left: '50%', top: '50%' },
});
