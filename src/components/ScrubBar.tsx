import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated as NativeAnimated,
  Easing as NativeEasing,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { useMotion } from '../theme/motion';
import { type, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';
import { formatDuration } from '../utils/time';

/**
 * Playback position as a ruler, the way a tape machine's counter strip reads.
 *
 * Ticks run the width; the ones already played light up in the accent and a
 * playhead marks the spot. The player reports its position once a second,
 * and the playhead glides from one report to the next rather than stepping,
 * so it reads as running rather than as being updated. The lit ticks are
 * revealed by translating a clip rather than resizing anything, so the
 * glide is three transforms on the UI thread.
 *
 * Scrubbing follows the finger and clicks at each tenth of the track; a tap
 * anywhere on the ruler seeks there. The seeked position is held until the
 * player confirms it, so the playhead never jumps back to the old time for
 * a beat after you let go.
 *
 * Over the ruler runs Material 3 Expressive's wavy track, as on Android 16's
 * media controls: what has played is a moving wave while the music plays,
 * flattening to a line when it stops; what is left is a straight track with
 * a stop dot at its end, and the playhead is a slim upright handle. The wave
 * moves by translating one pre-drawn path on the native animation driver —
 * no JavaScript and no layout per frame — and only while the player is on
 * screen.
 */
export interface ScrubBarProps {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  /** Over artwork: white ticks instead of the theme's. */
  tone?: 'default' | 'onArtwork';
  /** Whether the music is running: the played track waves while it is. */
  playing?: boolean;
}

const RULER_HEIGHT = 34;
const TICK_SPACING = 6;
const MINOR = 5;
const MAJOR = 10;
const MAJOR_EVERY = 8;
/** The track's centre line, above the ticks. */
const TRACK_Y = 12;
const TRACK_STROKE = 3.5;
const WAVE_AMPLITUDE = 3.2;
const WAVELENGTH = 26;
/** One wavelength's travel. */
const WAVE_PERIOD_MS = 1100;
const HANDLE_HEIGHT = 24;
/** Clear space either side of the handle, as Material 3 Expressive draws it. */
const HANDLE_GAP = 5;
const STOP_DOT = 4;
/** How long a seek is trusted over the player's reports. */
const SEEK_HOLD_MS = 1500;
/** A report further than this from the playhead is a seek or a new track: jump, don't glide. */
const GLIDE_LIMIT_SECONDS = 2.5;
/** Gesture states, as numbers a worklet can compare against. */
const STATE_FAILED = 1;

export const ScrubBar = memo(function ScrubBar({
  position,
  duration,
  onSeek,
  tone = 'default',
  playing = false,
}: ScrubBarProps) {
  const color = useTheme();
  const { reduce, springs } = useMotion();
  const onArt = tone === 'onArtwork';
  const dim = onArt ? withAlpha(color.onArtwork, 0.28) : color.border;
  const track = onArt ? withAlpha(color.onArtwork, 0.32) : color.border;
  const lit = color.accent;
  const textColor = onArt ? withAlpha(color.onArtwork, 0.7) : color.labelSecondary;

  const [width, setWidth] = useState(0);
  const [scrubSeconds, setScrubSeconds] = useState<number | null>(null);
  const [showRemaining, setShowRemaining] = useState(true);

  const total = duration > 0 ? duration : 0;
  const progress = useSharedValue(total > 0 ? Math.min(1, position / total) : 0);
  const dragging = useSharedValue(false);
  /** Whether the current touch ended as a drag, as opposed to never becoming one. */
  const ended = useSharedValue(false);
  const lastDecile = useSharedValue(-1);
  const held = useRef<{ ratio: number; until: number } | null>(null);
  /** Where the player last said it was, to return to when a touch is abandoned. */
  const reported = useRef(total > 0 ? Math.min(1, position / total) : 0);
  // Kept in a ref so a parent passing a fresh function each render doesn't
  // rebuild the gesture under a finger that is mid-drag.
  const seek = useRef(onSeek);
  seek.current = onSeek;

  // Follow the player, unless a drag or a fresh seek says otherwise.
  useEffect(() => {
    if (total <= 0) {
      reported.current = 0;
      if (!dragging.value) progress.value = 0;
      return;
    }
    const ratio = Math.min(1, Math.max(0, position / total));
    reported.current = ratio;
    if (dragging.value) return;

    const hold = held.current;
    if (hold) {
      const confirmed = Math.abs(ratio - hold.ratio) * total < 2;
      if (!confirmed && Date.now() < hold.until) return;
      held.current = null;
    }

    // Glide to each report over the second until the next one. A report far
    // from the playhead is a jump — a seek, a new track — and is taken at once.
    const jumped = Math.abs(ratio - progress.value) * total > GLIDE_LIMIT_SECONDS;
    progress.value =
      reduce || jumped ? ratio : withTiming(ratio, { duration: 1000, easing: Easing.linear });
  }, [position, total, progress, dragging, reduce]);

  const commit = useCallback(
    (ratio: number) => {
      setScrubSeconds(null);
      if (total <= 0) return;
      held.current = { ratio, until: Date.now() + SEEK_HOLD_MS };
      seek.current(ratio * total);
    },
    [total],
  );

  /** A touch that was taken away rather than released: put everything back. */
  const abandon = useCallback(() => {
    setScrubSeconds(null);
    progress.value = reported.current;
  }, [progress]);

  const showScrub = useCallback((ratio: number) => setScrubSeconds(ratio * total), [total]);
  // A plain function reference for runOnJS; the haptics object itself
  // shouldn't be captured into the worklet.
  const tick = useCallback(() => haptics.tick(), []);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(total > 0 && width > 0)
        .minDistance(0)
        .hitSlop({ top: 14, bottom: 14 })
        .onBegin((event) => {
          dragging.value = true;
          ended.value = false;
          const ratio = Math.min(1, Math.max(0, event.x / width));
          progress.value = ratio;
          lastDecile.value = Math.floor(ratio * 10);
          runOnJS(showScrub)(ratio);
        })
        .onUpdate((event) => {
          const ratio = Math.min(1, Math.max(0, event.x / width));
          progress.value = ratio;
          const decile = Math.floor(ratio * 10);
          if (decile !== lastDecile.value) {
            lastDecile.value = decile;
            runOnJS(tick)();
          }
          runOnJS(showScrub)(ratio);
        })
        .onEnd((_event, success) => {
          ended.value = true;
          if (success) runOnJS(commit)(progress.value);
          else runOnJS(abandon)();
        })
        .onFinalize((event) => {
          // A touch that never moved never became a drag, so onEnd didn't
          // run for it — and the time it had been showing since touch-down
          // stayed on the readout for good. Lifted in place, it is a tap:
          // seek there. Taken away by something else, put things back.
          if (!ended.value) {
            if (event.state === STATE_FAILED) runOnJS(commit)(progress.value);
            else runOnJS(abandon)();
          }
          dragging.value = false;
        }),
    [total, width, dragging, ended, progress, lastDecile, showScrub, commit, abandon, tick],
  );

  const ticks = useMemo(() => {
    if (width <= 0) return [];
    const count = Math.max(2, Math.floor(width / TICK_SPACING));
    const step = (width - 1.5) / count;
    return Array.from({ length: count + 1 }, (_, i) => ({
      x: i * step,
      major: i % MAJOR_EVERY === 0 || i === count,
    }));
  }, [width]);

  // The lit layer is revealed by sliding its clip in from the left while
  // sliding the ticks inside it the other way, so they stay put on screen.
  // Both end short of the handle by the gap; the remaining track starts
  // just past it, so the played wave never sits over a straight line.
  const clipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(1 - progress.value) * width - HANDLE_GAP }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * width + HANDLE_GAP }],
  }));
  const restStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * width + HANDLE_GAP + 2 }],
  }));
  const headStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * width - 1 }],
  }));

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  // --- The wave ------------------------------------------------------------

  // Waving while playing; flattened (and, under Reduce motion, never raised).
  const waveOn = playing && !reduce;
  const waving = useSharedValue(waveOn ? 1 : 0);
  useEffect(() => {
    waving.value = withSpring(waveOn ? 1 : 0, springs.effects);
  }, [waveOn, waving, springs]);
  const waveStyle = useAnimatedStyle(() => ({
    opacity: waving.value,
    transform: [{ scaleY: 0.2 + 0.8 * waving.value }],
  }));
  const flatStyle = useAnimatedStyle(() => ({ opacity: 1 - waving.value }));

  // Its travel: one wavelength, looped, on the native driver. Running only
  // while it can be seen — the player up, nothing over it.
  const onScreen = usePlayerUiStore((state) => state.open && !state.queueOpen && !state.lyricsOpen);
  const travelling = waveOn && width > 0 && (onScreen || tone !== 'onArtwork');
  const phase = useRef(new NativeAnimated.Value(0)).current;
  useEffect(() => {
    if (!travelling) return;
    phase.setValue(0);
    const loop = NativeAnimated.loop(
      NativeAnimated.timing(phase, {
        toValue: 1,
        duration: WAVE_PERIOD_MS,
        easing: NativeEasing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [travelling, phase]);
  const waveShift = useMemo(
    () => phase.interpolate({ inputRange: [0, 1], outputRange: [0, -WAVELENGTH] }),
    [phase],
  );
  const wavePath = useMemo(() => (width > 0 ? buildWave(width + WAVELENGTH * 2) : ''), [width]);

  const shown = scrubSeconds ?? Math.min(position, total || position);
  const remaining = Math.max(0, total - shown);

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View style={styles.hit} onLayout={onLayout}>
          <View style={styles.ruler}>
            <Ticks ticks={ticks} width={width} color={dim} />
            {/* What is left: a straight track ending in a stop dot. */}
            <Animated.View style={[styles.track, { backgroundColor: track }, restStyle]} />
            <View style={[styles.stopDot, { backgroundColor: lit }]} />
            {/* What has played: revealed by the clip, a wave while playing. */}
            <Animated.View style={[styles.clip, clipStyle]}>
              <Animated.View style={[StyleSheet.absoluteFill, innerStyle]}>
                <Ticks ticks={ticks} width={width} color={withAlpha(lit, 0.55)} />
                <Animated.View style={[styles.track, { backgroundColor: lit }, flatStyle]} />
                {width > 0 && (
                  <Animated.View style={[styles.wave, waveStyle]}>
                    <NativeAnimated.View style={{ transform: [{ translateX: waveShift }] }}>
                      <Svg width={width + WAVELENGTH * 2} height={RULER_HEIGHT}>
                        <Path
                          d={wavePath}
                          stroke={lit}
                          strokeWidth={TRACK_STROKE}
                          strokeLinecap="round"
                          fill="none"
                        />
                      </Svg>
                    </NativeAnimated.View>
                  </Animated.View>
                )}
              </Animated.View>
            </Animated.View>
          </View>
          {width > 0 && (
            <Animated.View pointerEvents="none" style={[styles.head, headStyle]}>
              <View style={[styles.handle, { backgroundColor: lit }]} />
            </Animated.View>
          )}
        </View>
      </GestureDetector>

      <View style={styles.times}>
        <Text style={[type.mono, styles.time, { color: scrubSeconds != null ? lit : textColor }]}>
          {formatDuration(shown)}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={showRemaining ? 'Show total length' : 'Show time remaining'}
          hitSlop={10}
          onPress={() => setShowRemaining((value) => !value)}
        >
          <Text style={[type.mono, styles.time, { color: textColor }]}>
            {showRemaining ? `-${formatDuration(remaining)}` : formatDuration(total)}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

const Ticks = memo(function Ticks({
  ticks,
  width,
  color,
}: {
  ticks: { x: number; major: boolean }[];
  width: number;
  color: string;
}) {
  if (width <= 0) return null;
  return (
    <Svg width={width} height={RULER_HEIGHT} style={StyleSheet.absoluteFill}>
      {ticks.map((tick, index) => (
        <Rect
          key={index}
          x={tick.x}
          y={RULER_HEIGHT - (tick.major ? MAJOR : MINOR)}
          width={1.5}
          height={tick.major ? MAJOR : MINOR}
          fill={color}
        />
      ))}
    </Svg>
  );
});

/**
 * A sine wave along the track's centre line, `length` wide, as smooth
 * quadratic humps — one control point per half wavelength, each reflected
 * from the last, so it stays a short path however wide the bar is.
 */
function buildWave(length: number): string {
  const half = WAVELENGTH / 2;
  // A quadratic's peak sits halfway to its control point.
  let d = `M 0 ${TRACK_Y} Q ${half / 2} ${TRACK_Y - WAVE_AMPLITUDE * 2} ${half} ${TRACK_Y}`;
  for (let x = half * 2; x <= length + half; x += half) d += ` T ${x} ${TRACK_Y}`;
  return d;
}

const styles = StyleSheet.create({
  hit: { height: RULER_HEIGHT + 10, justifyContent: 'flex-end' },
  ruler: { height: RULER_HEIGHT, overflow: 'hidden' },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: TRACK_Y - TRACK_STROKE / 2,
    height: TRACK_STROKE,
    borderRadius: TRACK_STROKE / 2,
  },
  stopDot: {
    position: 'absolute',
    right: 0,
    top: TRACK_Y - STOP_DOT / 2,
    width: STOP_DOT,
    height: STOP_DOT,
    borderRadius: STOP_DOT / 2,
  },
  wave: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  clip: { position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0, overflow: 'hidden' },
  head: {
    position: 'absolute',
    left: 0,
    bottom: RULER_HEIGHT - TRACK_Y - HANDLE_HEIGHT / 2,
    alignItems: 'center',
    width: 2,
  },
  /** Material 3 Expressive's slider handle: a slim upright bar. */
  handle: { width: 4, height: HANDLE_HEIGHT, borderRadius: 2 },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  time: { fontSize: 11.5 },
});
