import { memo } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { interpolateColor, useAnimatedStyle } from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { type ArtworkPalette } from '../theme/tokens';
import {
  useArtworkPalette,
  useMeshLayers,
  useThemeControls,
  type MeshLayer,
} from '../theme/ThemeProvider';
import { useSvgId } from '../utils/svgId';

/**
 * The artwork, as light in the room.
 *
 * A still, soft wash of the current cover's colours behind the screen: four
 * radial gradients — vibrant, dominant, muted, deep — at fixed positions.
 * Nothing in it moves on its own. The only motion is a short fade when the
 * track changes (see the mesh layers in ThemeProvider), so a new cover
 * doesn't cut the whole screen to a new colour in one frame.
 *
 * Each gradient is a small SVG scaled up by a transform. react-native-svg
 * rasterises every Svg into a bitmap of its own size on Android, and a
 * gradient has no detail to lose, so a 96pt bitmap stretched five times
 * looks the same as a screen-sized one at a fraction of the memory.
 */

export type AmbientVariant = 'subtle' | 'immersive';

export interface AmbientBackgroundProps {
  /** Multiplier on top of the user's ambient setting. Default 1. */
  intensity?: number;
  /**
   * A uniform black veil over the colour, 0-1. For screens that are mostly
   * text — lyrics, the queue — where the legibility scrim's clear middle
   * band would leave words sitting on the brightest part of a cover.
   */
  dim?: number;
  /**
   * 'subtle' (default): a colour wash behind lists and feeds.
   * 'immersive': Now Playing / Lyrics — the screen becomes the artwork's
   * colour, with a dark (or pastel, in light theme) ground and bold blobs.
   */
  variant?: AmbientVariant;
}

/** Side of each gradient's bitmap before scaling, in points. */
const BASE = 96;

interface BlobSpec {
  role: keyof ArtworkPalette;
  /** Centre as a fraction of screen width / height. */
  x: number;
  y: number;
  /** Diameter as a fraction of screen width. */
  size: number;
  /** Peak alpha at the blob's centre, before intensity. */
  peak: number;
}

const SUBTLE: BlobSpec[] = [
  { role: 'vibrant', x: 0.12, y: 0.1, size: 1.35, peak: 0.42 },
  { role: 'dominant', x: 0.95, y: 0.32, size: 1.25, peak: 0.36 },
  { role: 'muted', x: 0.18, y: 0.66, size: 1.4, peak: 0.32 },
  { role: 'deep', x: 0.85, y: 0.95, size: 1.35, peak: 0.5 },
];

const IMMERSIVE: BlobSpec[] = [
  { role: 'vibrant', x: 0.2, y: 0.18, size: 1.6, peak: 0.95 },
  { role: 'dominant', x: 0.9, y: 0.42, size: 1.5, peak: 0.85 },
  { role: 'muted', x: 0.15, y: 0.78, size: 1.55, peak: 0.75 },
  { role: 'vibrant', x: 0.8, y: 1.02, size: 1.3, peak: 0.55 },
];

export function AmbientBackground({ intensity = 1, variant = 'subtle', dim = 0 }: AmbientBackgroundProps) {
  const { ambientIntensity } = useThemeControls();

  if (ambientIntensity <= 0) {
    // The immersive screens still need a ground colour, or the player would
    // fall back to a flat grey panel. The ground is already the cover's
    // deepest shade, so it takes no veil.
    return variant === 'immersive' ? <StaticGround /> : null;
  }

  return (
    <>
      <Mesh strength={intensity * ambientIntensity} variant={variant} />
      {dim > 0 && (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.veil, { opacity: dim }]} />
      )}
    </>
  );
}

/** The immersive ground: the deep colour on dark, the muted pastel on light. */
function groundOf(palette: ArtworkPalette, mode: 'light' | 'dark'): string {
  return mode === 'dark' ? palette.deep : palette.muted;
}

/** Which of a layer's two conditionings this background paints with. */
function paletteOf(layer: MeshLayer, immersive: boolean): ArtworkPalette {
  return immersive ? layer.immersive : layer.mesh;
}

function StaticGround() {
  const { resolved } = useThemeControls();
  const palette = useArtworkPalette();
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: groundOf(palette, resolved) }]}
    />
  );
}

