import { memo, useEffect } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useScreenFocused } from '../hooks/useScreenFocused';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
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
 * A soft mesh of the current cover's colours drifting and breathing behind
 * the screen. Four radial gradients — vibrant, dominant, muted, deep — each
 * moving on its own slow Lissajous path, so the composition never repeats in
 * a way the eye can catch. Between tracks the colours crossfade on the UI
 * thread (see the mesh layers in ThemeProvider).
 *
 * Built to cost as little as a background can:
 *
 *   - Each gradient is a small SVG scaled up by a transform. react-native-svg
 *     rasterises every Svg into a bitmap of its own size on Android, and a
 *     gradient has no detail to lose, so a 96pt bitmap stretched five times
 *     looks the same as a screen-sized one at a fraction of the memory.
 *   - Motion is one frame callback advancing a clock, throttled to ~30fps.
 *     The drift is a few points a second, where 30 steps is indistinguishable
 *     from 120 — and every skipped frame is a frame in which nothing behind a
 *     glass surface changed, so a real blur over it has nothing to redo.
 *   - It stops when the screen is not focused, and when the full player
 *     covers it, and is not mounted at all when the ambient setting is zero.
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
  /** Freeze the drift, e.g. while a panel fully covers this screen. */
  paused?: boolean;
}

/** Side of each gradient's bitmap before scaling, in points. */
const BASE = 96;

/** Minimum time between clock steps. ~30fps. */
const TICK_MS = 33;

const TAU = Math.PI * 2;

interface BlobSpec {
  role: keyof ArtworkPalette;
  /** Centre as a fraction of screen width / height. */
  x: number;
  y: number;
  /** Diameter as a fraction of screen width. */
  size: number;
  /** Drift amplitude as a fraction of width / height. */
  ax: number;
  ay: number;
  /** Drift periods in seconds. */
  tx: number;
  ty: number;
  /** Breathing period in seconds, and how much the blob swells. */
  tb: number;
  breathe: number;
  /** Phase offsets, radians. */
  phase: number;
  /** Peak alpha at the blob's centre, before intensity. */
  peak: number;
}

/**
 * Periods are chosen to share no small common multiple, so the four paths
 * drift in and out of alignment rather than looping visibly.
 */
const SUBTLE: BlobSpec[] = [
  { role: 'vibrant', x: 0.12, y: 0.1, size: 1.35, ax: 0.16, ay: 0.06, tx: 29, ty: 37, tb: 11, breathe: 0.08, phase: 0, peak: 0.42 },
  { role: 'dominant', x: 0.95, y: 0.32, size: 1.25, ax: 0.12, ay: 0.08, tx: 41, ty: 31, tb: 13, breathe: 0.07, phase: 1.7, peak: 0.36 },
  { role: 'muted', x: 0.18, y: 0.66, size: 1.4, ax: 0.14, ay: 0.07, tx: 34, ty: 43, tb: 17, breathe: 0.09, phase: 3.1, peak: 0.32 },
  { role: 'deep', x: 0.85, y: 0.95, size: 1.35, ax: 0.1, ay: 0.05, tx: 47, ty: 27, tb: 19, breathe: 0.06, phase: 4.4, peak: 0.5 },
];

const IMMERSIVE: BlobSpec[] = [
  { role: 'vibrant', x: 0.2, y: 0.18, size: 1.6, ax: 0.18, ay: 0.08, tx: 23, ty: 29, tb: 9, breathe: 0.1, phase: 0, peak: 0.95 },
  { role: 'dominant', x: 0.9, y: 0.42, size: 1.5, ax: 0.14, ay: 0.1, tx: 31, ty: 25, tb: 11, breathe: 0.09, phase: 1.9, peak: 0.85 },
  { role: 'muted', x: 0.15, y: 0.78, size: 1.55, ax: 0.16, ay: 0.08, tx: 27, ty: 35, tb: 13, breathe: 0.1, phase: 3.3, peak: 0.75 },
  { role: 'vibrant', x: 0.8, y: 1.02, size: 1.3, ax: 0.12, ay: 0.06, tx: 37, ty: 21, tb: 15, breathe: 0.08, phase: 4.6, peak: 0.55 },
];

/** Where the drift clock starts, so a fresh screen doesn't open on phase zero. */
const START_SECONDS = 7;

