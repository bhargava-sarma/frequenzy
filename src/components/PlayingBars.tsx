import { memo, useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useMotion } from '../theme/motion';

/**
 * The "this one is playing" mark: three level bars in place of a track
 * number. They rise and fall while audio runs and sink low when it stops,
 * so a glance down a list says both which row and whether it's sounding.
 *
 * It is an indicator, not a meter — nothing here listens to the audio. Each
 * bar runs its own slow loop at a slightly different pace, which is what
 * keeps three bars from reading as one pulsing block. Only the playing row
 * mounts this, so a long list carries one animation, not hundreds; each bar
 * is a scale on the UI thread, anchored at its foot. Reduce motion holds
 * them still at their playing heights.
 */
export interface PlayingBarsProps {
  playing: boolean;
  color: string;
  size?: number;
}

/** Resting heights while playing, for Reduce motion. */
const HELD = [0.55, 1, 0.75];
const PAUSED = 0.28;

/** Each bar's swing and pace. Co-prime-ish periods, so the pattern never visibly repeats. */
const BARS = [
  { low: 0.35, high: 0.85, period: 430, delay: 0 },
  { low: 0.45, high: 1, period: 370, delay: 110 },
  { low: 0.3, high: 0.72, period: 510, delay: 50 },
];

export const PlayingBars = memo(function PlayingBars({ playing, color, size = 14 }: PlayingBarsProps) {
  const barWidth = Math.max(2, Math.round(size / 5));

  return (
    <View style={[styles.root, { height: size, gap: barWidth * 0.6 }]}>
      {BARS.map((_, index) => (
        <Bar key={index} index={index} playing={playing} color={color} width={barWidth} height={size} />
      ))}
    </View>
  );
});

function Bar({
  index,
  playing,
  color,
  width,
  height,
}: {
  index: number;
  playing: boolean;
  color: string;
  width: number;
  height: number;
}) {
  const { reduce, timings } = useMotion();
  const level = useSharedValue(playing ? HELD[index] : PAUSED);

  useEffect(() => {
    cancelAnimation(level);
    if (!playing) {
      level.value = withTiming(PAUSED, timings.fast);
      return;
    }
    if (reduce) {
      level.value = HELD[index];
      return;
    }
    const { low, high, period, delay } = BARS[index];
    const swing = { duration: period, easing: Easing.inOut(Easing.quad) };
    level.value = withDelay(
      delay,
      withRepeat(withSequence(withTiming(high, swing), withTiming(low, swing)), -1, false),
    );
    return () => cancelAnimation(level);
    // The timings object is stable per Reduce motion setting.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, reduce, index, level]);

  const style = useAnimatedStyle(() => ({ transform: [{ scaleY: level.value }] }));

  return (
    <Animated.View
      style={[
        styles.bar,
        { width, height, borderRadius: width / 2, backgroundColor: color },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end' },
  // Scaled from the foot, so a bar grows upward out of the baseline.
  bar: { transformOrigin: 'bottom' },
});
