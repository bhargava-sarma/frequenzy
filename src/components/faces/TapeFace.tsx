import { memo, useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';

import { Label } from '../Label';
import { type, withAlpha } from '../../theme/tokens';
import { useTheme, useThemeControls } from '../../theme/ThemeProvider';

/**
 * The track as a cassette.
 *
 * The tape packs carry the progress: the left reel unwinds onto the right as
 * the song plays, sized by area so they shrink and grow the way real tape
 * does — slowly at first on a full reel, faster as it empties. The hubs turn
 * at the speed the tape would drive them, inversely to how much is wound on
 * each, so the nearly-empty reel spins visibly faster than the full one.
 *
 * The turning hubs are this face's whole point, so they are the one thing
 * here that moves on its own — transforms driven from one frame callback on
 * the UI thread, running only while music does, and not at all under Reduce
 * motion. The packs are simply sized to the position: they change by a
 * fraction of a point a second, so there is nothing to animate.
 */

/** Points of tape passing the head per second, in hub-degrees × radius. */
const TAPE_SPEED = 1400;

export const TapeFace = memo(function TapeFace({
  size,
  playing,
  progress,
  title,
  subtitle,
}: {
  size: number;
  playing: boolean;
  progress: number;
  title?: string;
  subtitle?: string;
}) {
  const color = useTheme();
  const { reduceMotion } = useThemeControls();

  const width = size;
  const height = Math.round(size * 0.66);
  const reelGap = width * 0.38;
  const rMin = width * 0.065;
  const rMax = width * 0.17;

  const p = useSharedValue(progress);
  const leftAngle = useSharedValue(0);
  const rightAngle = useSharedValue(0);

  useEffect(() => {
    p.value = progress;
  }, [progress, p]);

  const frame = useFrameCallback((info) => {
    'worklet';
    const dt = Math.min(info.timeSincePreviousFrame ?? 16, 64) / 1000;
    const left = rMin + (rMax - rMin) * Math.sqrt(Math.max(0, 1 - p.value));
    const right = rMin + (rMax - rMin) * Math.sqrt(Math.max(0, p.value));
    // Both hubs turn counter-clockwise while the tape runs left to right.
    leftAngle.value = (leftAngle.value - (dt * TAPE_SPEED) / left) % 360;
    rightAngle.value = (rightAngle.value - (dt * TAPE_SPEED) / right) % 360;
  }, false);

  useEffect(() => {
    frame.setActive(playing && !reduceMotion);
    return () => frame.setActive(false);
  }, [playing, reduceMotion, frame]);

  const windowWidth = width * 0.62;
  const windowHeight = height * 0.36;
  const windowLeft = (width - windowWidth) / 2;
  const windowTop = height * 0.36;
  const centerY = windowHeight / 2;
  const leftX = windowWidth / 2 - reelGap / 2;
  const rightX = windowWidth / 2 + reelGap / 2;

  return (
    <View
      style={[
        styles.shell,
        {
          width,
          height,
          borderRadius: width * 0.05,
          boxShadow: [{ offsetX: 0, offsetY: 16, blurRadius: 36, color: 'rgba(0,0,0,0.55)' }],
        },
      ]}
    >
      {/* Screws. */}
      {[
        [0.035, 0.05],
        [0.94, 0.05],
        [0.035, 0.89],
        [0.94, 0.89],
      ].map(([x, y], i) => (
        <View key={i} style={[styles.screw, { left: width * x, top: height * y }]} />
      ))}

      {/* The label, with the window cut through it. */}
      <View
        style={[
          styles.label,
          {
            left: width * 0.07,
            right: width * 0.07,
            top: height * 0.08,
            height: height * 0.68,
            borderRadius: width * 0.025,
          },
        ]}
      >
        <View style={[styles.stripe, { backgroundColor: color.accent }]} />
        <View style={styles.labelHeader}>
          <Text style={[type.monoLarge, styles.labelInk]}>A</Text>
          <View style={styles.labelLines}>
            <Text style={[type.headline, styles.labelInk]} numberOfLines={1}>
              {title ?? 'Untitled'}
            </Text>
            {subtitle ? (
              <Text style={[type.caption, styles.labelInkDim]} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
          <Text style={[type.labelBold, styles.labelInkDim]}>FQ·60</Text>
        </View>
      </View>

      <View
        style={[
          styles.window,
          { left: windowLeft, top: windowTop, width: windowWidth, height: windowHeight, borderRadius: windowHeight / 2 },
        ]}
      >
        <Pack center={[leftX, centerY]} rMax={rMax} rMin={rMin} progress={p} side="left" />
        <Pack center={[rightX, centerY]} rMax={rMax} rMin={rMin} progress={p} side="right" />
        <Hub center={[leftX, centerY]} radius={width * 0.05} angle={leftAngle} />
        <Hub center={[rightX, centerY]} radius={width * 0.05} angle={rightAngle} />
        {/* Glass over the window. */}
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.windowGlass, { borderRadius: windowHeight / 2 }]} />
      </View>

      {/* The head opening along the bottom edge. */}
      <View
        style={[
          styles.bridge,
          {
            left: width * 0.22,
            right: width * 0.22,
            height: height * 0.16,
            borderTopLeftRadius: width * 0.03,
            borderTopRightRadius: width * 0.03,
          },
        ]}
      >
        <View style={styles.bridgeHole} />
        <Label tone="displayDim" size={8.5}>
          TYPE I · NORMAL
        </Label>
        <View style={styles.bridgeHole} />
      </View>
    </View>
  );
});

function Pack({
  center,
  rMax,
  rMin,
  progress,
  side,
}: {
  center: [number, number];
  rMax: number;
  rMin: number;
  progress: SharedValue<number>;
  side: 'left' | 'right';
}) {
  const style = useAnimatedStyle(() => {
    const fill = side === 'left' ? 1 - progress.value : progress.value;
    const r = rMin + (rMax - rMin) * Math.sqrt(Math.max(0, fill));
    return { transform: [{ scale: r / rMax }] };
  });
  return (
    <Animated.View
      style={[
        styles.pack,
        { width: rMax * 2, height: rMax * 2, borderRadius: rMax, left: center[0] - rMax, top: center[1] - rMax },
        style,
      ]}
    />
  );
}

function Hub({
  center,
  radius,
  angle,
}: {
  center: [number, number];
  radius: number;
  angle: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  return (
    <Animated.View
      style={[
        styles.hub,
        { width: radius * 2, height: radius * 2, borderRadius: radius, left: center[0] - radius, top: center[1] - radius },
        style,
      ]}
    >
      {[0, 60, 120].map((deg) => (
        <View
          key={deg}
          style={[
            styles.tooth,
            { width: radius * 1.5, transform: [{ rotate: `${deg}deg` }] },
          ]}
        />
      ))}
      <View style={[styles.hubCore, { width: radius * 0.9, height: radius * 0.9, borderRadius: radius }]} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  shell: {
    backgroundColor: '#1B1B1D',
    borderWidth: 1,
    borderColor: '#2C2C30',
    overflow: 'hidden',
  },
  screw: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#3A3A3E',
    borderWidth: 1,
    borderColor: '#0E0E0F',
  },
  label: { position: 'absolute', backgroundColor: '#ECEAE3', overflow: 'hidden' },
  stripe: { position: 'absolute', left: 0, right: 0, bottom: '18%', height: '10%', opacity: 0.9 },
  labelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  labelLines: { flex: 1 },
  labelInk: { color: '#151514' },
  labelInkDim: { color: withAlpha('#151514', 0.55) },
  window: {
    position: 'absolute',
    backgroundColor: '#0A0A0B',
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#2A2A2D',
  },
  windowGlass: { backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  pack: { position: 'absolute', backgroundColor: '#3B2A22', borderWidth: 1, borderColor: '#2A1C16' },
  hub: {
    position: 'absolute',
    backgroundColor: '#E7E5DE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tooth: { position: 'absolute', height: 3, borderRadius: 1, backgroundColor: '#8E8C86' },
  hubCore: { backgroundColor: '#0A0A0B' },
  bridge: {
    position: 'absolute',
    bottom: 0,
    backgroundColor: '#141416',
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: '#2C2C30',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
  },
  bridgeHole: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#050505' },
});
