import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import TrackPlayer, { useActiveMediaItem, useProgress } from '@rntp/player';

import { AmbientBackground } from '../components/AmbientBackground';
import { Button } from '../components/Button';
import { ScreenHeader } from '../components/ScreenHeader';
import { EmptyState } from '../components/ScreenState';
import { activeLineIndex } from '../api/lrclib';
import { useLyrics } from '../hooks/useLyrics';
import { usePlayerUiStore } from '../store/usePlayerUiStore';
import { romanizeLine } from '../utils/romanize';
import { layout, motion, space, type } from '../theme/tokens';
import type { Palette } from '../theme/tokens';
import { useTheme, useThemedStyles } from '../theme/ThemeProvider';

/**
 * Lyrics, following the track.
 *
 * Timed lines come from LRCLIB. The active line is the only thing on screen
 * in the accent colour, which is the one-accent-for-meaning rule doing real
 * work: it marks where you are, and nothing else on the panel competes.
 *
 * Lines are tappable and seek. A lyric sheet already answers "where am I",
 * and once it does, "take me back to that bit" is the obvious next thing to
 * want — the same reasoning that makes the progress bar draggable.
 */

/** Progress tick. Finer than the player's 1s, or lines land visibly late. */
const TICK_SECONDS = 0.25;

/**
 * How long auto-scroll stands down after you scroll by hand.
 *
 * Without this, reading ahead is impossible: the next tick drags the view
 * straight back to the current line and the gesture feels broken.
 */
const MANUAL_SCROLL_GRACE_MS = 5000;

/**
 * Line handover. Longer than the app's other motion on purpose.
 *
 * Everything else here is UI acknowledging a press and wants to read as
 * instant. This is following a voice, and at 120ms the change reads as a
 * flicker between two states rather than as one line giving way to the next.
 */
const LINE_FADE_MS = 260;

const TIMING = {
  duration: LINE_FADE_MS,
  easing: Easing.bezier(...motion.easing),
};

/** Inactive lines sit back rather than disappearing — you can still read ahead. */
const INACTIVE_OPACITY = 0.38;

export function LyricsScreen() {
  const color = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const closeLyrics = usePlayerUiStore((state) => state.closeLyrics);

  const activeItem = useActiveMediaItem();
  const { position } = useProgress(TICK_SECONDS);
  const { status, lyrics, retry } = useLyrics(activeItem);

  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef<Record<number, number>>({});
  const viewportHeight = useRef(0);
  const manualUntil = useRef(0);

  const [showRoman, setShowRoman] = useState(true);

  const lines = useMemo(() => lyrics?.lines ?? [], [lyrics]);
  const synced = Boolean(lyrics?.synced);

  /**
   * Romanised twice-over is wasteful, so it is computed once per lyric sheet
   * rather than per render or per progress tick — this runs over every line
   * and the progress tick fires four times a second.
   */
  const roman = useMemo(() => lines.map((line) => romanizeLine(line.text)), [lines]);
  const hasRoman = useMemo(() => roman.some(Boolean), [roman]);

  const romanPlain = useMemo(
    () => (lyrics?.plain ? romanizeLine(lyrics.plain) : null),
    [lyrics],
  );

  const index = useMemo(
    () => (synced ? activeLineIndex(lines, position) : -1),
    [synced, lines, position],
  );

  // Reset recorded geometry when the words change, or the next track's scroll
  // would be aimed using the previous track's line positions.
  useEffect(() => {
    offsets.current = {};
    manualUntil.current = 0;
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [lyrics]);

  useEffect(() => {
    if (index < 0 || !synced) return;
    if (Date.now() < manualUntil.current) return;

    const y = offsets.current[index];
    if (y == null || viewportHeight.current === 0) return;

    // Centred rather than pinned to the top: the lines after the current one
    // are the ones you are about to sing, and they need to be on screen.
    scrollRef.current?.scrollTo({
      y: Math.max(0, y - viewportHeight.current / 2),
      animated: true,
    });
  }, [index, synced]);

  const onLineLayout = useCallback((i: number, y: number) => {
    offsets.current[i] = y;
  }, []);

  const seekTo = useCallback((seconds: number) => {
    TrackPlayer.seekTo(seconds);
  }, []);

  const body = () => {
    if (status === 'loading' || status === 'idle') {
      return <EmptyState label="Looking for lyrics" />;
    }

    if (status === 'error') {
      return (
        <View style={styles.state}>
          <EmptyState
            label="Couldn't reach LRCLIB"
            hint="Lyrics come from a community database, separate from your server."
          />
          <View style={styles.retry}>
            <Button label="Try again" onPress={retry} />
          </View>
        </View>
      );
    }

    if (lyrics?.instrumental) {
      return <EmptyState label="Instrumental" hint="This recording has no words." />;
    }

    if (status === 'none' || (!lyrics?.plain && lines.length === 0)) {
      return (
        <View style={styles.state}>
          <EmptyState
            label="No lyrics found"
            hint="LRCLIB doesn't have this track. Tags that differ from the release can be the cause."
          />
          <View style={styles.retry}>
            <Button label="Look again" onPress={retry} />
          </View>
        </View>
      );
    }

    // Unsynced: a plain sheet, with no pretence of following along.
    if (!synced) {
      return (
        <View style={styles.plainBlock}>
          <Text style={styles.unsyncedNote}>Not time-synced</Text>
          <Text style={styles.plain} selectable>
            {lyrics?.plain}
          </Text>
          {showRoman && romanPlain && (
            <Text style={styles.plainRoman} selectable>
              {romanPlain}
            </Text>
          )}
        </View>
      );
    }

    return (
      <>
        {lines.map((line, i) => {
          // Blank LRC lines are the instrumental gaps. They keep their slot so
          // the previous line doesn't sit lit through the whole break, but
          // there is nothing to read and nothing to press.
          if (!line.text) {
            return (
              <View
                key={i}
                style={styles.gap}
                onLayout={(e) => onLineLayout(i, e.nativeEvent.layout.y)}
              />
            );
          }

          return (
            <LyricRow
              key={i}
              index={i}
              text={line.text}
              roman={showRoman ? roman[i] : null}
              time={line.time}
              active={i === index}
              styles={styles}
              idleColor={color.textSecondary}
              activeColor={color.accent}
              onLayout={onLineLayout}
              onSeek={seekTo}
            />
          );
        })}
      </>
    );
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <AmbientBackground />

      <ScreenHeader
        title="Lyrics"
        onBack={closeLyrics}
        action={
          hasRoman ? (
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: showRoman }}
              accessibilityLabel="Show romanised lyrics"
              hitSlop={space[3]}
              onPress={() => setShowRoman((on) => !on)}
            >
              <Text
                style={[
                  styles.toggle,
                  { color: showRoman ? color.accent : color.textSecondary },
                ]}
              >
                Romanised
              </Text>
            </Pressable>
          ) : synced ? (
            <Text style={styles.source}>LRCLIB</Text>
          ) : undefined
        }
      />

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        onLayout={(e) => {
          viewportHeight.current = e.nativeEvent.layout.height;
        }}
        onScrollBeginDrag={() => {
          manualUntil.current = Date.now() + MANUAL_SCROLL_GRACE_MS;
        }}
        scrollEventThrottle={16}
      >
        {body()}
      </ScrollView>
    </View>
  );
}

