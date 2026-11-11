import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

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
 */
export interface ScrubBarProps {
  position: number;
  duration: number;
  onSeek: (seconds: number) => void;
  /** Over artwork: white ticks instead of the theme's. */
  tone?: 'default' | 'onArtwork';
}

const RULER_HEIGHT = 26;
const TICK_SPACING = 6;
const MINOR = 7;
const MAJOR = 15;
const MAJOR_EVERY = 8;
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
}: ScrubBarProps) {
  const color = useTheme();
  const { reduce } = useMotion();
  const onArt = tone === 'onArtwork';
  const dim = onArt ? withAlpha(color.onArtwork, 0.28) : color.border;
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
  const clipStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -(1 - progress.value) * width }],
  }));
  const innerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * width }],
  }));
  const headStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * width - 1 }],
  }));

  const onLayout = useCallback((event: LayoutChangeEvent) => {
    setWidth(Math.round(event.nativeEvent.layout.width));
  }, []);

  const shown = scrubSeconds ?? Math.min(position, total || position);
  const remaining = Math.max(0, total - shown);

  return (
    <View>
      <GestureDetector gesture={pan}>
        <View style={styles.hit} onLayout={onLayout}>
          <View style={styles.ruler}>
            <Ticks ticks={ticks} width={width} color={dim} />
            <Animated.View style={[styles.clip, clipStyle]}>
              <Animated.View style={[StyleSheet.absoluteFill, innerStyle]}>
                <Ticks ticks={ticks} width={width} color={lit} />
              </Animated.View>
            </Animated.View>
          </View>
          {width > 0 && (
            <Animated.View pointerEvents="none" style={[styles.head, headStyle]}>
              <View style={[styles.headCap, { backgroundColor: lit }]} />
              <View style={[styles.headLine, { backgroundColor: lit }]} />
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

const styles = StyleSheet.create({
  hit: { height: RULER_HEIGHT + 10, justifyContent: 'flex-end' },
  ruler: { height: RULER_HEIGHT, overflow: 'hidden' },
  clip: { position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0, overflow: 'hidden' },
  head: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    alignItems: 'center',
    width: 2,
  },
  headCap: { width: 8, height: 8, borderRadius: 2, marginBottom: 1 },
  headLine: { width: 2, height: RULER_HEIGHT },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  time: { fontSize: 11.5 },
});
