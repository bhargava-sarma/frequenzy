import { memo, useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

import { useMotion } from '../theme/motion';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Material 3 Expressive's loading indicator: one shape that keeps becoming
 * the next — a soft burst, a nine-lobed cookie, a pentagon, a pill, a sunny
 * burst, a four-lobed cookie, an oval — while it turns. It says "working"
 * for the short waits a spinner used to fill, and it is the same indicator
 * Android 16 uses.
 *
 * Every shape is a radius around the centre sampled at the same angles, so
 * morphing is a blend of two lists of numbers; the outline is drawn through
 * them with smooth curves on the UI thread. Under Reduce motion it holds
 * still as the cookie.
 */

const POINTS = 48;
const COS: number[] = [];
const SIN: number[] = [];
for (let i = 0; i < POINTS; i++) {
  const angle = (i / POINTS) * Math.PI * 2 - Math.PI / 2;
  COS.push(Math.cos(angle));
  SIN.push(Math.sin(angle));
}

type Shape = (theta: number) => number;

/** n soft lobes around a circle. */
const lobes = (n: number, depth: number): Shape => (theta) => 1 + depth * Math.cos(n * theta);
/** A regular n-gon, rounded by blending toward the circle. */
const polygon = (n: number, roundness: number): Shape => (theta) => {
  const segment = (Math.PI * 2) / n;
  const local = (((theta % segment) + segment) % segment) - segment / 2;
  return (Math.cos(Math.PI / n) / Math.cos(local)) * (1 - roundness) + roundness;
};
/** An ellipse, b the short axis as a share of the long. */
const ellipse = (b: number): Shape => (theta) =>
  b / Math.sqrt((b * Math.cos(theta)) ** 2 + Math.sin(theta) ** 2);

function sample(shape: Shape): number[] {
  const radii = Array.from({ length: POINTS }, (_, i) => shape((i / POINTS) * Math.PI * 2));
  const max = Math.max(...radii);
  return radii.map((r) => r / max);
}

/** The spec's indeterminate sequence. */
const SHAPES: number[][] = [
  sample(lobes(10, 0.07)),
  sample(lobes(9, 0.11)),
  sample(polygon(5, 0.35)),
  sample(ellipse(0.62)),
  sample(lobes(8, 0.05)),
  sample(lobes(4, 0.13)),
  sample(ellipse(0.84)),
];
/** Time on each shape, holding then morphing. */
const STEP_MS = 650;
/** Share of a step spent holding the shape before morphing on. */
const HOLD = 0.3;
/** How far it turns per step. */
const TURN = 140;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface LoadingIndicatorProps {
  size?: number;
  color?: string;
  /** Material's contained variant: the shape on a round container. */
  contained?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
}

export const LoadingIndicator = memo(function LoadingIndicator({
  size = 44,
  color: tint,
  contained = false,
  style,
  accessibilityLabel = 'Loading',
}: LoadingIndicatorProps) {
  const color = useTheme();
  const { reduce } = useMotion();
  const fill = tint ?? (contained ? color.onAccentContainer : color.accent);

  const progress = useSharedValue(1);
  useEffect(() => {
    if (reduce) {
      cancelAnimation(progress);
      progress.value = 1;
      return;
    }
    progress.value = 0;
    progress.value = withRepeat(
      withTiming(SHAPES.length, { duration: SHAPES.length * STEP_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(progress);
  }, [reduce, progress]);

  const centre = size / 2;
  // The shape fills about two thirds of its box when contained, nearly all of
  // it otherwise, as the spec draws them.
  const radius = size * (contained ? 0.32 : 0.46);

  const animatedProps = useAnimatedProps(() => {
    // Guarded: an animation's first frame can report a value that isn't a
    // finite number yet, and an index from it would find no shape.
    const raw0 = progress.value;
    const t = typeof raw0 === 'number' && Number.isFinite(raw0) && raw0 > 0 ? raw0 : 0;
    const whole = Math.floor(t);
    const count = SHAPES.length;
    const from = SHAPES[whole % count];
    const to = SHAPES[(whole + 1) % count];
    if (!from || !to) return { d: '' };
    const local = t - whole;
    const raw = local < HOLD ? 0 : (local - HOLD) / (1 - HOLD);
    const blend = raw * raw * (3 - 2 * raw);

    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < POINTS; i++) {
      const r = (from[i] + (to[i] - from[i]) * blend) * radius;
      xs.push(centre + r * COS[i]);
      ys.push(centre + r * SIN[i]);
    }
    // A smooth closed outline: quadratic curves through each point, from
    // midpoint to midpoint.
    const last = POINTS - 1;
    let d = `M ${(xs[last] + xs[0]) / 2} ${(ys[last] + ys[0]) / 2}`;
    for (let i = 0; i < POINTS; i++) {
      const next = (i + 1) % POINTS;
      d += ` Q ${xs[i]} ${ys[i]} ${(xs[i] + xs[next]) / 2} ${(ys[i] + ys[next]) / 2}`;
    }
    return { d: `${d} Z` };
  });

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${progress.value * TURN}deg` }] }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      style={[
        { width: size, height: size },
        contained && { borderRadius: size / 2, backgroundColor: color.accentContainer },
        style,
      ]}
    >
      <Animated.View style={[{ width: size, height: size }, spin]}>
        <Svg width={size} height={size}>
          <AnimatedPath animatedProps={animatedProps} fill={fill} />
        </Svg>
      </Animated.View>
    </View>
  );
});
