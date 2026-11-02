import { memo, useEffect, useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { Artwork } from '../Artwork';
import { useTheme, useThemeControls } from '../../theme/ThemeProvider';
import { useSvgId } from '../../utils/svgId';

/**
 * The record on the platter.
 *
 * Grooves are concentric, so spinning them would be invisible — what turns is
 * the label, which is the album's cover cut round. The sheen across the
 * vinyl stays put while the record turns under it, which is what makes it
 * read as a lit, spinning disc rather than a rotating picture. The tone arm
 * sits where the song is: lifted at rest, at the lead-in when a track
 * starts, at the run-out as it ends. It moves a fraction of a degree a
 * second, so it is simply placed, not animated.
 *
 * The turning is this face's whole point, so it is the one thing here that
 * moves on its own: 33⅓ rpm, 1.8 s a turn, stopping where it is on pause.
 * Reduce motion holds it still.
 */
const REVOLUTION_MS = 1800;

export const VinylFace = memo(function VinylFace({
  uri,
  size,
  playing,
  progress,
}: {
  uri?: string;
  size: number;
  playing: boolean;
  /** 0-1 through the track. */
  progress: number;
}) {
  const color = useTheme();
  const { reduceMotion } = useThemeControls();
  const sheenId = useSvgId('vinylsheen');
  const angle = useSharedValue(0);

  const disc = size * 0.92;
  const label = disc * 0.36;

  useEffect(() => {
    cancelAnimation(angle);
    if (!playing || reduceMotion) return;
    const start = angle.value % 360;
    angle.value = start;
    angle.value = withRepeat(
      withTiming(start + 360, { duration: REVOLUTION_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(angle);
  }, [playing, reduceMotion, angle]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value % 360}deg` }] }));
  // Measured against the disc geometry below: 0° puts the stylus on the
  // outer groove, 26° on the run-out by the label, and the rest position
  // (-0.25) swings it just clear of the rim. Lifted off the record when
  // paused at the very start, otherwise riding the groove.
  const arm = !playing && progress < 0.001 ? -0.25 : progress;
  const armStyle = { transform: [{ rotate: `${arm * 26}deg` }] };

  const grooves = useMemo(() => {
    const out: number[] = [];
    for (let r = label / 2 + 6; r < disc / 2 - 3; r += 3.2) out.push(r);
    return out;
  }, [disc, label]);

  const armLength = size * 0.62;

  return (
    <View style={{ width: size, height: size }}>
      {/* Platter shadow and the record itself. */}
      <View
        style={[
          styles.disc,
          {
            width: disc,
            height: disc,
            borderRadius: disc / 2,
            left: (size - disc) / 2,
            top: (size - disc) / 2,
            boxShadow: [{ offsetX: 0, offsetY: 14, blurRadius: 34, color: 'rgba(0,0,0,0.6)' }],
          },
        ]}
      >
        <Svg width={disc} height={disc} style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={sheenId} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0.18" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.32" stopColor="#FFFFFF" stopOpacity={0.13} />
              <Stop offset="0.42" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity={0} />
              <Stop offset="0.7" stopColor="#FFFFFF" stopOpacity={0.09} />
              <Stop offset="0.8" stopColor="#FFFFFF" stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Circle cx={disc / 2} cy={disc / 2} r={disc / 2} fill="#0B0B0C" />
          {grooves.map((r) => (
            <Circle key={r} cx={disc / 2} cy={disc / 2} r={r} stroke="#FFFFFF" strokeOpacity={0.045} strokeWidth={1} fill="none" />
          ))}
          <Circle cx={disc / 2} cy={disc / 2} r={disc / 2 - 1} fill={`url(#${sheenId})`} />
        </Svg>

        <Animated.View
          style={[
            styles.label,
            { width: label, height: label, borderRadius: label / 2, left: (disc - label) / 2, top: (disc - label) / 2 },
            spin,
          ]}
        >
          <Artwork uri={uri} size={label} round shadow={false} />
          {/* A printed tick on the label, so the turn is visible even on a plain cover. */}
          <View style={[styles.tick, { left: label / 2 - 1, backgroundColor: color.accent }]} />
          <View style={[styles.spindle, { left: label / 2 - 5, top: label / 2 - 5 }]} />
        </Animated.View>
      </View>

      {/* Tone arm, pivoting from the top-right corner. */}
      <View style={[styles.armPivot, { right: size * 0.02, top: size * 0.02 }]} pointerEvents="none">
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 2 * armLength,
              height: 2 * armLength,
              left: -armLength + 16,
              top: -armLength + 16,
            },
            armStyle,
          ]}
        >
          <View style={[styles.armBar, { height: armLength - 18, left: armLength - 2, top: armLength }]} />
          <View style={[styles.headshell, { left: armLength - 9, top: 2 * armLength - 24, backgroundColor: color.accent }]} />
        </Animated.View>
        <View style={styles.pivotBase} />
        <View style={styles.pivotCap} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  disc: { position: 'absolute', overflow: 'visible' },
  label: { position: 'absolute', overflow: 'hidden' },
  tick: { position: 'absolute', top: 4, width: 2, height: 9, borderRadius: 1 },
  spindle: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#D9D7D0',
    borderWidth: 2,
    borderColor: '#0B0B0C',
  },
  armPivot: { position: 'absolute', width: 32, height: 32 },
  armBar: { position: 'absolute', width: 4, borderRadius: 2, backgroundColor: '#C9C7C0' },
  headshell: { position: 'absolute', width: 18, height: 26, borderRadius: 4 },
  pivotBase: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#2A2A2D',
    borderWidth: 1,
    borderColor: '#3A3A3E',
  },
  pivotCap: {
    position: 'absolute',
    left: 9,
    top: 9,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#C9C7C0',
  },
});
