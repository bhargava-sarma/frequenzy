import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import Svg, { Rect } from 'react-native-svg';

import { type, withAlpha } from '../theme/tokens';
import { useTheme } from '../theme/ThemeProvider';
import { haptics } from '../utils/haptics';
import { formatDuration } from '../utils/time';

/**
 * Playback position as a ruler, the way a tape machine's counter strip reads.
 *
 * Ticks run the width; the ones already played light up in the accent and a
 * playhead marks the spot. The playhead steps with the player's once-a-second
 * reports, the way a counter does — at this width a step is a point or two,
 * so smoothing it would be a 60fps animation nobody could see. The lit ticks
 * are revealed by translating a clip rather than resizing anything.
 *
 * Scrubbing follows the finger and clicks at each tenth of the track. The
 * seeked position is held until the player confirms it, so the playhead
 * never jumps back to the old time for a beat after you let go.
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

export const ScrubBar = memo(function ScrubBar({
  position,
  duration,
  onSeek,
  tone = 'default',
}: ScrubBarProps) {
  const color = useTheme();
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
  const lastDecile = useSharedValue(-1);
  const held = useRef<{ ratio: number; until: number } | null>(null);

  // Follow the player, unless a drag or a fresh seek says otherwise.
  useEffect(() => {
    if (dragging.value || total <= 0) {
      if (total <= 0) progress.value = 0;
      return;
    }
    const ratio = Math.min(1, Math.max(0, position / total));

    const hold = held.current;
    if (hold) {
      const confirmed = Math.abs(ratio - hold.ratio) * total < 2;
      if (!confirmed && Date.now() < hold.until) return;
      held.current = null;
    }

    progress.value = ratio;
  }, [position, total, progress, dragging]);

  const commit = useCallback(
    (ratio: number) => {
      setScrubSeconds(null);
      if (total <= 0) return;
      held.current = { ratio, until: Date.now() + SEEK_HOLD_MS };
      onSeek(ratio * total);
    },
    [onSeek, total],
  );

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
        .onEnd(() => {
          runOnJS(commit)(progress.value);
        })
        .onFinalize(() => {
          dragging.value = false;
        }),
    [total, width, dragging, progress, lastDecile, showScrub, commit, tick],
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