function Mesh({ strength, variant }: { strength: number; variant: AmbientVariant }) {
  const { resolved } = useThemeControls();
  const { layers, mix } = useMeshLayers();
  const { width, height } = useWindowDimensions();

  const immersive = variant === 'immersive';
  const specs = immersive ? IMMERSIVE : SUBTLE;
  // The same alpha that glows on black stains white, so light mode is pulled
  // back — less for immersive, where the colour is the whole point.
  const themeScale = resolved === 'dark' ? 1 : immersive ? 0.85 : 0.8;
  const scale = strength * themeScale;

  const layerA = useAnimatedStyle(() => ({ opacity: 1 - mix.value }));
  const layerB = useAnimatedStyle(() => ({ opacity: mix.value }));

  const paletteA = paletteOf(layers.a, immersive);
  const paletteB = paletteOf(layers.b, immersive);
  const groundA = groundOf(paletteA, resolved);
  const groundB = groundOf(paletteB, resolved);
  const groundStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(mix.value, [0, 1], [groundA, groundB]),
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {immersive && <Animated.View style={[StyleSheet.absoluteFill, groundStyle]} />}

      <Animated.View style={[StyleSheet.absoluteFill, layerA]}>
        {specs.map((spec, index) => (
          <Blob key={index} spec={spec} color={paletteA[spec.role]} peak={spec.peak * scale} width={width} height={height} />
        ))}
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, layerB]}>
        {specs.map((spec, index) => (
          <Blob key={index} spec={spec} color={paletteB[spec.role]} peak={spec.peak * scale} width={width} height={height} />
        ))}
      </Animated.View>

      {immersive && resolved === 'dark' && <LegibilityScrim width={width} height={height} />}
    </View>
  );
}

const Blob = memo(function Blob({
  spec,
  color,
  peak,
  width,
  height,
}: {
  spec: BlobSpec;
  color: string;
  peak: number;
  width: number;
  height: number;
}) {
  const scale = (spec.size * width) / BASE;
  return (
    <View
      style={[
        styles.blob,
        { left: spec.x * width - BASE / 2, top: spec.y * height - BASE / 2, transform: [{ scale }] },
      ]}
    >
      <BlobGradient color={color} peak={peak} />
    </View>
  );
});

/**
 * The gradient itself. Memoised on colour and strength, so only a track
 * change or the intensity slider re-renders an SVG.
 *
 * Stops approximate a Gaussian falloff; a linear ramp to zero leaves a
 * visible edge where the slope stops.
 */
const BlobGradient = memo(function BlobGradient({ color, peak }: { color: string; peak: number }) {
  const r = BASE / 2;
  const alpha = Math.min(1, peak);
  const id = useSvgId('blob');
  return (
    <Svg width={BASE} height={BASE}>
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
          <Stop offset="0" stopColor={color} stopOpacity={alpha} />
          <Stop offset="0.25" stopColor={color} stopOpacity={alpha * 0.86} />
          <Stop offset="0.5" stopColor={color} stopOpacity={alpha * 0.55} />
          <Stop offset="0.75" stopColor={color} stopOpacity={alpha * 0.2} />
          <Stop offset="1" stopColor={color} stopOpacity={0} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={`url(#${id})`} />
    </Svg>
  );
});

const SCRIM_W = 8;
const SCRIM_H = 256;

/**
 * Darkens the top and bottom of the immersive background, where the status
 * bar and the transport controls sit, so white text holds its contrast over
 * even a bright cover. Small bitmap, stretched — same reasoning as the blobs.
 */
const LegibilityScrim = memo(function LegibilityScrim({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  const id = useSvgId('scrim');
  return (
    <View
      style={[
        styles.scrim,
        {
          left: (width - SCRIM_W) / 2,
          top: (height - SCRIM_H) / 2,
          transform: [{ scaleX: width / SCRIM_W }, { scaleY: height / SCRIM_H }],
        },
      ]}
    >
      <Svg width={SCRIM_W} height={SCRIM_H}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.28} />
            <Stop offset="0.22" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.55" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.45} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={SCRIM_W} height={SCRIM_H} fill={`url(#${id})`} />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  veil: { backgroundColor: '#000000' },
  blob: { position: 'absolute', width: BASE, height: BASE },
  scrim: { position: 'absolute', width: SCRIM_W, height: SCRIM_H },
});
