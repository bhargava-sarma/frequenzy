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
  type SharedValue,
} from 'react-native-reanimated';

import { useThemeControls } from '../theme/ThemeProvider';

/**
 * The "this one is playing" mark: a few level bars dancing in place of a
 * track number. Still and low when paused, so a paused row still says where
 * you are without pretending to move.
 *
 * It is an indicator, not a meter — nothing here listens to the audio — and
 * it is drawn small enough to read as an icon rather than as a visualiser.
 */
export interface PlayingBarsProps {
  playing: boolean;
  color: string;
  size?: number;
}

const BARS = [
  { low: 0.35, high: 1, period: 520, delay: 0 },
  { low: 0.25, high: 0.8, period: 410, delay: 120 },
  { low: 0.4, high: 0.95, period: 610, delay: 60 },
];

export const PlayingBars = memo(function PlayingBars({ playing, color, size = 14 }: PlayingBarsProps) {
  const { reduceMotion } = useThemeControls();
  const animate = playing && !reduceMotion;
  const barWidth = Math.max(2, Math.round(size / 5));

  return (
    <View style={[styles.root, { height: size, gap: barWidth * 0.6 }]}>
      {BARS.map((bar, index) => (
        <Bar key={index} spec={bar} animate={animate} color={color} width={barWidth} height={size} />
      ))}
    </View>
  );
});

function Bar({
  spec,
  animate,
  color,
  width,
  height,
}: {
  spec: (typeof BARS)[number];
  animate: boolean;
  color: string;
  width: number;
  height: number;
}) {
  const level = useSharedValue(spec.low);

  useEffect(() => {
    cancelAnimation(level);
    if (!animate) {
      level.value = withTiming(spec.low * 0.8, { duration: 200 });
      return;
    }
    level.value = withDelay(
      spec.delay,
      withRepeat(
        withSequence(
          withTiming(spec.high, { duration: spec.period, easing: Easing.inOut(Easing.quad) }),
          withTiming(spec.low, { duration: spec.period * 0.9, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(level);
  }, [animate, level, spec]);

  return <BarView level={level} color={color} width={width} height={height} />;
}

function BarView({
  level,
  color,
  width,
  height,
}: {
  level: SharedValue<number>;
  color: string;
  width: number;
  height: number;
}) {
  // Scaled from the bottom: the bar grows up from its baseline, never from
  // its middle, which is how a level meter reads.
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: (height * (1 - level.value)) / 2 }, { scaleY: level.value }],
  }));
  return (
    <Animated.View
      style={[{ width, height, borderRadius: width / 2, backgroundColor: color }, style]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-end' },
});