/**
 * One line, which lifts as it becomes current.
 *
 * Memoised on `active` so a progress tick re-renders the two lines that
 * changed rather than all of them — at four ticks a second across a few
 * hundred lines, that is the difference between smooth and not.
 *
 * The animation runs on the UI thread through Reanimated, so it keeps its
 * timing even while the JS thread is busy fetching the next track's artwork.
 * Opacity, scale and colour move together over one curve: three properties
 * on separate timings read as three things happening, not one line arriving.
 */
const LyricRow = memo(function LyricRow({
  index,
  text,
  roman,
  time,
  active,
  styles,
  idleColor,
  activeColor,
  onLayout,
  onSeek,
}: {
  index: number;
  text: string;
  roman: string | null;
  time: number;
  active: boolean;
  styles: ReturnType<typeof makeStyles>;
  idleColor: string;
  activeColor: string;
  onLayout: (index: number, y: number) => void;
  onSeek: (seconds: number) => void;
}) {
  const lit = useSharedValue(active ? 1 : 0);

  useEffect(() => {
    lit.value = withTiming(active ? 1 : 0, TIMING);
  }, [active, lit]);

  const textStyle = useAnimatedStyle(() => ({
    color: interpolateColor(lit.value, [0, 1], [idleColor, activeColor]),
    opacity: interpolate(lit.value, [0, 1], [INACTIVE_OPACITY, 1]),
    // Barely there. The spec rules out bounce, and a line that visibly grows
    // reads as a button press rather than as the song moving on.
    transform: [{ scale: interpolate(lit.value, [0, 1], [0.98, 1]) }],
  }));

  const romanStyle = useAnimatedStyle(() => ({
    opacity: interpolate(lit.value, [0, 1], [INACTIVE_OPACITY * 0.8, 0.75]),
  }));

  return (
    <Pressable
      onPress={() => onSeek(time)}
      onLayout={(e) => onLayout(index, e.nativeEvent.layout.y)}
      accessibilityRole="button"
      accessibilityLabel={`Play from "${text}"`}
      style={styles.linePress}
    >
      <Animated.Text style={[styles.line, textStyle]}>{text}</Animated.Text>
      {roman && (
        <Animated.Text style={[styles.roman, romanStyle]} numberOfLines={2}>
          {roman}
        </Animated.Text>
      )}
    </Pressable>
  );
});

const makeStyles = (color: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: color.paper },
    content: {
      paddingHorizontal: layout.screenPadding,
      // Half a screen of slack at each end so the first and last lines can
      // still reach the middle when centred.
      paddingTop: space[6],
      paddingBottom: space[6] * 6,
      flexGrow: 1,
    },

    linePress: { paddingVertical: space[2] },
    line: { ...type.title, fontSize: 19, lineHeight: 28 },
    roman: {
      ...type.meta,
      fontSize: 13,
      lineHeight: 19,
      color: color.textSecondary,
      marginTop: space[1],
    },
    gap: { height: space[5] },

    plainBlock: { paddingTop: space[2] },
    plain: { ...type.body, fontSize: 16, lineHeight: 26, color: color.textPrimary },
    plainRoman: {
      ...type.meta,
      fontSize: 14,
      lineHeight: 23,
      color: color.textSecondary,
      marginTop: space[5],
    },
    unsyncedNote: {
      ...type.label,
      color: color.textSecondary,
      marginBottom: space[4],
    },

    source: { ...type.label, color: color.textSecondary },
    toggle: { ...type.label },
    state: { flexGrow: 1, justifyContent: 'center' },
    retry: { alignItems: 'center', marginTop: space[4] },
  });