export function AmbientBackground({
  intensity = 1,
  variant = 'subtle',
  paused = false,
  dim = 0,
}: AmbientBackgroundProps) {
  const { ambientIntensity } = useThemeControls();

  if (ambientIntensity <= 0) {
    // Nothing animates at zero. The immersive screens still need a ground
    // colour, or the player would fall back to a flat grey panel. The ground
    // is already the cover's deepest shade, so it takes no veil.
    return variant === 'immersive' ? <StaticGround /> : null;
  }

  return (
    <>
      <Mesh strength={intensity * ambientIntensity} variant={variant} paused={paused} />
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

function Mesh({
  strength,
  variant,
  paused,
}: {
  strength: number;
  variant: AmbientVariant;
  paused: boolean;
}) {
  const { resolved, reduceMotion } = useThemeControls();
  const { layers, mix } = useMeshLayers();
  const { width, height } = useWindowDimensions();
  /**
   * Tab screens stay mounted when you navigate away, so without this every
   * screen you have ever opened keeps its mesh running on the UI thread for
   * a background nobody can see.
   */
  const focused = useScreenFocused();
  const playerOpen = usePlayerUiStore((state) => state.open);

  const immersive = variant === 'immersive';
  // A subtle mesh behind the full player is invisible and would keep any
  // real blur over it busy for nothing.
  const active = focused && !paused && !reduceMotion && (immersive || !playerOpen);

  const clock = useSharedValue(START_SECONDS);
  const sinceTick = useSharedValue(0);

  const frame = useFrameCallback((info) => {
    'worklet';
    // Clamped so resuming after a pause, or a long frame, never jumps.
    const delta = Math.min(info.timeSincePreviousFrame ?? 0, 100);
    sinceTick.value += delta;
    if (sinceTick.value < TICK_MS) return;
    clock.value += sinceTick.value / 1000;
    sinceTick.value = 0;
  }, false);

  useEffect(() => {
    frame.setActive(active);
    return () => frame.setActive(false);
  }, [active, frame]);

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
          <Blob
            key={index}
            spec={spec}
            color={paletteA[spec.role]}
            peak={spec.peak * scale}
            clock={clock}
            mix={mix}
            hiddenAt={1}
            width={width}
            height={height}
          />
        ))}
      </Animated.View>

      <Animated.View style={[StyleSheet.absoluteFill, layerB]}>
        {specs.map((spec, index) => (
          <Blob
            key={index}
            spec={spec}
            color={paletteB[spec.role]}
            peak={spec.peak * scale}
            clock={clock}
            mix={mix}
            hiddenAt={0}
            width={width}
            height={height}
          />
        ))}
      </Animated.View>

      {immersive && resolved === 'dark' && <LegibilityScrim width={width} height={height} />}
    </View>
  );
}

function Blob({
  spec,
  color,
  peak,
  clock,
  mix,
  hiddenAt,
  width,
  height,
}: {
  spec: BlobSpec;
  color: string;
  peak: number;
  clock: SharedValue<number>;
  mix: SharedValue<number>;
  /** The mix value at which this blob's layer is fully transparent. */
  hiddenAt: 0 | 1;
  width: number;
  height: number;
}) {
  const diameter = spec.size * width;
  const baseScale = diameter / BASE;

  const style = useAnimatedStyle(() => {
    // A hidden layer holds still, so it sends no prop updates while nobody
    // can see it. It rejoins the clock the moment its fade begins, while it
    // is still effectively transparent.
    const hidden = Math.abs(mix.value - hiddenAt) < 0.001;
    const t = hidden ? 0 : clock.value;
    return {
      transform: [
        { translateX: Math.sin((t * TAU) / spec.tx + spec.phase) * spec.ax * width },
        { translateY: Math.cos((t * TAU) / spec.ty + spec.phase) * spec.ay * height },
        {
          scale:
            baseScale * (1 + Math.sin((t * TAU) / spec.tb + spec.phase * 0.7) * spec.breathe),
        },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        styles.blob,
        { left: spec.x * width - BASE / 2, top: spec.y * height - BASE / 2 },
        style,
      ]}
    >
      <BlobGradient color={color} peak={peak} />
    </Animated.View>
  );
}

/**
 * The gradient itself. Memoised on colour and strength, so the drift never
 * re-renders an SVG — only a track change or the intensity slider does.
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
